# نوبتیار

پلتفرم نوبت‌دهی و مشاوره‌ی آنلاین پزشکی (RTL، فارسی).

## ساختار
```
apps/web          فرانت Next.js (RTL فارسی) — فاز ۴؛ جزئیات: docs/phase-4.md
apps/api          بک‌اند NestJS (Prisma/RLS، رمزنگاری فیلد، Audit، OTP/JWT، نقش‌ها، تأیید پزشک)
packages/shared   تایپ‌ها و قواعد مشترک (نقش‌ها، ماشین وضعیت نوبت)
infra/            تنظیمات زیرساخت (Postgres init)
docs/             مدل تهدید، طبقه‌بندی داده، سیاست حریم خصوصی، ER، قواعد نوبت
```

## شروع سریع
```bash
corepack enable
pnpm install
cp .env.example .env        # مقادیر را عوض کنید
pnpm --filter @nobatyar/api gen:keys   # کلیدها را در .env بگذارید
pnpm infra:up               # Postgres + Redis + MinIO + LiveKit
pnpm --filter @nobatyar/api db:init    # یک‌بار؛ جزئیات: docs/phase-1.md
pnpm --filter @nobatyar/shared build
pnpm --filter @nobatyar/api dev
curl localhost:3000/health
```

## دستورها
| دستور | کار |
|---|---|
| `pnpm lint / typecheck / test / build` | کنترل کیفیت (Turborepo) |
| `pnpm infra:up / infra:down / infra:reset` | مدیریت زیرساخت محلی |
| `pnpm ci:local` | همان کنترل کیفیت CI به‌صورت محلی |
| `pnpm test:int` | تست‌های integration (نیازمند Postgres/Redis؛ `docs/ci-cd.md`) |
| `pnpm hooks:install` | gitleaks به‌صورت pre-commit |

استقرار production با Docker + Caddy (TLS خودکار): `docs/deployment.md` (`Dockerfile`، `docker-compose.prod.yml`).

پشت reverse proxy برای SSE/WebSocket: `infra/nginx/nobatyar.conf` (`proxy_buffering off`).

## امنیت
- هرگز `.env` را commit نکنید؛ gitleaks در CI و pre-commit فعال است.
- CI/CD، branch protection و اسکن امنیتی: `docs/ci-cd.md` (پیش از اولین push: `pnpm-lock.yaml` را commit کنید).
- داده‌ی سلامت (HEALTH) هرگز در لاگ نیاید؛ نگاه کنید به `docs/data-classification.md`.

## نقشه‌ی راه
فاز ۰ ✅ ← فاز ۱ (`docs/phase-1.md`) ← فاز ۲ Auth و نقش‌ها (`docs/phase-2.md`) ← فاز ۳ چرخه‌ی نوبت (`docs/phase-3.md`) ← فاز ۴ فرانت‌اند (`docs/phase-4.md`) ← فاز ۵: پرداخت (**درگاه واقعی، failover، job بازبینی ✅ `docs/payment-gateway.md`؛ پنل ادمین و استرداد وجه ✅ `docs/refunds-admin.md`**) ← فاز ۶ چت/آپلود/پرونده (`docs/phase-6.md`) ← فاز ۷ ویزیت ویدئویی WebRTC/LiveKit (`docs/phase-7.md`) ← **فاز ۸ پرونده‌ی سلامت، triage، نظر دوم، SOAP، نسخه (`docs/phase-8.md`)** ← فاز ۹ (سخت‌سازی، **Redis pub/sub ✅ `docs/sse-redis.md`**، **E2E Playwright + k6 ✅ `docs/testing-e2e-load.md`**، **پایش/هشدار/پشتیبان/runbook ✅ `docs/go-live-checklist.md`**، **Sentry با scrubbing، PWA، Web Push ✅ `docs/monitoring-pwa.md`**) ← فاز ۱۰ (بتا عمومی، monitoring، SLA)
چک‌لیست فاز ۰: `docs/phase-0-checklist.md`

> عملیات و استقرار: `docs/operations.md` · اولین اجرای CI: `docs/ci-first-run.md`


- فاز ۱۶ (فرانت‌اند، توکن‌های طراحی، Storybook، UX): [docs/phase-16-frontend-ux.md](docs/phase-16-frontend-ux.md)
- فاز ۱۷ (بک‌اند: sid، OpenAPI، Idempotency، Outbox، Maker/Checker): [docs/phase-17-backend.md](docs/phase-17-backend.md)
- فاز ۱۸ (مانیتورینگ و عملیات، نیمه‌تمام): [docs/phase-18-ops.md](docs/phase-18-ops.md)
- **وضعیت جامع پروژه و اولین کارهای شما: [docs/PROJECT-STATUS.md](docs/PROJECT-STATUS.md)**
- **فاز ۲۴ — تکمیل نهایی تمام لایهها (Passkey، Ledger، Canary، SBOM، Read Model): [docs/phase-24-final.md](docs/phase-24-final.md)**
- پیشنهادهای بصری قابلانتخاب: [docs/phase-23-proposals.md](docs/phase-23-proposals.md) · صفحات `/design` و `/proposals`
- تصمیمات معماری: [docs/adr/](docs/adr/) · سیاست بودجهٔ خطا: [docs/error-budget-policy.md](docs/error-budget-policy.md)
