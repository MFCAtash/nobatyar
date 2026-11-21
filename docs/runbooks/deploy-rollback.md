# استقرار و بازگشت

## پیش از هر استقرار
۱. CI سبز (شامل `e2e-load`). ۲. `docker compose --env-file .env.production -f docker-compose.prod.yml run --rm --no-deps -v "$PWD/.env.production:/tmp/prod.env:ro" api node dist/preflight.cli.js /tmp/prod.env` ⇒ خروجی «پیش‌پرواز موفق ✓» (هرگز مقدار رازها چاپ نمی‌شود).
۳. پشتیبان تازه (`sh scripts/backup-db.sh`) اگر مهاجرت دارد.
## استقرار
`IMAGE_TAG=<git-sha> docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build` — سرویس `migrate` پیش از API اجرا می‌شود و موفقیتش شرط شروع API است. سپس `curl -s https://$DOMAIN/api/v1/health` و بررسی داشبورد ۱۵ دقیقه.
## بازگشت
`IMAGE_TAG=<sha-قبلی> docker compose … up -d`. **مهاجرت‌ها فقط رو به جلو هستند**: مهاجرت مخرب (حذف/تغییر ستون) را در دو انتشار انجام دهید (افزودن سازگار ← حذف پس از پایداری). اگر مهاجرت اخیر ناسازگار با نسخه‌ی قبلی است، بازگشت = بازیابی پشتیبان (RPO ≤ ۶ساعت) ⇒ [backup-restore.md](backup-restore.md).
