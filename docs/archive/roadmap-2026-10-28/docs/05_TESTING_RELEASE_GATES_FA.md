# ۵. راهبرد تست و Gateهای انتشار

## هرم تست
**Unit:** ماشین وضعیت نوبت، لغو/refund، claims توکن، password/TOTP، policy دسترسی، validation و error mapping.
**Integration:** PostgreSQL، migrations، RLS، رزرو دوبل، payment callback، outbox worker، storage authorization و session revocation.
**E2E:** Playwright برای ورود → انتخاب پزشک → رزرو → پرداخت sandbox → callback → تأیید → لغو/refund؛ همچنین MFA ادمین.
**Security/abuse:** IDOR، replay، brute force، OTP reuse، TOTP replay، callback forgery، duplicate callback، MIME spoofing، oversized upload، expired URL و log leakage.
**Operations:** backup/restore، restart worker، provider timeout، DB/Redis outage، queue backlog، key rotation و rollback.

## تست‌های فوری فاز ۵.۵
- اصلاح token service tests با claims فعلی.
- Admin بدون MFA → `403 mfa_required`.
- MFA موفق → مسیر مجاز.
- recovery code بار دوم رد شود.
- TOTP replay رد شود.
- tokenVersion بعد از تعلیق توکن قدیمی را بی‌اعتبار کند.
- migration از DB خالی و ارتقایافته موفق باشد.

## رزرو/پرداخت
- ۱۰۰ درخواست هم‌زمان روی یک slot: حداکثر یک رزرو موفق.
- callback تکراری اثر مالی/اعلان تکراری ایجاد نکند.
- مبلغ/مرجع نادرست رد و audit شود.
- timeout درگاه به وضعیت قابل reconciliation منجر شود.
- redirect قطع‌شده مرورگر مانع بازیابی وضعیت واقعی سمت سرور نشود.

## Gate A — Build
install clean، migrations، lint/typecheck/unit/integration/build سبز؛ lockfile و migrations در Git؛ نسخه Node/pnpm ثبت‌شده.

## Gate B — Security
تست‌های منفی سبز؛ MFA کامل؛ secret و داده سلامت در log نیست؛ threat model/data classification به‌روز؛ review دوم ثبت شده.

## Gate C — Core
E2E مسیر اصلی، callback idempotent، refund عملیاتی و UI برای pending/error.

## Gate D — Phase 6
SMS واقعی/کنترل‌شده؛ فایل private و scan‌شده؛ چت فقط برای اعضای مجاز و در بازه زمانی؛ تست IDOR سبز.

## Gate E — Beta
restore تمرین‌شده، alertها آزمایش‌شده، پشتیبانی و incident response آماده، privacy/consent بازبینی شده و هیچ باگ Critical/High بدون پذیرش ریسک مستند باز نیست.

## ثبت نتیجه تست
برای هر اجرا: commit SHA، تاریخ/محیط، نسخه ابزارها، فرمان دقیق، pass/fail، log/artifact، مالک رفع، نتیجه اجرای مجدد.
