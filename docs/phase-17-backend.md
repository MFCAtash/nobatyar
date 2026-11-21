# فاز ۱۷ — بک‌اند: sid، OpenAPI، Idempotency، Outbox، Maker/Checker، حذف `any`، شکستن فایل‌های بزرگ

> **صحت‌سنجی:** محیط نگارش اینترنت نداشت؛ `pnpm install`، `prisma generate/migrate`، ESLint، `nest build`، Vitest ی واقعی و تست‌های integration اجرا **نشدند**. چه چیزی اجرا شد در بخش ۹ آمده.

## ۱) `sid` در JWT و ابطال فوری (Redis)
- access token اکنون `sid` (= `familyId` ی refresh؛ بین چرخش‌ها ثابت) و `ims` (زمان صدور با دقت میلی‌ثانیه) دارد (`auth/token.service.ts`).
- `auth/session-revocation.ts`: کلیدهای کوتاه‌عمر `rev:sid:<sid>` و `rev:uid:<userId>` (cutoff به ms؛ `ims <= cutoff` ⇒ باطل؛ توکنی که یک میلی‌ثانیه بعد از ابطال صادر شود، مثل refresh پس از تغییر نقش، معتبر است). TTL = عمر توکن + ۶۰ث.
- `JwtAuthGuard`، **WebSocket چت** (هر ۳۰ث + هر پیام) و **SSE** (هر heartbeat) همه از همین سازوکار می‌پرسند. Redis ناپایدار: درخواست HTTP ⇒ ۵۰۳ (fail-closed)، اتصال باز ⇒ می‌ماند.
- چه چیزی ابطال می‌کند: `logout` (یک نشست)، `logout-all`، **reuse ی refresh** (نشست دزدیده‌شده)، **تعلیق ادمین**، **تأیید پزشک** (نقش عوض می‌شود ⇒ توکن قدیمی باطل، کلاینت با refresh نقش تازه می‌گیرد).
- جدید: `POST /admin/users/:id/suspend | reinstate | revoke-sessions` (نمی‌شود خود یا ادمین دیگر را تعلیق کرد).
- پیکربندی: `ACCESS_REQUIRE_SID` (پیش‌فرض true؛ هنگام استقرار اولیه یک عمر access token false)، `SESSION_CHECK_FAIL_OPEN` (در production ممنوع).
- دقت ms عمداً انتخاب شد: با iat ی ثانیه‌ای، refresh بلافاصله پس از تغییر نقش (هم‌ثانیه) رد می‌شد. توکن هم‌میلی‌ثانیه با ابطال «باطل» حساب می‌شود (جهت امن).

## ۲) OpenAPI از Zod و client ی تایپ‌شده
- `src/openapi/`: مبدل Zod⇒JSON Schema (`zod-to-schema.ts`)، `registry.ts` (۴۳ عملیات مستند، schema ی ورودی «همان» Zod ی کنترلر)، `build.ts`، `GET /api/v1/openapi.json` (فقط ادمین) و `openapi/openapi.json` ی commit‌شده.
- `route-scan.ts` کنترلرها را می‌خواند؛ تست `openapi.test.ts`: مستندِ مسیرِ ناموجود ⇒ شکست؛ **مسیر جدید بدون مستند ⇒ شکست** (ratchet با `openapi/undocumented.json`؛ فقط می‌تواند کوتاه شود). پوشش فعلی ≈ ۴۴٪ (۴۳ از ۹۷).
- `pnpm --filter @nobatyar/api openapi` (و `openapi:check` در `lint`) ← `pnpm --filter @nobatyar/web gen:api` ⇒ `apps/web/src/lib/api-types.generated.ts` + `lib/typed-api.ts`: مسیر/بدنه/پاسخ در کامپایل بررسی می‌شود و **endpoint ی مالی بدون `idempotencyKey` کامپایل نمی‌شود**. صفحه‌ی استرداد ادمین از آن استفاده می‌کند.
- ⚠️ `openapi.json` و `api-types.generated.ts` را در محیط نگارش با یک شبیه‌ساز Zod (با همان ساختار `_def`) ساختم، نه Zod ی واقعی. اولین `pnpm lint` ممکن است «کهنه» بگوید؛ `pnpm --filter @nobatyar/api openapi && pnpm --filter @nobatyar/web gen:api` را بزنید و commit کنید. تست `openapi.zod.test.ts` با Zod ی واقعی همین را می‌سنجد.

