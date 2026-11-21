# ۲. معماری و گردش داده

## معماری کلان
```text
کاربر (بیمار/پزشک/ادمین)
  -> Next.js 14 App Router (RTL)
  -> HTTPS/API contract
  -> NestJS API + Auth/Guards/RBAC/Consent
  -> Prisma -> PostgreSQL 16
  -> Redis (cache/queue/rate-limit طبق پیاده‌سازی)
  -> MinIO private object storage
  -> providerها: درگاه پرداخت، پیامک، LiveKit
```
این نمودار معماری هدف است؛ نام یک ماژول یا جدول به‌تنهایی اثبات عملیاتی بودن آن نیست.

## اصول
1. NestJS تنها مالک نوشتن DB باشد.
2. تا وقتی نیاز واقعی ثابت نشده، Modular Monolith را حفظ کنید.
3. قرارداد API و خطاها بین frontend/backend مشترک و versioned باشد.
4. ماشین وضعیت appointment/payment یک تعریف واحد داشته باشد.
5. side effectها با Outbox/worker و retry محدود اجرا شوند.
6. رزرو، callback و refund idempotent باشند.
7. کنترل دسترسی شامل role + مالکیت resource + consent + زمان اعتبار باشد.
8. داده سلامت در logs، analytics، traces و crash reports ثبت نشود.

## مرزبندی ماژول‌ها
Identity & Access؛ Doctor Verification؛ Availability؛ Appointment؛ Payment & Refund؛ Notification؛ File Service؛ Conversation؛ Video؛ Health Record؛ Triage/Second Opinion؛ Admin/Audit.

## گردش رزرو و پرداخت
۱) کاربر پزشک/زمان را انتخاب می‌کند. ۲) API هویت، وضعیت پزشک، slot و قوانین را بررسی می‌کند. ۳) DB transaction و constraint از رزرو دوبل جلوگیری می‌کند. ۴) payment intent با وضعیت pending ساخته می‌شود. ۵) کاربر به درگاه هدایت می‌شود. ۶) callback در backend از نظر مرجع/مبلغ/وضعیت اعتبارسنجی می‌شود. ۷) callback تکراری بدون اثر تکراری پاسخ می‌گیرد. ۸) رویداد outbox برای اعلان ثبت می‌شود. ۹) فرانت وضعیت را از API می‌خواند؛ query string مرورگر منبع حقیقت مالی نیست.

## گردش فایل و چت
۱) API عضویت، مالکیت، consent و بازه مجاز چت را بررسی می‌کند. ۲) پیام با سقف اندازه و rate limit ذخیره می‌شود. ۳) برای فایل upload intent ایجاد و signed PUT کوتاه‌عمر صادر می‌شود. ۴) فایل در storage خصوصی و quarantine می‌ماند. ۵) magic bytes و malware scan بررسی می‌شوند. ۶) فقط فایل approved قابل دریافت است. ۷) download نیازمند authorization مجدد و URL کوتاه‌عمر است.

## گردش ویدئو
API پس از بررسی appointment توکن کوتاه‌عمر LiveKit محدود به room/role می‌دهد. توکن در log ذخیره نشود. ضبط پیش‌فرض خاموش مگر consent و retention روشن باشد.

## گردش پرونده سلامت/triage
خواندن/نوشتن براساس role، مالکیت، رابطه درمانی و consent. اشتراک record دارای scope، expiry و revoke است. triage تشخیص قطعی نیست؛ red flags باید به مسیر ارجاع مناسب منجر شوند. export/delete و audit دسترسی لازم‌اند.

## قواعد DB و API
- migrations نسخه‌دار در Git؛ از تغییر دستی DB بدون migration اجتناب شود.
- قید دیتابیس برای جلوگیری از رزرو دوبل؛ application check به‌تنهایی کافی نیست.
- خطاهای استاندارد: 400 ورودی، 401 هویت، 403 دسترسی/consent/MFA، 409 تعارض، 429 rate limit، 5xx خطای داخلی با correlation ID.
- هیچ stack trace، secret، token یا داده سلامت در پاسخ/log قرار نگیرد.
