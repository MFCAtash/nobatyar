# SSE چند-instance (اعلان‌ها) و چت روی Redis

## معماری
```
 نمونه‌ی A: NotificationService.push ──► INSERT notifications (DB)
                                     └─► PUBLISH nb:notif:user:<id>  (اتصال publisher)
 Redis ───────────────────────────────────────────┐
 نمونه‌ی B: اتصال subscriber (یکی برای کل پروسه) ◄┘ ──► NotificationHub ──► SseSession ──► مرورگر
```
- **کانال per-user**؛ subscribe فقط وقتی کاربر روی این نمونه SSE دارد (refcount، سریالی‌شده).
- **subscriber جدا از publisher** (دو اتصال؛ اتصال subscribe فقط دستورهای SUBSCRIBE می‌پذیرد).
- **DB منبع حقیقت**؛ Redis فقط مسیر سریع است.

## پروتکل `GET /api/v1/notifications/stream`
احراز هویت: `Authorization: Bearer` (نه URL). هدر `Last-Event-ID` (یا `?lastEventId=`) اختیاری.

| رویداد | معنی |
|---|---|
| `ready` | اشتراک Redis برقرار است (کلاینت بدون cursor لیست را از REST می‌گیرد) |
| `notification` | `id` = شناسه‌ی اعلان؛ `data` = JSON اعلان |
| `resync` | بازپخش ممکن نیست (`invalid_cursor/unknown_cursor/gap/overflow/replay_failed/redis_reconnect`) ⇒ لیست را از REST بگیرید |
| `reconnect` | سرور عمداً می‌بندد (`lifetime/shutdown`) ⇒ فوراً وصل شوید |
| `: hb` | heartbeat هر **۲۵ ثانیه** |

## تضمین‌ها
- ترتیب راه‌اندازی: subscribe با تأیید Redis ⇒ `ready` ⇒ بازپخش DB ⇒ تخلیه‌ی بافر زنده با حذف تکراری. بین «بارگذاری لیست» و «اتصال» شکافی نیست.
- reconnect با `Last-Event-ID`: اعلان‌های پس از آن از DB (با هم‌پوشانی ۱۰ ثانیه‌ای؛ تکراری‌ها با id در سرور و کلاینت حذف می‌شوند). cursor متعلق به کاربر دیگر مثل ناموجود است (نشت نمی‌کند).
- Redis قطع: publish به شنونده‌های محلی می‌رسد؛ با بازگشت subscriber همه `onResync` می‌گیرند و از DB جبران می‌کنند.
- کلاینت کند (بافر > ۵۱۲KB) بسته می‌شود؛ سقف ۸ اتصال/کاربر/نمونه (429)؛ عمر stream ≤ اعتبار توکن و ≤ `SSE_MAX_LIFETIME_SEC`.
- خاموشی تمیز: `onModuleDestroy` همه‌ی streamها را با `reconnect` می‌بندد (وگرنه shutdown معلق می‌ماند).

## Reverse proxy
- nginx: `infra/nginx/nobatyar.conf` (`proxy_buffering off; gzip off; proxy_read_timeout 1h` برای مسیر stream؛ مسیر `/socket.io/` با Upgrade).
- Caddy: `reverse_proxy 127.0.0.1:3000 { flush_interval -1 }`.
- پاسخ API هم `X-Accel-Buffering: no` و `Cache-Control: no-cache, no-transform` دارد (مانع بافر nginx و فشرده‌سازی Next در dev).

## چت
`RedisIoAdapter` (`@socket.io/redis-adapter`) در `main.ts`؛ `isOnline()` اکنون async و در کل خوشه است.

## تنظیمات
`SSE_HEARTBEAT_SEC` (۲۵)، `SSE_MAX_STREAMS_PER_USER` (۸)، `SSE_MAX_LIFETIME_SEC` (۹۰۰)، `SSE_REPLAY_MAX` (۲۰۰) — `.env.example`.

## راستی‌آزمایی (صادقانه)
✅ اجرا شد: ۴۳ تست واحد API (format/config/hub/session/pubsub)، ۳۰ تست وب (parser، کلاینت روی سرور HTTP واقعی، ادغام حالت)، و e2e روی **redis-server واقعی** با دو «نمونه» + SSE روی HTTP + کلاینت وب (شامل قطع اتصال و بازپخش بدون گم‌شدن/تکرار).
❌ اجرا نشد (رجیستری npm در محیط ساخت بسته بود): `pnpm install`، `tsc`/`vitest` کل پروژه، `test/notifications-sse.int.test.ts` و `test/chat-redis-adapter.int.test.ts` (با ioredis/socket.io)، `next build`، و اتصال Nest. فایل‌های Nest با تایپ‌های دستی بدون خطا بررسی شدند.
**اولین کار:** `pnpm i && pnpm -r typecheck && pnpm -r test && pnpm test:int` (با `TEST_REDIS_URL`).

## نکات مشاهده‌شده (خارج از این بخش، دست‌نخورده)
- صفحه‌بندی `NotificationService.list` با cursor ی `id < uuid` ولی ترتیب `createdAt` است (uuid ترتیب‌پذیر نیست).
- `Header` و صفحه‌ی اعلان هر کدام `useNotifications` می‌زنند ⇒ دو stream (در سقف ۸)؛ بهتر است یک provider مشترک شود.
- `use-chat.ts` توکن را از `window.__ny_token` می‌خواند که جایی set نمی‌شود.
