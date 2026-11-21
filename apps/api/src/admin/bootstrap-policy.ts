import { normalizeIranMobile } from "../crypto/phone";

/**
 * قواعد خالص (بدون I/O) برای seed و ساخت ادمین اولیه — قابل تست و مشترک بین prisma/seed.ts و prisma/create-admin.ts.
 * هدف: هیچ حساب نمونه/پیش‌فرضی در production ساخته نشود و ادمین اولیه فقط با شماره‌ی واقعیِ تأییدشده‌ی اپراتور ساخته شود.
 */

/** شماره‌های کاربران نمونه‌ی توسعه؛ هرگز نباید در production وجود داشته باشند. */
export const DEMO_PHONES = ["09120000001", "09120000002", "09120000003"] as const;

/** نرمال‌شده‌ی شماره‌های نمونه (۹۸۹…). */
export function demoPhonesNormalized(): string[] {
  return DEMO_PHONES.map((p) => normalizeIranMobile(p)!);
}

export interface SeedPlan {
  /** تخصص‌ها (idempotent) — همیشه امن است. */
  specialties: true;
  /** کاربران نمونه — هرگز در production. */
  demoUsers: boolean;
}

/**
 * برنامه‌ی seed از روی محیط:
 *  - production: فقط تخصص‌ها. درخواست صریح SEED_DEMO_USERS=true در production ⇒ خطا (نه نادیده‌گرفتن بی‌صدا).
 *  - غیر production: کاربران نمونه به‌صورت پیش‌فرض ساخته می‌شوند، مگر SEED_DEMO_USERS=false.
 */
export function planSeed(env: Record<string, string | undefined>): SeedPlan {
  const prod = env.NODE_ENV === "production";
  const flag = env.SEED_DEMO_USERS;
  if (flag !== undefined && flag !== "" && flag !== "true" && flag !== "false") {
    throw new Error('SEED_DEMO_USERS must be exactly "true" or "false"');
  }
  if (prod) {
    if (flag === "true") throw new Error("SEED_DEMO_USERS=true is not allowed in production (demo accounts have fixed, public phone numbers)");
    return { specialties: true, demoUsers: false };
  }
  return { specialties: true, demoUsers: flag !== "false" };
}

export type AdminPhoneCheck =
  | { ok: true; phone: string }
  | { ok: false; reason: "missing" | "invalid" | "mismatch" | "demo" | "suspicious" };

/** رقم تکراری ≥۶ بار پشت‌سرهم یا الگوهای پلکانی ساده ⇒ شماره‌ی ساختگی/حدسی. */
function looksFake(national10: string): boolean {
  if (/(\d)\1{5,}/.test(national10)) return true;
  return "0123456789".includes(national10.slice(-7)) || "9876543210".includes(national10.slice(-7));
}

/**
 * اعتبارسنجی شماره‌ی ادمین اولیه. شماره باید دوبار (ADMIN_PHONE و ADMIN_PHONE_CONFIRM) و یکسان وارد شود تا اشتباه تایپی
 * (که OTP را به غریبه می‌فرستد) رخ ندهد؛ شماره‌ی نمونه یا ساختگی پذیرفته نمی‌شود.
 */
export function checkAdminPhone(raw: string | undefined, confirm: string | undefined): AdminPhoneCheck {
  if (!raw?.trim() || !confirm?.trim()) return { ok: false, reason: "missing" };
  const a = normalizeIranMobile(raw);
  const b = normalizeIranMobile(confirm);
  if (!a || !b) return { ok: false, reason: "invalid" };
  if (a !== b) return { ok: false, reason: "mismatch" };
  if (demoPhonesNormalized().includes(a)) return { ok: false, reason: "demo" };
  if (looksFake(a.slice(3))) return { ok: false, reason: "suspicious" };
  return { ok: true, phone: a };
}

export const ADMIN_PHONE_ERRORS: Record<Exclude<AdminPhoneCheck, { ok: true }>["reason"], string> = {
  missing: "ADMIN_PHONE و ADMIN_PHONE_CONFIRM هر دو لازم‌اند (شماره‌ی موبایل واقعیِ ادمین، دو بار)",
  invalid: "شماره‌ی موبایل نامعتبر است (مثال: 09121234567)",
  mismatch: "ADMIN_PHONE و ADMIN_PHONE_CONFIRM یکسان نیستند",
  demo: "شماره‌ی نمونه‌ی توسعه برای ادمین مجاز نیست",
  suspicious: "شماره شبیه شماره‌ی ساختگی/حدسی است (ارقام تکراری یا پلکانی)",
};
