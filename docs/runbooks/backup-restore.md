# پشتیبان‌گیری و بازیابی

**الگو:** `pg_dump` (custom) هر ۶ ساعت ← رمزنگاری با `age` (فقط کلید عمومی روی سرور) ← حجم محلی + (اختیاری) بارگذاری بیرونی (`BACKUP_UPLOAD_CMD`) ← نگه‌داری ۱۴ روز. هدف: **RPO ≤ ۶ ساعت، RTO ≤ ۱ ساعت.**

## راه‌اندازی
```bash
age-keygen -o age-key.txt          # کلید خصوصی را آفلاین (چند نسخه، جدا از سرور) نگه دارید؛ «age1…» خط public را بردارید
echo 'BACKUP_AGE_RECIPIENT=age1…' >> .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml -f docker-compose.monitoring.yml --profile ops up -d backup
```
dead-man's switch: `BACKUP_PING_URL` (مثلاً healthchecks.io) ⇒ اگر پینگ نیامد هشدار می‌گیرید.
⚠️ پشتیبان **بیرون از همین میزبان** هم نگه دارید (`BACKUP_UPLOAD_CMD`)؛ پشتیبان روی همان دیسک با خرابی دیسک از بین می‌رود. همچنین پشتیبان شامل داده‌ی سلامت (رمزنگاری‌شده در سطح فیلد + age) است.

## تمرین بازیابی (ماهانه + پس از تغییر طرح‌واره)
```bash
docker compose exec -e BACKUP_AGE_IDENTITY=/tmp/age-key.txt -e PGUSER=$POSTGRES_USER -e PGPASSWORD=$POSTGRES_PASSWORD -e PGHOST=postgres backup sh /scripts/restore-drill.sh
```
پایگاه موقت `nobatyar_restore_drill` ساخته/حذف می‌شود؛ بررسی‌ها: مهاجرت‌ها، RLS روی جداول حساس، تریگر استرداد، قید double-booking؛ و زمان کل (RTO). نتیجه را ثبت کنید.

## بازیابی واقعی
۱. API/worker را متوقف کنید. ۲. پایگاه جدید بسازید، `age -d` + `pg_restore --no-owner`. ۳. نقش‌ها (`infra/postgres/01-roles.sh`) و مالکیت/GRANT ها را بررسی کنید (`nobatyar_app` بدون BYPASSRLS). ۴. `docker compose up -d`. ۵. `/admin/payments?attention` و `/admin/refunds`.
**محدودیت:** پشتیبان نقطه‌ای است؛ داده‌ی بین آخرین پشتیبان و حادثه از دست می‌رود. برای RPO نزدیک صفر: بایگانی WAL (PITR) — هنوز پیاده نشده (آتی).
