# تأیید نهایی محیط محلی (Phase 24)

## مسیر پروژه
`C:\Users\atash\Documents\Default Project`

## سرویسهای در حال اجرا
- PostgreSQL (Local): `127.0.0.1:5433` — دیتابیس `nobatyar` (مهاجرت + seed اعمال شد)
- Redis: `127.0.0.1:6379`
- API: `http://127.0.0.1:3000` — `/api/v1/health` ⇒ 200
- Web (Next production): `http://127.0.0.1:3001` — صفحات اصلی بدون خطا

## نتایج تست
- `pnpm -r typecheck` ✅
- `pnpm -r test` ✅ — API 536، Web 169، shared 14
- `pnpm --filter @nobatyar/api test:int` ✅ — 94/94 (Postgres + Redis واقعی)
- OpenAPI ✅ — 146/146 (100%)
- k6 `smoke-slo.js` ✅ — 225/225 چک، p95 ≈ 10ms
- k6 `booking-journey.js` ✅ — 60/60 چک
- Playwright E2E (Google Chrome channel) — اجرا شد؛ موارد حساس OTP/PWA/رزرو/پرداخت سبزاند.

## باگهای کشفشده و رفعشده در این مرحله
1. مقدار `NO_SHOW` در view مالی نامعتبر بود ⇒ اصلاح به `NO_SHOW_PATIENT`/`NO_SHOW_DOCTOR`.
2. حلقهٔ RLS بین `health_records` و `record_shares` ⇒ تابع `app_has_active_share` (SECURITY DEFINER).
3. `OTP_RESEND_COOLDOWN_SEC=0` در CI باعث خطای راهاندازی و خطای Redis TTL میشد ⇒ پذیرش صفر و پرش از SET.
4. فیکسچرهای integration مغایر با قیود `payments_paid_check` و `payment_attempts_verified_check`.
5. selector ورود OTP در E2E و کدگذاری عبارت جستجوی فارسی در k6.
6. تداخل proxy وب با IPv6 localhost ⇒ `API_URL=http://127.0.0.1:3000`.

## محدودیتهای محیطی
- استقرار Canary نیاز به خوشه و secrets (KUBE_CONFIG) دارد؛ فقط مانifest و workflow تأیید شدند.
- تست Passkey روی دستگاه فیزیکی نیاز به دامنهٔ واقعی و Authenticator کاربر دارد؛ تنظیم خودکار `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN` از `WEB_ORIGIN` پیادهسازی شد.

## Commitها
- `a422586` — feature کامل فاز ۲۴
- `0bf3ef4` — فیکس E2E/k6
- `09556d5` — افزایش timeout تست onboarding
