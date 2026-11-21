# CI/CD نوبتیار

## نقشه‌ی pipeline
هر PR و هر push به `main` workflow ی `.github/workflows/ci.yml` را اجرا می‌کند. jobها موازی‌اند و همه شرط job ی «**CI gate**» هستند؛ فقط همین یک چک در branch protection اجباری می‌شود.

| Job | کار | شکست یعنی |
|---|---|---|
| Workflow lint | actionlint روی workflowها | workflow خراب است |
| Lint & typecheck | ESLint + `tsc` برای shared/api/web | کد استاندارد/تایپ را نمی‌شکند |
| Unit tests | vitest همه‌ی workspaceها | منطق دامنه خراب شده |
| Build | shared → api → web (Next) | محصول build نمی‌شود |
| Integration | Postgres 16 + Redis 7 واقعی | RLS، ضد double-booking، Audit، auth، Redis یا boot API خراب است |
| Secret scan | gitleaks (PR: commit های همان PR) | secret وارد git شده |
| SAST | semgrep؛ ERROR مسدودکننده، WARNING اطلاعاتی | الگوی ناامن (قواعد `.semgrep/nobatyar.yml`) |
| Trivy | آسیب‌پذیری HIGH/CRITICAL با `ignore-unfixed`، secret، misconfig | وابستگی آسیب‌پذیرِ دارای patch |

workflow ی `security-scheduled.yml` هر دوشنبه Trivy، `pnpm audit` و gitleaks (کل تاریخچه) را اجرا می‌کند تا آسیب‌پذیری‌های تازه‌کشف‌شده‌ی وابستگی‌های قدیمی هم دیده شوند.

## Integration job چه می‌کند؟
1. service container های `postgres:16-alpine` و `redis:7-alpine`.
2. `scripts/ci-db-setup.sh`: افزونه‌ها (`init.sql`)، نقش `nobatyar_app` بدون superuser/BYPASSRLS (`01-roles.sh`)، سپس `prisma migrate deploy`. اگر `prisma/migrations` commit شده باشد همان اجرا می‌شود؛ وگرنه موقتاً از `schema.prisma` و `hardening → phase3 → phase7 → phase8` ساخته می‌شود. در پایان تأیید می‌کند نقش اپ BYPASSRLS ندارد.
3. `pnpm --filter @nobatyar/api test:int` (شامل `redis.int.test.ts` روی Redis واقعی).
4. Boot smoke: API ساخته‌شده‌ی `dist/main.js` با `ENABLE_WORKERS=true` بالا می‌آید، `/api/v1/health` باید `ok` بدهد و لاگ «maintenance worker started» (BullMQ روی Redis واقعی) باید دیده شود.

## اجرای محلی
```bash
pnpm ci:local            # lint + typecheck + test + build
pnpm infra:up            # Postgres/Redis محلی
pnpm ci:db               # نیازمند env های بخش integration (نمونه: ci.yml)
pnpm test:int            # با TEST_OWNER_URL / TEST_APP_URL / TEST_REDIS_URL
pnpm hooks:install       # gitleaks به‌صورت pre-commit
```

## راه‌اندازی یک‌باره (الزامی)
1. **`pnpm install` بزنید و `pnpm-lock.yaml` را commit کنید.** در zip فاز ۸ این فایل وجود نداشت؛ CI عمداً بدون آن شکست می‌خورد (`--frozen-lockfile`).
2. `pnpm db:init` را اجرا و پوشه‌ی `apps/api/prisma/migrations` را commit کنید. (تا آن زمان CI مهاجرت را موقتاً می‌سازد.)
3. branch protection: `sh scripts/setup-branch-protection.sh` (پس از اولین اجرای CI). تنظیمات: چک «CI gate»، branch به‌روز، ۱ review، بدون force-push، تاریخچه‌ی خطی، حل‌شدن comment ها، اعمال برای ادمین‌ها.
4. Dependabot خودکار فعال است (`.github/dependabot.yml`: npm، GitHub Actions، docker-compose؛ هفتگی و گروه‌بندی‌شده). در Settings → Security، «Dependabot alerts» را هم روشن کنید.
5. تصمیم درباره‌ی Renovate: اگر به‌جای Dependabot خواستید، `dependabot.yml` را حذف کنید.

## Secret ها و متغیرها
CI هیچ secret واقعی لازم ندارد. رمزهای دیتابیس فقط برای container های موقتِ همان job هستند (`ci_owner_pw`/`ci_app_pw`؛ در `.gitleaks.toml` مجاز شده‌اند). بعداً برای deploy از GitHub Environments با reviewer اجباری استفاده کنید، نه secret سطح repo.

## قواعد نگهداری
- **Trivy:** فقط HIGH/CRITICAL و فقط دارای patch. استثنا فقط در `.trivyignore` با دلیل و تاریخ انقضا.
- **semgrep:** قاعده‌ی `nobatyar-payment-verify-stub` اکنون WARNING است چون stub پرداخت (`const verified = true`) هنوز در `payment.service.ts` هست. پس از پیاده‌سازی تأیید واقعی زرین‌پال آن را به `ERROR` تبدیل کنید تا بازگشت stub غیرممکن شود.
- **Pin کردن actions:** اکنون روی tag اصلی‌اند؛ برای سخت‌سازی بیشتر Dependabot می‌تواند SHA ها را pin و به‌روز کند.
- **عیب‌یابی Integration:** artifact ی `api-log` در شکست smoke بارگذاری می‌شود.

## هنوز در این بخش نیست
Dockerfile و deploy (بخش ۳)، E2E/k6 (بخش ۵)، پوشش تست (نیازمند افزودن `@vitest/coverage-v8` و به‌روزرسانی lockfile).


## پرداخت (fail-closed)
job ی integration پس از smoke، API را با `NODE_ENV=production` و (الف) `ZARINPAL_SANDBOX=true` (ب) `PAYMENT_GATEWAY=sandbox` بالا می‌آورد و **باید** شکست بخورد. قاعده‌ی semgrep ی `nobatyar-payment-verify-stub` و `nobatyar-payment-trust-browser-status` از نوع ERROR هستند. `docs/payment-gateway.md`
