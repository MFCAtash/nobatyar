# ADR 0006 — E2E/بار، مانیتورینگ با scrubbing، PWA فقط-استاتیک و Web Push

**وضعیت:** پذیرفته‌شده

**تصمیم**
- **E2E فقط مسیرهای حیاتی** (Playwright): ورود OTP، جستجو، رزرو، پرداخت sandbox، چت (+ جعل Status و PWA). OTP از `SMS_PROVIDER=memory` و hook ی `/__e2e/*` خوانده می‌شود؛ هر دو در production **ممنوع و fail-closed** (config) و کنترلر hook در production ساخته نمی‌شود. جایگزین‌ها (خواندن لاگ API یا DB مستقیم) شکننده‌تر یا خطرناک‌تر بودند.
- **k6 «۵۰ کاربر، یک نوبت»**: آستانه‌های دقیق (۱ موفق، ۴۹ تا ۴۰۹، صفر ۵xx) + بررسی تقویم پزشک؛ مدرک اجرایی برای قید EXCLUDE.
- **Sentry با scrubbing اجباری و مشترک** (`packages/shared`): allowlist ساختاری + denylist کلیدها + الگوی رشته + fail-closed؛ semgrep جلوی init بدون scrub را می‌گیرد. بدون DSN خاموش.
- **PWA فقط-استاتیک**: منطق routing SW در فایل UMD ی جدا و تست‌پذیر؛ `/api` و HTML هرگز cache نمی‌شوند.
- **Web Push**: VAPID، اشتراک رمزنگاری‌شده، پیلود عمومی؛ job یادآوری از Noop به نوتیفایر واقعی.
- **رفع شکاف‌های کشف‌شده هنگام نوشتن E2E:** رکورد مکالمه هیچ‌جا ساخته نمی‌شد (اکنون در تراکنش رزرو + backfill)، توکن سوکت چت (`window.__ny_token`) هیچ‌جا مقدار نمی‌گرفت (اکنون `api.getToken()`)، و صفحه‌ی نوبت دکمه‌ی پرداخت نداشت.

**پیامد:** وابستگی‌های جدید (`@sentry/node`, `@sentry/browser`, `web-push`, `@playwright/test`) ⇒ `pnpm-lock.yaml` باید دوباره تولید و commit شود؛ job ی CI سنگین‌تر (~۱۰ دقیقه).
