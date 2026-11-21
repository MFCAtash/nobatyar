# ۴. چک‌لیست امنیت و حریم خصوصی

## هویت و نشست
- [ ] سیاست ورود در UI/API/docs یکسان است.
- [ ] OTP دارای TTL، rate limit، محدودیت تلاش و جلوگیری از reuse است.
- [ ] MFA ادمین اجباری؛ recovery codes hash‌شده و یک‌بارمصرف.
- [ ] tokenVersion/session revocation در مسیرهای حساس بررسی می‌شود.
- [ ] refresh token reuse detection و session expiry تست شده است.
- [ ] login/reset از user enumeration جلوگیری می‌کند.
- [ ] تعلیق کاربر اثر فوری دارد.

## مجوز و مالکیت
- [ ] RBAC همراه با ownership/resource relationship بررسی می‌شود.
- [ ] بیمار A نمی‌تواند نوبت/چت بیمار B را بخواند.
- [ ] دسترسی ادمین محدود و audit شده است.
- [ ] break-glass دلیل اجباری و بازبینی دارد.
- [ ] RLS با integration test بررسی می‌شود.

## داده سلامت
- [ ] طبقه‌بندی PHI و مسیر پردازش مستند است.
- [ ] consent نسخه‌دار و قابل اثبات است.
- [ ] داده سلامت در log/analytics/traces/crash report نیست.
- [ ] retention، حذف، ناشناس‌سازی و export مشخص است.
- [ ] فایل‌ها در storage خصوصی‌اند.
- [ ] AES-256-GCM دارای nonce یکتا، AAD صحیح و key rotation است.
- [ ] backup رمزنگاری‌شده و دسترسی محدود دارد.

## API و فایل
- [ ] validation سمت سرور؛ CSRF/XSS/CORS/security headers.
- [ ] rate limit روی auth، booking، payment، chat و upload.
- [ ] signed URL کوتاه‌عمر و scope محدود.
- [ ] فایل با magic bytes و اندازه واقعی بررسی می‌شود.
- [ ] quarantine و malware scan قبل از دسترسی.
- [ ] filename کاربر مسیر storage را تعیین نمی‌کند.
- [ ] download مجدداً authorization می‌شود.

## پرداخت و عملیات
- [ ] callback سمت سرور از نظر مبلغ/مرجع/وضعیت validate می‌شود.
- [ ] callback تکراری idempotent است.
- [ ] secret در frontend/log نیست و داده کارت ذخیره نمی‌شود.
- [ ] reconciliation و refund queue پایش می‌شود.
- [ ] audit chain دوره‌ای verify می‌شود.
- [ ] backup restore تمرین شده است.
- [ ] dependency/container scan و incident playbook وجود دارد.
- [ ] review دوم auth، payments و hardening SQL ثبت شده است.

## ریسک‌های baseline
- ناسازگاری schema با فیلدهای auth گزارش شده.
- تست‌های token قدیمی و پوشش MFA/password/tokenVersion ناکافی است.
- UI MFA در تحلیل مبنا وجود نداشته است.
- `AppointmentNotifier` از نوع Noop گزارش شده.
- آپلود مدارک پزشک به pipeline کامل امن متصل نیست.
- Zarinpal/Kavenegar در sandbox/واقعی تأیید نشده‌اند.
- وجود `prisma/migrations` و `pnpm-lock.yaml` در آرشیو بررسی‌شده تأیید نشده؛ مخزن اصلی را بررسی کنید.
