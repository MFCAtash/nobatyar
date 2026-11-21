# راهنمای پاسخ به حادثه

**۱. تشخیص (۵ دقیقه):** هشدار را بخوانید ← `docker compose ps` ← `docker compose logs --since=15m api worker caddy | tail`.
شناسه‌ی درخواست (`X-Request-Id`) در لاگ دسترسی JSON هست؛ لاگ‌ها «هرگز» داده‌ی سلامت/IP/بدنه ندارند.

**۲. دسته‌بندی:**
| علامت | اقدام |
|---|---|
| `ExternalProbeFailing` ولی `ApiInstanceDown` نه | Caddy/DNS/گواهی: `docker compose logs caddy`؛ `docker compose restart caddy` |
| `ApiNotReady` | `curl -s api:3000/api/v1/health/ready` از داخل شبکه ⇒ `db:false` یا `redis:false` ⇒ [db-redis-outage.md](db-redis-outage.md) |
| `HighErrorRate` پس از استقرار | بازگشت به نسخه‌ی قبل: [deploy-rollback.md](deploy-rollback.md) |
| `HighLatencyP95` | `docker stats`؛ اتصال‌های Postgres (`pg_stat_activity`)؛ پرس‌وجوی کند؛ افزودن نمونه‌ی API: `docker compose up -d --scale api=3` |
| هشدار پول (`PaidButNotConfirmed`، `Mismatch`، `RefundNeedsReview`) | [payment-incident.md](payment-incident.md) — **اولویت بالا** |
| بالا بودن ۵xx فقط روی یک مسیر | برچسب `route` در متریک؛ Sentry (بدون داده‌ی بیمار) برای stack |

**۳. ارتباط:** اطلاع‌رسانی به کاربران (صفحه‌ی وضعیت/کانال) در اختلال > ۳۰ دقیقه. هرگز جزئیات فنی یا داده‌ی کاربر منتشر نکنید.
**۴. پس از حادثه (۴۸ ساعت):** گزارش بدون سرزنش: زمان‌بندی، علت ریشه‌ای، چه چیز زودتر هشدار می‌داد، اقدام اصلاحی با مسئول و تاریخ. اگر داده‌ی شخصی نشت کرده باشد: اطلاع‌رسانی طبق `docs/privacy-policy-draft.md` و مقررات.
