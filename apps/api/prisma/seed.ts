/**
 * seed دیتابیس. اجرا: pnpm db:seed (با DATABASE_URL مالک).
 *
 *  - تخصص‌ها: همیشه (idempotent؛ upsert).
 *  - کاربران نمونه‌ی توسعه (دکتر/بیمار/ادمین با شماره‌های ثابت و عمومی): فقط در غیر production (src/admin/bootstrap-policy.ts).
 *  - production: هرگز کاربر نمونه نمی‌سازد؛ اگر در دیتابیس کاربر نمونه‌ای پیدا کند با کد خروج ۱ شکست می‌خورد.
 *    ادمین واقعیِ اول با `create-admin` ساخته می‌شود (docs/deployment.md).
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { aad, FieldCrypto } from "../src/crypto/field-crypto";
import { normalizeIranMobile } from "../src/crypto/phone";
import { demoPhonesNormalized, planSeed } from "../src/admin/bootstrap-policy";

const prisma = new PrismaClient();

const SPECIALTIES = [
  ["general", "پزشک عمومی"],
  ["cardiology", "قلب و عروق"],
  ["dermatology", "پوست و مو"],
  ["pediatrics", "کودکان"],
  // فاز ۸: هم‌خوان با کاتالوگ triage
  ["internal", "داخلی"], ["neurology", "مغز و اعصاب"], ["gastroenterology", "گوارش و کبد"], ["orthopedics", "ارتوپدی"],
  ["ent", "گوش، حلق و بینی"], ["urology", "کلیه و مجاری ادراری"], ["gynecology", "زنان و زایمان"], ["psychiatry", "روان‌پزشکی"],
  ["ophthalmology", "چشم‌پزشکی"], ["endocrinology", "غدد و متابولیسم"],
] as const;

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

async function createUser(tx: Tx, crypto: FieldCrypto, phone: string, role: "PATIENT" | "DOCTOR" | "ADMIN") {
  const norm = normalizeIranMobile(phone)!;
  const id = randomUUID();
  return tx.user.create({
    data: { id, role, phoneHash: crypto.blindIndex(norm, "phone"), phoneEnc: crypto.encrypt(norm, aad("users", id, "phone")) },
  });
}

/** کاربر نمونه در دیتابیس هست؟ (فقط وقتی کلیدهای رمزنگاری در دسترس باشند قابل تشخیص است.) */
async function demoUsersPresent(tx: Tx, crypto: FieldCrypto): Promise<number> {
  const hashes = demoPhonesNormalized().map((p) => crypto.blindIndex(p, "phone"));
  return tx.user.count({ where: { phoneHash: { in: hashes } } });
}

async function main() {
  const plan = planSeed(process.env); // production + SEED_DEMO_USERS=true ⇒ throw
  const prod = process.env.NODE_ENV === "production";
  let crypto: FieldCrypto | null = null;
  try {
    crypto = FieldCrypto.fromEnv();
  } catch {
    if (plan.demoUsers) throw new Error("FIELD_KEYS / FIELD_KEY_ACTIVE / BLIND_INDEX_KEY لازم است (gen:keys)");
  }

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.role', 'SYSTEM', true)`;

    for (const [slug, nameFa] of SPECIALTIES) {
      await tx.specialty.upsert({ where: { slug }, update: {}, create: { slug, nameFa } });
    }
    console.log(`specialties: ${SPECIALTIES.length} ensured`);

    if (prod) {
      if (!crypto) {
        console.warn("⚠ کلیدهای رمزنگاری در این job نیست؛ وجود کاربران نمونه در production بررسی نشد.");
        return;
      }
      const n = await demoUsersPresent(tx, crypto);
      if (n > 0) {
        throw new Error(
          `${n} کاربر نمونه‌ی توسعه در دیتابیس production پیدا شد (شماره‌های 0912000000x). آن‌ها را غیرفعال/حذف کنید و ورودشان را باطل کنید؛ سپس دوباره اجرا کنید.`,
        );
      }
      return;
    }

    if (!plan.demoUsers || !crypto) return console.log("demo users skipped (SEED_DEMO_USERS=false)");
    if ((await demoUsersPresent(tx, crypto)) > 0) return console.log("demo users already applied");

    const doc = await createUser(tx, crypto, "09120000001", "DOCTOR");
    await tx.doctorProfile.create({ data: { userId: doc.id, fullName: "دکتر نمونه", consultationFeeRial: 3_000_000n, isListed: true } });
    const pat = await createUser(tx, crypto, "09120000002", "PATIENT");
    await tx.patientProfile.create({ data: { userId: pat.id, fullName: "بیمار نمونه" } });
    await createUser(tx, crypto, "09120000003", "ADMIN");
    console.log("seeded demo users: 1 doctor, 1 patient, 1 admin (synthetic, dev only)");
  });
}

main()
  .catch((e) => {
    console.error(`✗ seed failed: ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
