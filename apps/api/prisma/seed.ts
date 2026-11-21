/**
 * seed دیتابیس. اجرا: pnpm db:seed (با DATABASE_URL مالک).
 *
 *  - تخصص‌ها: همیشه (idempotent؛ upsert).
 *  - دادهٔ نمایشی کامل (درمانگاه‌ها، پزشکان متخصص، بیماران و نوبت‌های پیش‌فرض): فقط در غیر production.
 *    منبع داده: src/admin/demo-data.ts · منطق: prisma/seed-demo.ts
 *  - production: هرگز کاربر نمونه نمی‌سازد؛ اگر در دیتابیس کاربر نمونه‌ای پیدا کند با کد خروج ۱ شکست می‌خورد.
 *    ادمین واقعیِ اول با `create-admin` ساخته می‌شود (docs/deployment.md).
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { aad, FieldCrypto } from "../src/crypto/field-crypto";
import { normalizeIranMobile } from "../src/crypto/phone";
import { demoPhonesNormalized, planSeed } from "../src/admin/bootstrap-policy";
import { SPECIALTIES } from "../src/admin/demo-data";
import { seedDemoRoster } from "./seed-demo";

const prisma = new PrismaClient();

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** کاربر نمونه در دیتابیس هست؟ (فقط وقتی کلیدهای رمزنگاری در دسترس باشند قابل تشخیص است.) */
async function demoUsersPresent(tx: Tx, crypto: FieldCrypto): Promise<number> {
  const hashes = demoPhonesNormalized().map((p) => crypto.blindIndex(p, "phone"));
  return tx.user.count({ where: { phoneHash: { in: hashes } } });
}

/** ادمین نمایشی؛ در roster پزشک/بیمار نیست و فقط یک‌بار ساخته می‌شود. */
async function ensureDemoAdmin(tx: Tx, crypto: FieldCrypto): Promise<void> {
  const norm = normalizeIranMobile("09120000003")!;
  const phoneHash = crypto.blindIndex(norm, "phone");
  const existing = await tx.user.findUnique({ where: { phoneHash }, select: { id: true, role: true } });
  if (existing) {
    if (existing.role !== "ADMIN") await tx.user.update({ where: { id: existing.id }, data: { role: "ADMIN", status: "ACTIVE" } });
    return;
  }
  const id = randomUUID();
  await tx.user.create({ data: { id, role: "ADMIN", phoneHash, phoneEnc: crypto.encrypt(norm, aad("users", id, "phone")) } });
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
          `${n} کاربر نمونه‌ی توسعه در دیتابیس production پیدا شد (شماره‌های 091200000xx). آن‌ها را غیرفعال/حذف کنید و ورودشان را باطل کنید؛ سپس دوباره اجرا کنید.`,
        );
      }
      return;
    }

    if (!plan.demoUsers || !crypto) return console.log("demo users skipped (SEED_DEMO_USERS=false)");

    await ensureDemoAdmin(tx, crypto);
    await seedDemoRoster(tx, crypto);
  });
}

main()
  .catch((e) => {
    console.error(`✗ seed failed: ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
