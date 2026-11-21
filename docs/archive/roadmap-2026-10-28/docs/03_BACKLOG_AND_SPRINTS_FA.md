# ۳. بک‌لاگ و اسپرینت‌ها

## اولویت‌ها
P0: مانع build/امنیت/پول/رزرو. P1: ضروری برای بتا. P2: بهبود تجربه/عملیات. P3: توسعه وابسته به اثبات تقاضا.

## Sprint 0 — Baseline (۲–۳ روز)
- [ ] ثبت commit/tag و branch کاری.
- [ ] بررسی وجود lockfile و migrations در مخزن اصلی.
- [ ] اجرای install clean، lint، typecheck، unit، integration و build.
- [ ] ثبت فرمان‌ها، نسخه ابزارها و خطاها در baseline report.
- [ ] آماده‌سازی DB تست و staging.
**خروجی:** baseline قابل تکرار.

## Sprint 1 — فاز ۵.۵: Schema (P0)
- [ ] تطبیق fieldهای auth/admin با Prisma.
- [ ] افزودن passwordHash، passwordUpdatedAt، tokenVersion، mfaSecretEnc، mfaEnabledAt، mfaRecoveryHashes و Session.mfaAt در صورت تأیید کد.
- [ ] migration نسخه‌دار و تست DB خالی/ارتقایافته.
- [ ] بازبینی RLS و data classification.
**خروجی:** schema/migration سازگار.

## Sprint 2 — فاز ۵.۵: Auth/MFA tests (P0)
- [ ] اصلاح `token.service.test.ts` با claims واقعی.
- [ ] تست password hash/verify/reset/change.
- [ ] تست TOTP مطابق RFC 6238 و replay prevention.
- [ ] recovery code hash‌شده و یک‌بارمصرف.
- [ ] tokenVersion و ابطال فوری پس از تعلیق.
- [ ] Admin بدون MFA → 403؛ پس از MFA → دسترسی مجاز.
**خروجی:** تست واحد و یکپارچه سبز.

## Sprint 3 — فاز ۵.۵: UI/Decision (P0)
- [ ] تصمیم ADR: OTP-only یا OTP+password.
- [ ] اگر password می‌ماند، UI ورود/reset/change کامل شود؛ در غیر این صورت مسیرها حذف شوند.
- [ ] UI MFA enroll/verify/recovery codes.
- [ ] API client و redirect برای `mfa_required`.
- [ ] به‌روزرسانی env، README، threat model و مستندات.
**خروجی:** backend/frontend/docs هم‌قرارداد.

## Sprint 4 — پرداخت و E2E (P0/P1)
- [ ] Zarinpal sandbox و ثبت شواهد.
- [ ] تست callback معتبر، جعلی، تکراری و مبلغ نادرست.
- [ ] idempotency و reconciliation.
- [ ] تعریف refund و worker فعال.
- [ ] E2E ورود → رزرو → پرداخت → تأیید → لغو/refund.
**خروجی:** مسیر مالی تأییدشده.

## Sprint 5 — فاز ۶.۱: اعلان‌ها (P1)
- [ ] Outbox schema، worker، retry/backoff، dead-letter/alert.
- [ ] جایگزینی `AppointmentNotifier` از Noop.
- [ ] پیامک رزرو/یادآوری/پرداخت/لغو/refund.
- [ ] تست Kavenegar در محیط کنترل‌شده.
- [ ] مرکز اعلان و preferences.
**خروجی:** ارسال واقعی قابل رصد.

## Sprint 6 — فاز ۶.۲: فایل امن (P1)
- [ ] signed PUT، سقف حجم و allowlist.
- [ ] بررسی magic bytes، quarantine و malware scan.
- [ ] storage خصوصی و signed GET کوتاه‌عمر.
- [ ] تکمیل upload مدارک پزشک.
- [ ] تست IDOR، MIME spoofing، path traversal و فایل حجیم.
**خروجی:** pipeline امن فایل.

## Sprint 7 — فاز ۶.۳/۶.۴: چت (P1)
- [ ] تعریف consent و بازه مجاز گفتگو.
- [ ] Conversation مرتبط با appointment و عضویت صریح.
- [ ] رمزنگاری، RLS، Audit، rate limit و pagination.
- [ ] انتخاب WebSocket یا SSE؛ نه هر دو مگر نیاز.
- [ ] پیوست فقط از pipeline امن فایل.
- [ ] تست IDOR، دسترسی بعد از پایان بازه، revoke consent و spam.
**خروجی:** چت امن در staging.

## Sprint 8 — فاز ۷: ویدئو
- [ ] LiveKit و مدیریت secretها.
- [ ] توکن کوتاه‌عمر محدود به room/role/appointment.
- [ ] precheck دوربین/میکروفون و reconnect.
- [ ] تست نقش اشتباه و token منقضی.
- [ ] consent/retention برای ضبط، اگر وجود دارد.
**خروجی:** ویزیت آزمایشی.

## Sprint 9 — فاز ۸: پرونده سلامت/triage/نظر دوم
- [ ] بازبینی نیازمندی توسط متخصص بالینی.
- [ ] consent و scope برای RecordShare، expiry/revoke/audit.
- [ ] triage غیرتشخیصی و red-flag escalation.
- [ ] export/delete و تست مرز دسترسی.
**خروجی:** قابلیت محدود و بازبینی‌شده.

## Sprint 10 — فاز ۹: عملیات
- [ ] KMS/Vault، backup رمزنگاری‌شده و restore drill.
- [ ] پایش API/DB/Redis/storage/worker/provider.
- [ ] اجرای زمان‌بندی‌شده `verify_audit_chain`.
- [ ] dependency/container scan، incident response و redaction.
**خروجی:** operational readiness.

## Sprint 11 — فاز ۱۰: بتا
- [ ] cohort محدود بیمار/پزشک، consent و پشتیبانی.
- [ ] شاخص‌های تجمیعی بدون محتوای سلامت.
- [ ] feature flag و rollback.
- [ ] بازخورد هفتگی و گزارش go/no-go.
**خروجی:** گزارش بتا و تصمیم گسترش.

## Definition of Done برای هر کارت
معیار پذیرش روشن، API contract، migration در صورت نیاز، مجوز/consent، edge cases، تست، UI و حالت‌های loading/empty/error، لاگ امن، env/docs، review دوم و rollback.
