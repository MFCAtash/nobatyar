# تست E2E (Playwright) و بار (k6)

## پیش‌نیاز مشترک — hook های تست (فقط غیر production)
API را با این متغیرها بالا بیاورید (CI همین کار را می‌کند):
```bash
NODE_ENV=test SMS_PROVIDER=memory E2E_TEST_HOOKS=true       # OTP در حافظه + /api/v1/__e2e/*
OTP_PER_IP_HOURLY=100000 OTP_PER_PHONE_HOURLY=100000 OTP_RESEND_COOLDOWN_SEC=0 VERIFY_PER_IP_10MIN=100000 REFRESH_PER_IP_10MIN=100000
CORS_ORIGINS=http://localhost:3001 WEB_ORIGIN=http://localhost:3001 ALLOWED_CALLBACK_ORIGINS=http://localhost:3001
# درگاه: بدون تنظیم، sandbox (جعلی) است
```
**Fail-closed:** در `NODE_ENV=production` هر یک از `E2E_TEST_HOOKS=true`، `SMS_PROVIDER=memory` یا `console` ⇒ API بالا نمی‌آید (`auth.config.ts`، تست‌شده در `push.test.ts`). کنترلر hook ها در production حتی ساخته نمی‌شود.
hook ها: `GET /__e2e/otp?phone=` (کد یک‌بارمصرف)، `POST /__e2e/doctor` (پزشک تأییدشده با برنامه‌ی ۰۶–۲۳ همه‌ی روزها).

## Playwright — فقط مسیرهای حیاتی (`apps/e2e`)
| spec | چه چیزی را ثابت می‌کند |
|---|---|
| `critical-path` | ورود با OTP + ثبت‌نام، کد اشتباه رد می‌شود، جستجو، رزرو، پرداخت sandbox (تأیید سمت سرور)، چت بلادرنگ دوطرفه و تاریخچه پس از reload |
| `payment-forgery` | بازگشت جعلی `Status=OK` با Authority ی ساختگی پرداخت را تأیید **نمی‌کند**؛ نوبت «در انتظار پرداخت» می‌ماند |
| `pwa` | manifest معتبر؛ SW فقط مسیرهای allowlist ی استاتیک را cache می‌کند (هیچ `/api/` یا صفحه‌ای)؛ قطعی شبکه ⇒ صفحه‌ی آفلاین ثابت |

```bash
pnpm install && pnpm --filter @nobatyar/e2e e2e:install
# API (با env بالا) و وب (build ی production برای تست SW):  pnpm --filter @nobatyar/web build && next start -p 3001
pnpm --filter @nobatyar/e2e e2e            # E2E_BASE_URL=http://localhost:3001
```
تست‌های `pwa` فقط با build ی production اجرا می‌شوند (SW در dev ثبت نمی‌شود؛ `NEXT_PUBLIC_PWA_DEV=true` برای dev).

## k6 — «۵۰ کاربر هم‌زمان، یک نوبت» (`load/`)
نتیجه‌ی درست: **یک ۲۰۱، ۴۹ تا ۴۰۹ (`slot_taken`)، صفر ۵xx، و دقیقاً یک نوبت در تقویم پزشک.** چهار threshold (`booking_success==1`، `booking_conflict_409==49`، `booking_unexpected==0`، `double_booking_detected==0`) در صورت نقض، job ی CI را قرمز می‌کنند.
همه‌ی VU ها پس از setup (۵۰ ورود OTP و رضایت‌نامه) در یک لحظه‌ی مشترک شروع می‌کنند؛ مرجع نهایی همان قید `EXCLUDE` ی Postgres است، نه کد برنامه.
```bash
docker run --rm -i --network host -e BASE_URL=http://localhost:3000/api/v1 -e USERS=50 -v "$PWD/load:/load" grafana/k6:0.54.0 run /load/double-booking.js
```

## CI
job ی `e2e-load` (در `ci-gate`): build ← DB ← API+Web ← k6 ← Playwright؛ گزارش و لاگ‌ها artifact می‌شوند.

## راستی‌آزمایی
✅ اجرا شد در محیط ساخت: تست‌های واحد (scrub، sw-policy، push، sentry، config). ❌ اجرا نشد (Postgres/Redis/Docker/مرورگر/اینترنت نبود): Playwright، k6، مهاجرت‌ها. انتخابگرهای Playwright از روی سورس UI نوشته شد؛ **اولین اجرای CI ممکن است نیاز به اصلاح جزئی انتخابگرها داشته باشد.** k6 فقط بررسی نحو شد.
