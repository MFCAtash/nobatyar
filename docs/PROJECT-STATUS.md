# نوبت‌یار — وضعیت جامع پروژه (بهروزرسانی فاز ۱۹)

## ساختار
مونوریپو pnpm + Turborepo: `apps/web` (Next.js 14، RTL فارسی)، `apps/api` (NestJS 10 + Prisma 5 + PostgreSQL 16 با RLS)، `apps/e2e` (Playwright + axe + تست بصری)، `packages/shared`، `infra/` (Caddy/nginx/Prometheus/Alertmanager/Blackbox/Grafana/Loki/Tempo)، `docs/`، `scripts/`، `load/` (k6).

## فازها و تحویل‌ها
| فاز | محتوا | سند |
|---|---|---|
| ۰ تا ۸ | احراز هویت OTP، رزرو، پرداخت، چت، ویدئو، پرونده سلامت، triage، نظر دوم، SOAP، نسخه | `docs/phase-*.md` |
| ۱۴ | رفع ۴ مشکل بحرانی | `docs/phase-14-critical-fixes.md` |
| ۱۵ | ساختار فایلهای وب | `docs/phase-15-restructure.md` |
| ۱۶ | فرانت: توکن طراحی، TanStack Query، Storybook، OTP/WebOTP، رزرو مرحلهای، axe و تست بصری | `docs/phase-16-frontend-ux.md` |
| ۱۷ | بکاند: `sid` + ابطال فوری، OpenAPI، Idempotency-Key، Outbox، Maker/Checker | `docs/phase-17-backend.md` |
| ۱۸ (نیمه) | لاگ JSON امن، tracing، SLI درگاه، بکاند صفحه وضعیت | `docs/phase-18-ops.md` |
| **۱۹** | MFA/TOTP، جابهجایی اتمی، FHIR R4، RPM، Ambient Scribe، OpenAPI ۱۰۰٪، صفحه/status، clinic info، SLO/burn-rate/Grafana/Loki/Tempo | `docs/phase-19.md` |

## باگهای واقعی پیدا و رفعشده
کلاس CSS خراب (فاز ۱۵)؛ کنتراست تم روشن؛ `markRead` چت؛ ناهمخوانی AAD کد ملی خانواده؛ `z.coerce.boolean()`؛ اعلان تکراری بازنده رقابت پرداخت؛ تشخیص موبایل فارسی؛ **دو relation ناقص در Prisma و ۴ خطای تایپ از پیش موجود (فاز ۱۹)**؛ `callbackFor` و `parseDotenv`.

## وضعیت واقعی اجرا (فاز ۱۹)
- ✅ `corepack pnpm install` و `prisma generate` واقعاً اجرا شدند؛ `pnpm-lock.yaml` موجود است.
- ✅ `typecheck` واقعی `apps/api` و `apps/web` سبز است.
- ✅ تستهای جدید فاز ۱۹ با Vitest واقعی اجرا و سبز شدند (TOTP، reschedule، vitals، scribe، FHIR، OpenAPI **۱۲۰/۱۲۰ = ۱۰۰٪**).
- ✅ `corepack pnpm -r test` سبز: API ۵۲۰، Web ۱۶۸، shared ۱۴ (تستهای پیشین قرمز نیز اصلاح شدند).
- ✅ `corepack pnpm -r build` (API) و `NEXT_STANDALONE=false corepack pnpm --filter @nobatyar/web build` (وب، به دلیل محدودیت symlink ویندوز) سبزاند.
- ❌ هنوز اجرا نشدهاند: `prisma migrate deploy`، ESLint، Storybook، Playwright/بصری، integration با Postgres/Redis، k6 و CI واقعی.
- ✅ `openapi.json` و `api-types.generated.ts` با دستورات واقعی generate شدند (۱۲۰ عملیات).

## گامهای بعدی (بهترتیب)
1. `scripts/bootstrap-baseline.sh` + `pnpm ci:local` سبز و commit migrations/lockfile.
2. اجرای `db:phase19` روی Postgres محلی/Docker و سپس تست integration.
3. اجرای واقعی Playwright/k6 و commit baselineهای بصری.
4. ادامهٔ موارد باقیمانده: waitlist/no-show، Passkey، کیف پول/بیمه/payout، اجرای job حذف داده، ClamAV/PITR/CAPTCHA.
