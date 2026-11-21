# ۱. نقشه‌راه مادر نوبت‌یار — از صفر تا انتشار
نسخه 1.0 | ۲۸ اکتبر ۲۰۲۶

## هدف محصول
نوبت‌یار پلتفرمی فارسی و RTL برای اتصال بیمار، پزشک و تیم مدیریت است. هسته شامل مشاهده پزشک، رزرو نوبت، پرداخت، پیگیری و سپس ارتباط بیمار/پزشک است. با توجه به حساسیت داده سلامت، صحت رزرو/پرداخت، امنیت، حریم خصوصی و ممیزی بر رشد سریع امکانات اولویت دارند.

## نقش‌ها
- **بیمار:** ورود، جست‌وجوی پزشک، انتخاب زمان، رزرو، پرداخت، پیگیری، لغو و در مراحل بعد چت/ویدئو/پرونده سلامت.
- **پزشک:** پروفایل، برنامه زمانی، نوبت‌ها، مدارک و ارائه خدمت.
- **ادمین:** بررسی پزشک، مدیریت کاربران و پرداخت/بازپرداخت با دسترسی محدود و قابل ممیزی.

## وضعیت مبنا
تحلیل پروژه معماری Monorepo با pnpm/Turborepo، Next.js 14، NestJS/Prisma، PostgreSQL 16، Redis، MinIO و `packages/shared` را گزارش می‌کند. فازهای ۰ تا ۵ تحویل‌شده گزارش شده‌اند، اما باید build/test/staging واقعی تأیید شوند. در کد احراز هویت جدیدتر password، TOTP MFA، recovery codes، tokenVersion و تعلیق کاربر دیده شده، ولی این بخش با schema و تست‌ها همگام نیست.

## فاز ۰ — Baseline و زیرساخت
- ثبت commit/tag و ایجاد branch کاری.
- بررسی مخزن واقعی برای `pnpm-lock.yaml`، `prisma/migrations`، scripts، CI و env.
- تفکیک local/test/staging/production و secrets.
- تعریف نقش‌ها، مسیرهای کاربر، ماشین وضعیت نوبت و قرارداد API.
- اجرای نصب clean، migration، lint، typecheck، unit، integration و build.
**خروج:** baseline report قابل بازتولید و CI اولیه سبز.

## فاز ۱ — پایگاه داده و امنیت
- همسان‌سازی Prisma schema، migrations و مدل‌های TypeScript.
- بررسی تراکنش‌ها و قید جلوگیری از رزرو دوبل.
- تست RLS و دسترسی به داده بر اساس مالکیت.
- مستندسازی طبقه‌بندی داده و retention.
- بازبینی رمزنگاری AES-256-GCM/AAD/چرخش کلید و audit chain.
**خروج:** migration از DB خالی و ارتقایافته موفق؛ تست‌های منفی دسترسی سبز.

## فاز ۲ — احراز هویت
- تصمیم قطعی: OTP-only یا OTP + password.
- افزودن فیلدهای auth استفاده‌شده به Prisma و migration.
- یکسان‌سازی claims توکن (`ver`, `sid`, `mfa`) با کد و تست.
- تکمیل MFA ادمین: enroll، QR/otpauth، verify، recovery codes و revoke.
- مدیریت `mfa_required` در API client و UI.
- rate limit، جلوگیری از user enumeration، reset/recovery و ابطال session.
**خروج:** backend/frontend/docs هم‌قرارداد و تست auth سبز.

## فاز ۳ — چرخه نوبت
- ماشین وضعیت واحد در backend و `packages/shared`.
- تعریف نقش مجاز برای هر انتقال وضعیت.
- رزرو idempotent، انقضای رزرو موقت و رفتار پرداخت دیررس.
- سیاست لغو، no-show، تغییر زمان و refund.
- تست رقابت هم‌زمان روی یک slot.
**خروج:** هیچ رزرو دوبل یا وضعیت مالی مبهم در E2E/DB باقی نماند.

## فاز ۴ — تجربه کاربری
- تکمیل UI نسبت به پروتوتایپ مصوب.
- RTL، تاریخ/ساعت، متن دوجهته و responsive موبایل.
- حالت‌های loading/empty/error/offline/retry.
- دسترس‌پذیری صفحه‌کلید، focus، label و کنتراست.
**خروج:** تست مسیر اصلی در موبایل/دسکتاپ.

## فاز ۵ — پرداخت
- تأیید قرارداد درگاه و محیط sandbox.
- اعتبارسنجی callback در سمت سرور؛ عدم اعتماد به redirect مرورگر.
- idempotency، ثبت reference و reconciliation.
- worker بازپرداخت و پایش صف.
- تست callback جعلی/تکراری، مبلغ نادرست، timeout و refund.
**خروج:** تست sandbox مستند و مسیر مالی قابل ممیزی.

