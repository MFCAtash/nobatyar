# بروزرسانی نهایی — ورود دمو و اتوماسیون محدودیتها

## ۱) ورود خودکار دمو (درخواست کاربر)
- بکاند: `apps/api/src/auth/demo.controller.ts`
  - `GET /api/v1/demo/config` و `POST /api/v1/demo/login` و `GET /api/v1/demo/status`
  - **fail-closed**: در `NODE_ENV=production` یا بدون `DEMO_AUTOLOGIN=true` تمام مسیرها 403 میدهند.
  - ورود دقیقاً از `AuthService.issueTokensForUser` و همان JWT/Refresh Cookie استاندارد استفاده میکند؛ هیچ مسیر امنیتی دور زده نمیشود.
  - کاربر دمو از طریق blind-index شمارهٔ تلفن یافت میشود (`DEMO_ROLE` پیشفرض `PATIENT`).
- فرانت: `apps/web/src/components/DemoAutoLogin.tsx`
  - پس از بارگذاری، تنها در صورتی که بکاند اعلام کند دمو فعال است، وارد میشود و `refreshMe()` را فراخوانی میکند.
  - در مرورگر کاربر مشاهده شد: هدر به جای «ورود / ثبتنام» گزینهٔ «خروج» را نشان میدهد و صفحات محافظتشده (مانند `/wallet`) بدون ورود دستی باز میشوند.
- تنظیمات محلی: `.env` دارای `DEMO_AUTOLOGIN=true` و `DEMO_ROLE=PATIENT` است. `.env.example` پیشفرض `false` دارد.

## ۲) Canary اتوماتیک
- `scripts/canary-gate.mjs` جایگزین اسکریپت shell شد: burn rate را از Prometheus میخواند و در صورت تجاوز از آستانه، خروجی ۱ میدهد.
- حالت تست اتوماتیک: `node scripts/canary-gate.mjs --simulate` — سرور Prometheus ساختگی محلی بالا میآورد.
  - حالت سالم: `burn=0.2` ⇒ `canary gate OK`
  - حالت بحرانی: `SIMULATED_BURN=2` ⇒ `aborting canary` + exit 1
- `.github/workflows/canary.yml` از اسکریپت Node استفاده میکند. استقرار واقعی نیاز به `KUBE_CONFIG`/خوشه دارد.

## ۳) Passkey / دامنهٔ واقعی
- استخراج `webauthnConfig()` در `passkey-challenge.ts`: origin و rpID بهصورت خودکار از `WEBAUTHN_ORIGIN` ← `WEB_ORIGIN` ← `CORS_ORIGINS` استنتاج میشوند.
- ۳ تست واحدnew پوشش دهندهٔ استنتاج دامنه، override صریح و پیشفرض محلی.
- تست روی Authenticator فیزیکی نیاز به دامنه و دستگاه کاربر دارد و در این محیط قابل شبیهسازی نبود.

## ۴) نتایج نهایی
- typecheck ✅
- تست واحد: API **۵۳۹** / Web **۱۶۹** / shared **۱۴** ✅
- Integration: **۹۴/۹۴** ✅ (پس از بازسازی کامل دیتابیس تست)
- OpenAPI: **۱۴۹/۱۴۹ (۱۰۰٪)** ✅
- k6: `smoke-slo` و `booking-journey` ✅
- Canary gate شبیهسازی شده ✅ (مسیر موفق و مسیر شکست)
- Playwright: اجرای نهایی در حال تأیید است.

## ۶) باگ اضافی کشفشده در ورود OTP
رفتار `onCode` بهمحض کامل شدن ۶ رقم، تأیید را خودکار آغاز میکند؛ کلیک دوم کاربر روی «ورود» با کد خالی (پس از پاک شدن کد در اثر خطا) پیام اصلی «کد واردشده نادرست یا منقضی است.» را با پیام نادرست «کد تأیید را کامل وارد کنید.» میپوشاند. با گارد `if (!code || busy) return` در `onVerify` رفع شد (`501adbd`).

## ۷) مسیر و سرویسها
`C:\Users\atash\Documents\Default Project`
API: `127.0.0.1:3000` · Web: `127.0.0.1:3001` · Postgres: `127.0.0.1:5433` · Redis: `127.0.0.1:6379`