## ۳) حذف `any` و قاعده‌ی error
- ریشه‌ی بررسی «۷۱ any»: بیشتر در تست‌ها (۱۱۰ مورد، مجاز) بود؛ در کد تولیدی **۷ مورد** (storage، family، notifications، scrub، InitiateView، گیت‌وی چت) که همه برطرف شد. `scrub.ts` (پاک‌سازی PII ی Sentry) بدون `any` بازنویسی و ۱۰ تستش سبز است.
- `eslint.config.mjs`: `no-explicit-any` = error (فقط mock های تست مستثنا)؛ `ban-ts-comment` سخت. تست `quality/guardrails.test.ts` همین را بدون ESLint هم می‌گیرد.
- **۳ خطای tsc** که CI را می‌شکست (و تا حالا دیده نشده بود): `aad()` سه پارامتر می‌خواهد ولی در چت و خانواده با دو پارامتر صدا زده می‌شد.
- **باگ واقعی خانواده:** کد ملی با `aad("family-national-id", userId)` رمز می‌شد و با `aad("family", memberId)` باز می‌شد ⇒ هر رمزگشایی شکست می‌خورد و لیست خانواده ۵۰۰ می‌داد. اکنون `aad("family_members", memberId, "national_id")` (شناسه‌ی عضو پیش از درج ساخته می‌شود). چت: `aad("messages", id, "body")` با fallback خواندنیِ AAD ی قدیمی (داده‌ی توسعه).
- باگ کوچک: `z.coerce.boolean()` روی `attention=false` مقدار true می‌داد ⇒ enum صریح.

## ۴) Idempotency-Key (endpoint های مالی)
- `idempotency/`: policy خالص، `runIdempotent` (بدون Nest)، store ی Postgres (`INSERT … ON CONFLICT DO NOTHING`) + حافظه‌ای، interceptor و `@Idempotent()`.
- رفتار: همان کلید + همان درخواست ⇒ پاسخ ذخیره‌شده (`Idempotent-Replayed: true`)؛ همان کلید + درخواست دیگر ⇒ ۴۲۲؛ هم‌زمان ⇒ ۴۰۹ + `Retry-After`؛ خطا ⇒ قفل آزاد (تلاش مجدد مجاز)؛ فقط ۲xx ≤ ۶۴KB ذخیره می‌شود؛ TTL ۲۴ ساعت؛ قفل ۲ دقیقه (پروسه‌ی مرده قابل تصاحب).
- **اجباری** روی: `POST /payments/initiate` و همه‌ی POST های `admin/refunds/*`. `verify` اختیاری است (poll می‌شود؛ نباید PENDING ذخیره شود). تست guardrails اجبار را می‌سنجد.
- فرانت: `lib/idempotency.ts` (`IntentKeys`: یک کلید برای «یک قصد» تا موفقیت)؛ `InitiateView` و صفحه‌ی استرداد ادمین می‌فرستند. CORS: `Idempotency-Key` مجاز و `Idempotent-Replayed/Retry-After` expose شد.