## فاز ۵.۵ — تثبیت و سخت‌سازی احراز هویت (اولویت فوری، ۴–۶ روز کاری)
### Schema/migration
در صورت تأیید کد واقعی، فیلدهای `User.passwordHash`, `passwordUpdatedAt`, `tokenVersion`, `mfaSecretEnc`, `mfaEnabledAt`, `mfaRecoveryHashes` و `Session.mfaAt` را به schema و migration اضافه کنید؛ نوع، nullable/default/index را بررسی کنید. RLS و data classification را به‌روز کنید.
### تست
اصلاح `token.service.test.ts`؛ افزودن تست password، TOTP با بردارهای RFC 6238، replay protection، recovery code یک‌بارمصرف، tokenVersion و تعلیق کاربر.
### فرانت
صفحه MFA با enroll/verify و نمایش یک‌باره کدهای بازیابی؛ مدیریت `mfa_required` و هدایت ادمین.
### تصمیم محصول
یا UI کامل password/reset/change بسازید یا مسیرهای password را حذف کنید؛ وضعیت نیمه‌کاره پذیرفته نیست.
### مستندات و Gate
به‌روزرسانی `.env.example`، README، `phase-5b.md`، threat model (به‌ویژه T2/T12/T17) و ADR. همه lint/typecheck/unit/integration/build سبز، migrations/lockfile در Git، تست sandbox درگاه و review نفر دوم.
**قانون:** قبل از این Gate فاز ۶ را وارد main نکنید.

## فاز ۶ — اعلان، فایل و چت (تخمین ۳–۴ هفته)
**۶.۱ اعلان:** جایگزینی `AppointmentNotifier` از Noop با Outbox، worker، retry/backoff و dead-letter/alert. پیامک رزرو، یادآوری، پرداخت، لغو و refund؛ تست Kavenegar کنترل‌شده.
**۶.۲ فایل:** upload URL امضاشده، سقف حجم، allowlist، بررسی magic bytes، quarantine، malware scan، storage خصوصی و URL دریافت کوتاه‌عمر. تکمیل آپلود مدارک پزشک.
**۶.۳ چت:** Conversation مرتبط با appointment، بررسی عضویت/مالکیت/consent `HEALTH_DATA_PROCESSING`، رمزنگاری، RLS، Audit، rate limit و بازه زمانی مشخص.
**۶.۴ پیوست:** فقط از pipeline فایل امن.
**۶.۵ UI:** مرکز اعلان، صفحه چت، وضعیت ارسال و خطا.
**۶.۶ تست:** IDOR، دسترسی بعد از پایان بازه، replay، spam، MIME spoofing و URL منقضی.
**خروج:** ارسال واقعی قابل رصد، فایل private و چت با تست منفی دسترسی سبز.

## فاز ۷ — ویدئو با LiveKit
توکن کوتاه‌عمر محدود به room/role و appointment؛ precheck دوربین/میکروفون، reconnect، پایان جلسه، consent/retention برای هرگونه ضبط. ضبط پیش‌فرض خاموش باشد.
**خروج:** کاربر فقط وارد اتاق نوبت مجاز می‌شود؛ توکن بلندعمر/reusable وجود ندارد.

## فاز ۸ — پرونده سلامت، triage و نظر دوم
RecordShare با scope/expiry/revoke، audit، consent، export/delete، triage غیرتشخیصی و مسیر red-flag escalation. بازبینی حقوقی و بالینی پیش از عرضه ضروری است.
**خروج:** تست حریم خصوصی و تأیید متخصص ثبت شده؛ triage جایگزین پزشک معرفی نمی‌شود.

## فاز ۹ — سخت‌سازی
KMS/Vault یا معادل؛ backup رمزنگاری‌شده و تمرین restore؛ پایش API/DB/Redis/storage/worker/provider؛ اجرای زمان‌بندی‌شده `verify_audit_chain`؛ dependency/container scanning؛ incident response؛ redaction لاگ و حذف داده سلامت از telemetry.
**خروج:** restore واقعی، هشدارهای آزمایش‌شده و playbook حادثه.

## فاز ۱۰ — بتای بسته و انتشار تدریجی
تیم داخلی → cohort محدود بیمار/پزشک → بتای بسته → اصلاح → گسترش کنترل‌شده. نیازمند پشتیبانی، consent/privacy، مانیتورینگ، backup/restore و rollback.
**خروج:** مسیر اصلی پایدار، باگ بحرانی باز نیست و شاخص‌ها/بازخورد قابل سنجش‌اند.

## زمان‌بندی راهنما
- فاز ۵.۵: ۴–۶ روز کاری
- فاز ۶: ۳–۴ هفته
- فاز ۷: ۲–۴ هفته
- فاز ۸: ۳–۶ هفته به‌علاوه بازبینی بالینی/حقوقی
- فاز ۹: ۲–۴ هفته
- فاز ۱۰: ۲–۴ هفته
زمان‌ها تخمینی‌اند و به اندازه تیم، دسترسی provider و وضعیت مخزن بستگی دارند.

## Definition of Done
هر ویژگی باید migration/schema، قرارداد API، کنترل مجوز/consent، UI و حالت خطا، تست، logging امن، env/docs، review دوم و rollback/feature flag داشته باشد. ویژگی backend-only بدون این موارد Done نیست.
