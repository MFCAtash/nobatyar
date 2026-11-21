# استقرار production (Docker)

## معماری
```
 اینترنت ─► Caddy (80/443، TLS خودکار)
              ├─ /api/v1/notifications/stream, /api/*, /socket.io/*  ─► api × N  (least_conn، بدون بافر)
              ├─ /*                                                  ─► web (Next standalone)
              └─ lk.<دامنه>                                          ─► livekit (سیگنالینگ wss)
 migrate (one-shot) ─► postgres      worker × 1 (BullMQ)      api ⇄ redis (SSE pub/sub، socket.io adapter)
```

## پیش‌نیازها
1. `pnpm install` و commit ی `pnpm-lock.yaml`.
2. مهاجرت‌ها commit شده باشند: یک‌بار `sh scripts/bootstrap-baseline.sh` (init + همه‌ی SQL های امنیتیِ `prisma/sql/ORDER` با برچسب زمانی واقعی)، سپس commit ی `apps/api/prisma/migrations`. job ی migrate بدون آن عمداً شکست می‌خورد و CI (`Repo integrity`) قرمز می‌ماند.
3. DNS: `DOMAIN` و `LIVEKIT_DOMAIN` و `STORAGE_DOMAIN` (ذخیره‌ساز فایل) به IP میزبان؛ پورت‌های ۸۰، ۴۴۳ (tcp/udp)، ۷۸۸۱/tcp و ۵۰۰۰۰–۵۰۱۰۰/udp در فایروال باز.

## راه‌اندازی
```bash
cp .env.production.example .env.production   # پر کنید؛ کلیدها: pnpm --filter @nobatyar/api gen:keys
alias dc='docker compose --env-file .env.production -f docker-compose.prod.yml'
dc build
dc up -d --scale api=2        # postgres/redis ⇒ migrate ⇒ api/worker/web ⇒ caddy
dc run --rm migrate seed      # تخصص‌ها (idempotent). در production هرگز کاربر نمونه نمی‌سازد
dc logs migrate               # نتیجه‌ی مهاجرت
dc logs minio-init            # «storage ready: private bucket + scoped service user»

# ادمین اولیه‌ی «واقعی» — شماره‌ی خودِ اپراتور، دو بار (OTP پیامکی به همان شماره می‌رود)
dc --profile ops run --rm -e ADMIN_PHONE=09xxxxxxxxx -e ADMIN_PHONE_CONFIRM=09xxxxxxxxx create-admin
```
اگر پیش‌تر (نسخه‌ی قدیمی) `seed` در production اجرا شده، کاربران نمونه (`0912000000x`) ساخته شده‌اند: **پیش از هر کار** آن‌ها را غیرفعال/حذف و نشست‌هایشان را باطل کنید؛ `seed` و `create-admin` در این حالت هشدار/خطا می‌دهند.
به‌روزرسانی: `dc build && dc up -d --scale api=2` (migrate دوباره و پیش از API اجرا می‌شود). بازگشت از مهاجرت‌های مخرب: پشتیبان Postgres پیش از هر استقرار.

## ذخیره‌ساز فایل (MinIO)
- `minio` فقط داخل شبکه‌ی docker است؛ مرورگر با presigned URL از راه Caddy روی `STORAGE_DOMAIN` مستقیم PUT/GET می‌کند (Host باید دست‌نخورده بماند؛ امضا به آن وابسته است).
- job ی `minio-init` (idempotent) bucket خصوصی، سیاست حداقلی و کاربر سرویس می‌سازد؛ API فقط `MINIO_APP_USER` را می‌بیند، نه root.
- `STORAGE_PUBLIC_URL` زمان build در CSP ی وب ثبت می‌شود (`connect-src`)؛ تغییر ⇒ `dc build web`.
- ⚠️ volume ی `miniodata` پیوست‌های پزشکی دارد و فعلاً در `scripts/backup-db.sh` نیست؛ پشتیبان جدا (و رمزنگاری‌شده) لازم است.

## تصمیم‌ها و نکات
- **کاربر غیر root، فایل‌سیستم فقط‌خواندنی، `cap_drop: ALL`** برای api/worker/web.
- **API فقط متغیرهای لازم را می‌بیند** (لیست در `x-api-env`)؛ رمز owner ی Postgres فقط به job ی migrate می‌رسد. متغیرهای تنظیمی دیگر (`OTP_*`, `HOLD_MINUTES`, …) را در `x-api-env` اضافه کنید.
- **`API_URL`/`LIVEKIT_PUBLIC_URL` زمان build** در web ثبت می‌شوند؛ تغییر ⇒ `dc build web`.
- **چند نمونه:** `--scale api=N`؛ SSE اعلان‌ها و چت با Redis بین نمونه‌ها هماهنگ‌اند (`docs/sse-redis.md`). `worker` دقیقاً یکی بماند.
- **گواهی‌ها** در volume ی `caddy_data`؛ پاک‌کردنش ⇒ صدور مجدد و رسیدن به سقف نرخ Let's Encrypt.
- **TURN/NAT:** LiveKit با `use_external_ip`؛ پشت NAT سخت‌گیرانه ممکن است TURN لازم شود.

## پیش از پول واقعی (درگاه پرداخت)
تأیید پرداخت اکنون واقعی و سمت سرور است (`docs/payment-gateway.md`). چک‌لیست go-live:
1. `PAYMENT_GATEWAY` و مشخصات همان درگاه را در `.env.production` بگذارید؛ همه‌ی `*_SANDBOX` باید `false` باشند، وگرنه API عمداً بالا نمی‌آید (fail-closed).
2. داده‌ی سندباکس قدیمی را پاک/آرشیو کنید (`payments.gateway = 'SANDBOX'`).
3. در پنل درگاه: IP سرور مجاز، دامنه‌ی بازگشت `https://<DOMAIN>/payment/callback`، و (IDPay) روش بازگشت.
4. یک تراکنش کوچک واقعی از ابتدا تا انتها و یک بار قطع‌کردن عمدی اتصال برگشت (تا job بازبینی نهایی کند) تست شود.

## راستی‌آزمایی (صادقانه)
✅ parse ی YAML ی compose و ci.yml، تطابق همه‌ی متغیرهای compose با `.env.production.example`، `sh -n` روی اسکریپت migrate.
❌ **build واقعی image، `docker compose config`، `caddy validate` و اجرای کل stack اجرا نشد** (در محیط ساخت Docker daemon و دسترسی registry نبود). job ی جدید `docker` در CI این‌ها را اجرا می‌کند (build سه target، غیر root بودن، compose و Caddyfile). اولین کار: `docker build --target api .` و `dc config -q` را یک‌بار محلی بزنید.
