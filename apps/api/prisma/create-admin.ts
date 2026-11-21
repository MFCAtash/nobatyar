/**
 * ساخت «ادمین اولیه»ی واقعی (یک‌بار، توسط اپراتور). جایگزین ادمین ثابتِ seed.
 *
 *   ADMIN_PHONE=09xxxxxxxxx ADMIN_PHONE_CONFIRM=09xxxxxxxxx  sh scripts/migrate-deploy.sh create-admin
 *   (در Docker: docs/deployment.md — dc run --rm -e ADMIN_PHONE=… -e ADMIN_PHONE_CONFIRM=… create-admin)
 *
 * رفتار:
 *  - شماره باید دو بار و یکسان داده شود؛ شماره‌ی نمونه/ساختگی رد می‌شود.
 *  - کاربری با همین شماره: ادمین فعال ⇒ بدون تغییر؛ غیر ادمین ⇒ خطا مگر ADMIN_PROMOTE_EXISTING=true (ارتقا ثبت در Audit می‌شود).
 *  - هر ساخت/ارتقا در زنجیره‌ی Audit ثبت می‌شود. هیچ مقدار شماره‌ای چاپ/ثبت نمی‌شود (فقط ۴ رقم آخر).
 *  - ورود: OTP پیامکی به همان شماره؛ MFA ادمین هنوز پیاده نشده (docs/phase-14-critical-fixes.md) ⇒ شماره باید در اختیار خود اپراتور باشد.
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { aad, FieldCrypto } from "../src/crypto/field-crypto";
import { ADMIN_PHONE_ERRORS, checkAdminPhone, demoPhonesNormalized } from "../src/admin/bootstrap-policy";

const prisma = new PrismaClient();

async function main() {
  const chk = checkAdminPhone(process.env.ADMIN_PHONE, process.env.ADMIN_PHONE_CONFIRM);
  if (!chk.ok) throw new Error(ADMIN_PHONE_ERRORS[chk.reason]);
  const crypto = FieldCrypto.fromEnv();
  const phoneHash = crypto.blindIndex(chk.phone, "phone");
  const tail = chk.phone.slice(-4);
  const promote = process.env.ADMIN_PROMOTE_EXISTING === "true";

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.role', 'SYSTEM', true)`;

    if (process.env.NODE_ENV === "production") {
      const demo = await tx.user.count({ where: { phoneHash: { in: demoPhonesNormalized().map((p) => crypto.blindIndex(p, "phone")) } } });
      if (demo > 0) console.warn(`⚠ ${demo} کاربر نمونه‌ی توسعه در دیتابیس هست؛ آن‌ها را حذف/غیرفعال کنید (docs/phase-14-critical-fixes.md).`);
    }

    const existing = await tx.user.findUnique({ where: { phoneHash }, select: { id: true, role: true, status: true } });
    if (existing) {
      if (existing.role === "ADMIN" && existing.status === "ACTIVE") return console.log(`admin …${tail} already exists (no change)`);
      if (existing.role === "ADMIN") throw new Error(`کاربر …${tail} ادمین است ولی ACTIVE نیست؛ وضعیت را دستی و با Audit اصلاح کنید`);
      if (!promote) throw new Error(`کاربری با شماره‌ی …${tail} هست (نقش ${existing.role}). برای ارتقا ADMIN_PROMOTE_EXISTING=true بدهید`);
      await tx.user.update({ where: { id: existing.id }, data: { role: "ADMIN" } });
      await tx.auditLog.create({
        data: { actorId: null, actorRole: "SYSTEM", action: "admin.bootstrap_promoted", objectType: "user", objectId: existing.id, meta: { via: "create-admin-cli", previousRole: existing.role } },
      });
      return console.log(`promoted …${tail} to ADMIN`);
    }

    const id = randomUUID();
    await tx.user.create({
      data: { id, role: "ADMIN", phoneHash, phoneEnc: crypto.encrypt(chk.phone, aad("users", id, "phone")) },
    });
    await tx.auditLog.create({
      data: { actorId: null, actorRole: "SYSTEM", action: "admin.bootstrap_created", objectType: "user", objectId: id, meta: { via: "create-admin-cli" } },
    });
    console.log(`admin …${tail} created. Login: OTP to that number.`);
  });
}

main()
  .catch((e) => {
    console.error(`✗ create-admin failed: ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
