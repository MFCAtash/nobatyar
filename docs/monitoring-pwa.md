# مانیتورینگ (Sentry با scrubbing)، PWA و Web Push

## Sentry — داده‌ی بیمار نباید به سرویس خارجی برود
بدون `SENTRY_DSN` (API) / `NEXT_PUBLIC_SENTRY_DSN` (وب، build-arg) کاملاً خاموش است. با DSN:
- `sendDefaultPii=false`؛ `tracesSampleRate` پیش‌فرض ۰ (سقف ۰٫۲)؛ replay و session tracking خاموش.
- `beforeSend` / `beforeSendTransaction` = `scrubEvent` (`packages/shared/src/scrub.ts`، مشترک API و وب):
  - **بدنه‌ی درخواست، کوکی، هدرها، query، user، server_name** حذف؛ از request فقط `method` + URL بدون query.
  - هر کلید پزشکی/هویتی/رازی (`reason, soap, diagnosis, prescription, allerg*, phone, nationalCode, email, token, otp, authority, card…`) در `extra/tags/contexts` ⇒ `[Filtered]`.
  - رشته‌ها (حتی پیام خطا): JWT، Bearer، موبایل (فارسی/عربی/انگلیسی/+98)، ایمیل، کد ملی ۱۰ رقمی، hex/secret بلند ⇒ جایگزین.
  - `stacktrace.vars`/context line حذف؛ span های DB ⇒ `[db]`؛ breadcrumb ی غیر ناوبری (fetch/console/click/input) حذف.
  - **fail-closed:** هر خطا در پاک‌سازی ⇒ رویداد دور ریخته می‌شود.
- فقط خطاهای ۵xx/غیرمنتظره گزارش می‌شوند (فیلتر سراسری)؛ ۴xx هرگز.
- قاعده‌های semgrep: `sendDefaultPii: true` و `Sentry.init` بدون `beforeSend` ⇒ ERROR.
- CSP وب فقط origin ی ingest را به `connect-src` اضافه می‌کند.
**محدودیت صادقانه:** scrubbing الگو/کلید-محور است؛ متن آزاد با داده‌ی سلامت در یک کلید «بی‌ضرر» (مثلاً `description`) ممکن است بماند. پس در کد هرگز داده‌ی بیمار را در پیام خطا/لاگ نگذارید (`docs/data-classification.md`) و Sentry را self-hosted/در حاکمیت داده‌ی خودتان بگیرید.

## PWA
- `public/manifest.webmanifest` (fa/rtl، standalone)، آیکون‌ها (۱۹۲/۵۱۲/maskable/Apple)، `offline.html`.
- **Service Worker فقط استاتیک** (`public/sw.js` + منطق تست‌شده‌ی `sw-policy.js`): فقط GET هم‌مبدأ روی `/_next/static`, `/icons`, manifest, `offline.html`؛ پاسخ `no-store/private` هرگز cache نمی‌شود. `/api/`، `/socket.io`، `/payment/callback` و هر صفحه‌ی HTML ⇒ SW دخالت نمی‌کند؛ ناوبری فقط شبکه (قطعی ⇒ صفحه‌ی ثابت آفلاین). پیام `PURGE` همه‌ی cache ها را پاک می‌کند.
- `sw.js` با `no-cache` سرو می‌شود تا به‌روزرسانی گیر نکند. ثبت SW فقط در build ی production.

## Web Push (یادآوری نوبت)
1. `node scripts/gen-vapid.mjs` ⇒ `VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT` (هر سه یا هیچ؛ نیمه‌کاره ⇒ خطای راه‌اندازی).
2. کاربر در «اعلان‌ها» با کلیک فعال می‌کند (`PushToggle`)؛ `POST /push/subscribe`. حداکثر ۱۰ دستگاه برای هر کاربر.
3. job ی یادآوری (۲۴ ساعت و ۱ ساعت قبل) برای بیمار و پزشک: اعلان درون‌برنامه‌ای (DB+SSE) **و** پوش. حالا `NoopNotifier` جایش را به `PushAppointmentNotifier` داده است.
4. **متن پوش عمومی است** («نوبت شما حدود یک ساعت دیگر شروع می‌شود») — بدون نام، تخصص یا دلیل مراجعه؛ فقط UUID نوبت در URL نسبی. (پوش از سرویس Google/Apple/Mozilla می‌گذرد و روی صفحه‌ی قفل دیده می‌شود.)
5. endpoint و کلیدهای اشتراک با FieldCrypto رمزنگاری می‌شوند؛ ۴۱۰/۴۰۴ یا ۵ شکست پیاپی ⇒ اشتراک حذف.
