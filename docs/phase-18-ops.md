# فاز ۱۸ — مانیتورینگ و عملیات (بخش انجام‌شده)

> این فاز **نیمه‌تمام** تحویل می‌شود. جدول پایین دقیقاً می‌گوید چه چیزی انجام شد و چه چیزی نه.

| مورد | وضعیت | توضیح |
|---|---|---|
| لاگ ساخت‌یافته با پاک‌سازی | ✅ کد + تست | `observability/json-logger.ts`: JSON یک‌خطی، scrub ی مشترک با Sentry (موبایل/توکن/کلیدهای حساس)، `trace_id`، ضد تزریق خط، سقف ۱۶KB. فعال به‌صورت پیش‌فرض (`LOG_FORMAT=text` برای توسعه). ۱۲ تست |
| Tracing (OpenTelemetry) روی رزرو و پرداخت | ✅ کد + تست منطق، ⚠️ SDK اجرا نشده | span های `booking.create`، `payment.initiate/verify/settle`، `refund.execute`، `outbox.relay.tick`؛ فهرست مجاز attribute (بدون داده‌ی شخصی)؛ پاک‌سازی span های خودکار (URL/SQL/هدر/پیام خطا)؛ `tracing-register.ts` با `OTEL_ENABLED=true` و `NODE_OPTIONS=--require ./dist/observability/tracing-register.js`. نسخه‌های بسته‌های `@opentelemetry/*` نصب/آزموده نشده‌اند |
| متریک SLI ی درگاه و پرداخت | ✅ | `nobatyar_gateway_calls_total{gateway,op,result}`، `nobatyar_gateway_duration_seconds`، `nobatyar_payment_outcomes_total{outcome}` (پایه‌ی SLO ها) |
| صفحه‌ی وضعیت عمومی — بک‌اند | ✅ کد + تست | `GET /api/v1/status` (public، cache ۳۰ث، فقط وضعیت؛ هیچ عدد داخلی)، probe ی DB/Redis/پرداخت/Outbox، حوادث دستی با `POST /admin/status/incidents…` (متن با داده‌ی شخصی رد می‌شود)، SQL ی `phase18-ops.sql`. باگ پیدا و رفع‌شده: تشخیص موبایل با ارقام فارسی کار نمی‌کرد |
| صفحه‌ی وضعیت — UI در وب | ❌ | endpoint آماده است؛ صفحه‌ی `/status` نوشته نشد |
| داشبورد Grafana برای SLO ها | ❌ | انجام نشد |
| هشدار burn-rate (چند‌پنجره‌ای) به‌جای آستانه‌ی ثابت | ❌ | انجام نشد؛ هشدارهای فعلی (۱۵ قانون) سر جایشان‌اند |
| Loki + Alloy (جمع‌آوری لاگ) و Tempo | ❌ | فقط تولیدکننده‌ی لاگ/trace آماده است؛ پیکربندی زیرساخت نوشته نشد |
| backup drill واقعی و شبیه‌سازی on-call | ❌ | محیط نگارش Postgres/زیرساخت نداشت. ابزار پایه از قبل هست: `scripts/backup-db.sh`، `scripts/restore-drill.sh`، `docs/runbooks/backup-restore.md` — اجرا و ثبت نتیجه با شما |
| ADR ها (OTP-only، RLS، Audit chain)، README «شروع در ۱۰ دقیقه»، نمودارهای Mermaid | ❌ | ADR 0008 (فاز ۱۷) هست؛ بقیه نوشته نشد |
| بایگانی اسناد Roadmap قدیمی | ✅ | `docs/archive/roadmap-2026-10-28/` با هشدار منسوخ‌بودن |
| نام پوشه‌ی ریشه | ✅ | ریشه‌ی این بسته `nobatyar` است (بدون نام فاز) |

## تغییر رفتارِ مهم
`GatewayRegistry.get()` اکنون پروکسی ی اندازه‌گیری برمی‌گرداند (هویت شیء با درگاه خام یکی نیست؛ رفتار یکسان است).

## صحت‌سنجی
۴۳ فایل تست API (۴۲۴ مورد) با اجرای‌کننده‌ی ساده‌شده‌ی Node سبز؛ ۶ فایل نیازمند وابستگی‌های نصب‌نشده (jose/aws/web-push/sentry) اجرا نشد. Prisma generate/migrate، ESLint، `nest build`، تست‌های integration و SDK ی OpenTelemetry اجرا نشدند.
