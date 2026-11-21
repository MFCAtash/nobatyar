# درگاه پرداخت (نقشه‌ی راه، بخش ۴)

تصمیم‌ها در `docs/adr/0005-payment-gateway.md`. این سند: جریان، تنظیمات، عملیات و محدودیت‌ها.

## جریان

```
مرورگر ── POST /payments/initiate ──► API ── request (با failover) ──► درگاه
   ▲                                   │ تلاش INITIATED + تمدید نگه‌داشتن اسلات
   │ paymentUrl                        ▼
   └──── هدایت به درگاه ────────────────────────────► بانک
   ┌──── /payment/callback (GET/POST) ◄─────────────── درگاه
   ▼  (فقط authority را استخراج و به /payment هدایت می‌کند؛ تأییدی نمی‌کند)
مرورگر ── POST /payments/verify {appointmentId, authority} ──► API
                                              verify با درگاه + مطابقت مبلغ ──► PAID ──► نوبت (PAYMENT_SUCCEEDED)
job (هر ۵ دقیقه): تلاش‌های INITIATED قدیمی‌تر از ۱۵ دقیقه ──► inquire/verify ──► همان تسویه
```

## وضعیت‌ها
| تلاش | معنی |
|---|---|
| INITIATED | لینک ساخته شد؛ نتیجه نامعلوم |
| VERIFIED | درگاه تأیید کرد (نهایی) |
| FAILED | درگاه صریحاً ناموفق گفت |
| EXPIRED | بیش از ۲۴ ساعت، پرداختی گزارش نشد |
| MISMATCH | ناهمخوانی مبلغ/سفارش یا وضعیت نامعلوم پس از مهلت ⇒ **بررسی دستی** |

`Payment`: `INITIATED → PAID → (REFUNDED | PARTIALLY_REFUNDED)` یا `FAILED` (هیچ تلاش زنده‌ای نمانده).

## موارد لبه (همه تست‌شده در `payment-flow.test.ts`)
- پرداخت رسید ولی نوبت منقضی/لغو شده ⇒ بازپرداخت کامل خودکار (`Refund.reason = PAID_AFTER_EXPIRY`) + اعلان.
- پرداخت دوم برای همان نوبت ⇒ `Refund.reason = DUPLICATE_PAYMENT`.
- پروسه بین «PAID» و «تأیید نوبت» مُرد ⇒ `appointmentSyncedAt = null` ⇒ job ترمیم.
- callback و job هم‌زمان ⇒ فقط یک برنده.
- مبلغ ناهمخوان ⇒ `MISMATCH`، audit `payment.needs_review`، لاگ ERROR، اعلان به بیمار.
- `Refund` ها همچنان `PENDING` (بدهی به بیمار) ساخته می‌شوند؛ اجرای واقعی بازپرداخت از طریق API درگاه **هنوز پیاده نشده** (پنل ادمین، بخش ۶ نقشه‌ی راه).

## تنظیمات
| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `PAYMENT_GATEWAY` | production: الزامی؛ غیر production: `sandbox` | `zarinpal`/`zibal`/`idpay` |
| `PAYMENT_FALLBACK_GATEWAYS` | — | ترتیب جایگزین‌ها؛ هرکدام مشخصاتش باید باشد |
| `ZARINPAL_MERCHANT_ID` / `ZARINPAL_SANDBOX` | — / `false` | UUID ی ۳۶ نویسه‌ای |
| `ZIBAL_MERCHANT` / `ZIBAL_SANDBOX` | — / `false` | merchant `zibal` آزمایشی است و در production ممنوع |
| `IDPAY_API_KEY` / `IDPAY_SANDBOX` | — / `false` | |
| `PAYMENT_SANDBOX_MODE` | `success` | `success\|fail\|pending`؛ فقط غیر production |
| `ALLOWED_CALLBACK_ORIGINS`, `WEB_ORIGIN` | — | production: الزامی و https |
| `PAYMENT_RECONCILE_AFTER_MIN` / `_EVERY_SEC` | 15 / 300 | |
| `PAYMENT_HOLD_MIN` | 30 | باید > `AFTER_MIN` + ۲×`EVERY_SEC` باشد |
| `PAYMENT_ATTEMPT_GIVEUP_HOURS` | 24 | |
| `PAYMENT_HTTP_TIMEOUT_MS` | 10000 | |
| `PAYMENT_BREAKER_FAILURES` / `_COOLDOWN_SEC` | 3 / 60 | |
| `PAYMENT_RATE_PER_USER_PER_MIN` | 10 | initiate/verify |
| `REFUND_DUAL_APPROVAL` | true | تأیید دو نفره‌ی استرداد (Maker/Checker) |
| `REFUND_DUAL_APPROVAL_MIN_RIAL` | 0 | مبالغ کمتر از این بدون تأیید دوم (۰ = همه تأیید می‌خواهند) |

### Fail-closed (production)
API بالا **نمی‌آید** اگر: هر `*_SANDBOX=true`؛ مقدار flag غیر از `true|false`؛ `PAYMENT_GATEWAY=sandbox`؛ `PAYMENT_SANDBOX_MODE` تنظیم‌شده؛ درگاه اصلی بدون مشخصات؛ merchant ی `zibal`؛ `ALLOWED_CALLBACK_ORIGINS` خالی یا غیر https. CI این را با بوت واقعی در production تست می‌کند (job ی integration). برای تست sandbox از `NODE_ENV=development|test|staging` استفاده کنید، نه compose ی production.

## عملیات
- **قطع درگاه اصلی:** لاگ `FAILOVER zarinpal → zibal`؛ تراکنش‌های قبلی همچنان روی درگاه خودشان verify می‌شوند. درگاه جایگزین را در پنل خودش (IP مجاز، دامنه) از پیش آماده کنید.
- **`MISMATCH`:** `SELECT * FROM payment_attempts WHERE status='MISMATCH'`؛ بررسی دستی در پنل درگاه؛ تا پنل ادمین، تصمیم و Refund دستی.
- **IDPay:** callback را IDPay با POST می‌فرستد؛ `/payment/callback` هر دو روش را می‌پذیرد. مهلت verify در IDPay کوتاه است؛ job هر ۵ دقیقه اجرا می‌شود.
- **IP ایرانی:** بعضی درگاه‌ها درخواست از IP خارج از ایران را رد می‌کنند؛ سرور را مطابق قرارداد درگاه مستقر کنید.

## راه‌اندازی دیتابیس
```bash
cd apps/api
pnpm db:payment-gateway   # مهاجرت schema + prisma/sql/payment-gateway.sql (RLS، تریگر، backfill)
```
پیش از go-live: `DELETE`/آرشیو ردیف‌های `gateway='SANDBOX'` (با نقش مالک؛ تریگر حذف attempt را برای نقش app می‌بندد).

## راستی‌آزمایی (صادقانه)
✅ اجرا شد: ۱۰۳ تست واحد/رفتاری (config و fail-closed، سه درگاه با fetch جعلی، failover و breaker، سیاست پرداخت، تسویه و job روی DB درون‌حافظه‌ای).
❌ اجرا نشد: Postgres/Redis/Docker/pnpm و شبکه در محیط ساخت نبود ⇒ `tsc`/`eslint`/vitest واقعی، `payment-gateway.int.test.ts`، مهاجرت SQL، BullMQ و تماس واقعی با درگاه‌ها. پروتکل درگاه‌ها از مستندات رسمی نوشته شده؛ **قبل از پول واقعی هر درگاه را با sandbox خودش یک‌بار end-to-end تست کنید** (به‌ویژه نگاشت وضعیت‌های `inquiry` و کدهای خطا).
