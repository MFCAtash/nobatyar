# Runbook — Outbox (تحویل اعلان‌ها)

رویدادها (`outbox_events`) در همان تراکنشِ تغییر وضعیت نوشته می‌شوند و relay (هر ۵ ثانیه، فقط در worker) آن‌ها را تحویل می‌دهد. تحویل «حداقل یک‌بار» است؛ اعلان‌ها با شناسه‌ی قطعی ساخته می‌شوند، پس تحویل دوباره تکراری نمی‌سازد.

## هشدار OutboxBacklog (قدیمی‌ترین رویداد > ۱۰ دقیقه)
1. آیا worker بالا است؟ `ENABLE_WORKERS=true` در حداقل یک نمونه؟ لاگ `outbox relay job failed`.
2. Redis (BullMQ) در دسترس است؟ (`docs/runbooks/db-redis-outage.md`)
3. اگر relay سالم است ولی صف رشد می‌کند: `nobatyar_outbox_retried_total` را ببینید؛ معمولاً DB/Redis کند است.
```sql
SELECT status, count(*), min(created_at) FROM outbox_events GROUP BY status;
SELECT id, type, attempts, available_at, last_error FROM outbox_events WHERE status = 'PENDING' ORDER BY created_at LIMIT 20;
```

## هشدار OutboxDeadEvents
رویداد بعد از ۸ تلاش (backoff ۵ث … ۱۵ دقیقه) DEAD شده؛ `last_error` علت را می‌گوید.
```sql
SELECT id, type, aggregate_type, aggregate_id, attempts, last_error, created_at FROM outbox_events WHERE status = 'DEAD' ORDER BY created_at;
```
- **payload خراب / نوع ناشناخته** (خطای برنامه‌نویسی): پس از رفع کد، رویداد را دوباره فعال کنید.
- **کاربر حذف‌شده** (خطای FK): معمولاً ایمن است که DEAD بماند.
- فعال‌سازی دوباره (فقط پس از رفع علت):
```sql
UPDATE outbox_events SET status = 'PENDING', attempts = 0, available_at = now(), last_error = NULL WHERE id = '<id>';
```
  (تریگر DB اجازه‌ی بازگرداندن PROCESSED را نمی‌دهد؛ DEAD ⇒ PENDING مجاز است.)

## نکته‌ها
- رویدادهای PROCESSED بیش از ۷ روز خودکار پاک می‌شوند؛ PENDING هرگز.
- محتوای رویداد فقط شناسه‌ است؛ هیچ داده‌ی سلامت/نامی در آن نیست.