## ۵) Outbox
- جدول `outbox_events` + تریگر DB (محتوا تغییرناپذیر، PROCESSED نهایی، PENDING حذف‌شدنی نیست) + ایندکس جزئی.
- `outbox/`: policy (backoff ۵ث … ۱۵دقیقه، ۸ تلاش ⇒ DEAD)، relay (claim با `FOR UPDATE SKIP LOCKED` + lease)، handler ها (اعلان با **id قطعی** ⇒ تحویل مجدد تکراری نمی‌سازد)، job ی BullMQ هر ۵ث (`OUTBOX_RELAY_EVERY_MS`) فقط در worker.
- منتقل‌شده به Outbox (داخل همان تراکنش): پرداخت موفق/ناموفق/نیازمند بررسی/تکراری/دیرهنگام، ثبت بازپرداخت، و **تغییر وضعیت نوبت** (اعلان تأیید/لغو/درخواست جدید/انقضا — پیش‌تر اصلاً اعلانی نداشت).
- رفع: بازنده‌ی رقابت در بستن تلاش پرداخت هم اعلان تکراری می‌فرستاد.
- مشاهده‌پذیری: `nobatyar_outbox{status}`، `…_oldest_pending_seconds`، شمارنده‌ها؛ هشدارهای `OutboxDeadEvents` و `OutboxBacklog`؛ `docs/runbooks/outbox.md`.

## ۶) Maker/Checker
جزئیات در `docs/refunds-admin.md`. سه endpoint جدید (`request-approval`، `approval/approve`، `approval/reject`)، ۱۲ تست سرویس + ۱۳ تست policy، CHECK های DB، UI در پنل ادمین، هشدار `RefundApprovalWaiting`.

## ۷) شکستن فایل‌های بزرگ
| فایل | قبل | بعد |
|---|---|---|
| `payment/payment-settlement.ts` | ۳۱۴ خط | ۱۶۶ + `settlement/{types,attempt-closer,appointment-sync,not-paid-handler}.ts` |
| `chat/chat.service.ts` | ۲۷۹ خط | ۲۰۳ + `chat-codec`، `chat-attachments`، `chat-socket-auth`، `chat-types` |
هر دو با تست موجود (۲۵ تست جریان پرداخت) تأیید شدند؛ تنها تغییر تست: اعلان‌ها اکنون رویداد Outbox ثبت می‌کنند.

## ۸) مهاجرت دیتابیس
`schema.prisma`: `IdempotencyKey`، `OutboxEvent`، ستون‌های تأیید روی `Refund`. `prisma/sql/phase17-backend.sql` (در `ORDER`) محدودیت‌ها را می‌افزاید. چون migration commit نشده است، `scripts/bootstrap-baseline.sh` همه را از صفر می‌سازد؛ برای پایگاه‌داده‌ی موجود: `pnpm --filter @nobatyar/api db:phase17`.

## ۹) صحت‌سنجی انجام‌شده / نشده
✅ ۳۸ فایل تست API (۳۸۶ مورد)، scrub (۱۰ مورد) و تست‌های web (۱۲۹ مورد؛ `api.test`/`sse.test` ی موجود با اجرای‌کننده سازگار نبودند) با اجرای‌کننده‌ی ساده‌شده‌ی Node (نه Vitest ی واقعی) سبز؛ شامل ۲۵ تست جریان پرداخت، ۲۴ تست استرداد، ۱۵ تست Outbox، ۱۱ تست Idempotency، ۸ تست ابطال نشست.
✅ تایپ‌چک با تایپ‌های ساختگی: بدون خطای ساختاری در فایل‌های تغییرکرده.
❌ اجرا نشد: تست یکپارچه‌ی جدید `test/backend-hardening.int.test.ts` (۱۴ سناریو؛ نیازمند Postgres: ابطال فوری end-to-end، رقابت `ON CONFLICT`، `SKIP LOCKED`، تریگر/CHECK های SQL)، ۸ فایل تست که به `jose`/`@aws-sdk`/`web-push`/`@sentry` نیاز دارند (از جمله `token.service.test.ts` و `openapi.zod.test.ts`)، تست‌های integration با Postgres/Redis (رقابت `ON CONFLICT`، `SKIP LOCKED`، trigger/CHECK های SQL، ابطال end-to-end)، `nest build`، ESLint، Prisma generate. ریسک بیشتر: SQL خام `claim` در `prisma-outbox-store.ts` و ترتیب migration.
