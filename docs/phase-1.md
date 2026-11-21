# فاز ۱ — دیتابیس و هسته‌ی امنیت

## محتوا
| بخش | فایل | کار |
|---|---|---|
| اسکیمای داده | `apps/api/prisma/schema.prisma` | ۲۸ مدل: هویت، پروفایل‌ها، زمان‌بندی، نوبت، پرداخت، پرونده‌ی سلامت، چت، triage، Audit |
| سخت‌سازی SQL | `apps/api/prisma/sql/hardening.sql` | ضد رزرو دوبل، Audit append-only با زنجیره‌ی هش، RLS، دسترسی نقش اپ |
| رمزنگاری فیلد | `apps/api/src/crypto/` | AES-256-GCM، چرخش کلید، AAD، blind index، نرمال‌سازی موبایل |
| زمینه‌ی RLS | `apps/api/src/prisma/prisma.service.ts` | `withContext()` — هر تراکنش با کاربر/نقش |
| Audit و break-glass | `apps/api/src/audit/` | ثبت رویداد، دسترسی اضطراری ادمین با دلیل اجباری |
| تست امنیت DB | `apps/api/test/db.int.test.ts` | IDOR، RLS پرونده، ضد رزرو دوبل (۱۰۰ درخواست هم‌زمان)، دستکاری Audit |
| تست واحد | `apps/api/src/crypto/*.test.ts` | رمزنگاری، چرخش کلید، شماره موبایل |

## راه‌اندازی
```bash
pnpm install
cp .env.example .env
pnpm --filter @nobatyar/api gen:keys     # خروجی را در .env بگذارید (FIELD_KEYS و BLIND_INDEX_KEY)
pnpm infra:up                             # نقش nobatyar_app خودکار ساخته می‌شود
pnpm --filter @nobatyar/api db:init       # یک‌بار: init + security_hardening و اعمال آن‌ها
pnpm --filter @nobatyar/api db:seed       # داده‌ی مصنوعی
TEST_OWNER_URL=postgresql://nobatyar:change-me-dev-only@localhost:5432/nobatyar \
TEST_APP_URL=postgresql://nobatyar_app:change-me-app-dev-only@localhost:5432/nobatyar \
  pnpm --filter @nobatyar/api test:int
```
پس از `db:init` پوشه‌ی `apps/api/prisma/migrations` و `pnpm-lock.yaml` را commit کنید (CI به آن‌ها نیاز دارد).

## تصمیم‌های طراحی
1. **دو اتصال به دیتابیس:** `DATABASE_URL` (مالک) فقط برای migrate/seed؛ API با `APP_DATABASE_URL` (نقش `nobatyar_app`، بدون superuser و BYPASSRLS) کار می‌کند — وگرنه RLS بی‌اثر است.
2. **زمینه با `set_config(..., true)`:** محدود به تراکنش است و در connection pool نشت نمی‌کند. همه‌ی دسترسی به داده‌ی کاربر باید از `PrismaService.withContext()` بگذرد.
3. **RLS = لایه‌ی دفاع دوم.** Guard های فاز ۲ همچنان لازم‌اند؛ RLS فقط تضمین می‌کند باگ یا فراموشی `WHERE` در API، داده‌ی دیگران را نشت ندهد.
4. **نقش `SYSTEM`** فقط برای ورود (پیش از شناخت کاربر) و job های زمان‌بندی‌شده. کدی که SYSTEM می‌گیرد باید کوچک و بازبینی‌شده بماند.
5. **رمزنگاری با AAD:** بلاب هر فیلد به `جدول:id:ستون` گره خورده است. `keyId` داخل بلاب است، پس ستون `key_id` جدا نداریم (ER بروز شد).
6. **Audit:** `seq` و هش زنجیره‌ای توسط trigger با قفل روی ردیف head تعیین می‌شود؛ `verify_audit_chain()` خروجی خالی = سالم. توصیه: یک job شبانه آن را اجرا و در صورت خروجی غیرخالی هشدار دهد (فاز ۹) و آخرین هش در محلی بیرون از دیتابیس هم نگه‌داری شود.
7. **ادمین و HEALTH:** ادمین ردیف نوبت‌ها را می‌بیند (عملیاتی) ولی پرونده/پیام/triage فقط با `AuditService.withBreakGlass()` (دلیل ≥ ۱۰ نویسه، Audit پیش از دسترسی). رمزگشایی `reason_enc` نوبت توسط ادمین باید در فاز ۲ با همین مسیر Guard شود.

## محدودیت‌های شناخته‌شده
- سرپرست دیتابیس (superuser) همچنان به همه‌چیز دسترسی دارد؛ محافظت در برابر او فقط با رمزنگاری سطح فیلد و کلید خارج از DB است.
- **کلیدها فعلاً از env می‌آیند.** در محیط واقعی باید از Vault/KMS تأمین شوند (فاز ۹).
- اگر مهاجم بتواند SQL دلخواه در همان تراکنش اجرا کند، می‌تواند `set_config` را عوض کند؛ تنها دفاع، جلوگیری از SQL injection (فقط کوئری پارامتری Prisma؛ `$queryRawUnsafe` ممنوع) است. Semgrep را برای این الگو قانون‌دار کنید.
- `weekday` در `AvailabilityRule` هنوز قرارداد عددی نهایی ندارد (در فاز ۳ تثبیت شود).

## معیار پایان فاز ۱
- [ ] `db:init` بدون خطا؛ `migrations/` commit شد
- [ ] `test` (واحد) و `test:int` سبز؛ job `db-integration` در CI سبز
- [ ] بازبینی `hardening.sql` توسط یک نفر دیگر (به‌ویژه سیاست‌های RLS)
- [ ] هر ستون جدید با طبقه‌ی داده در `docs/data-classification.md` هم‌خوان است
