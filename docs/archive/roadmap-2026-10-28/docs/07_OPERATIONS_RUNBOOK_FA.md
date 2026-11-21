# ۷. راهنمای محیط و عملیات

## محیط‌ها
- Local: داده ساختگی و secrets محلی.
- CI: DB تست ایزوله و بدون اتصال production.
- Staging: مشابه production با داده ساختگی/بی‌هویت و provider sandbox.
- Production: secrets جدا، least privilege، backup، alert و rollback.

## شروع کار
۱) نسخه Node/pnpm را از package.json/CI استخراج کنید، حدس نزنید.
۲) `pnpm install --frozen-lockfile` را اجرا کنید؛ نبود lockfile را بررسی کنید و تصادفی نسازید.
۳) env محلی را از `.env.example` بسازید؛ secret را commit نکنید.
۴) Docker Compose و DB تست را اجرا کنید.
۵) migrations، lint، typecheck، unit، integration و build را اجرا و ثبت کنید.
۶) هر تغییر schema باید migration، تست و rollback plan داشته باشد.
فرمان دقیق باید از scripts مخزن تأیید شود.

## استقرار
artifact از commit مشخص؛ migration کنترل‌شده؛ deploy به staging؛ smoke test؛ rollout با feature flag؛ پایش error rate/latency/queue/provider؛ rollback اگر آستانه‌ها نقض شد.

## Worker/queue
worker پیامک/اعلان/refund مستقل و قابل پایش باشد. retry محدود با exponential backoff و jitter؛ خطای دائمی به dead-letter و alert؛ oldest job age پایش شود؛ jobها idempotent باشند.

## Backup/restore
backup رمزنگاری‌شده از DB و object storage؛ کلیدها جدا و امن backup شوند؛ restore دوره‌ای در محیط ایزوله؛ RPO/RTO با مالک محصول تعیین؛ نتیجه و زمان بازیابی ثبت شود.

## Logs/monitoring
log ساختاریافته با correlation ID و redaction. متن چت، PHI، token، OTP، secret، signed URL و داده کارت در log نباشد. metric: API errors/latency، payment failures، queue age، SMS delivery، scan failures و video join failures.

## Incident response
تشخیص شدت → محدودسازی/feature flag → حفظ شواهد با حداقل داده → تعیین دامنه → لغو session/چرخش کلید در صورت نیاز → اطلاع به مسئول امنیت/حقوقی → بازیابی و مانیتور → postmortem و اقدام اصلاحی.
