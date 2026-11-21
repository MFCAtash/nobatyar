# فاز ۲۴ — تکمیل نهایی تمام لایهها

این سند آخرین مرحلهٔ نقشهراه است: تمام گزینههایی را که در صفحهٔ `/proposals` (سند `phase-23-proposals.md`) انتخاب کردهاید، به کد، پیکربندی و مستند تبدیل میکند.

## ۱) فرانت و تجربهٔ کاربر

| قابلیت | فایل | توضیح |
|---|---|---|
| Command Palette | `apps/web/src/components/CommandPalette.tsx` | جستجوی لحظهای پزشک/نوبت/پرونده با `Ctrl+K`، ناوبری با کیبورد، جستجوی دیبونس ۲۵۰ms |
| Drag-Reschedule | `apps/web/src/components/ReschedulePanel.tsx` | اسلاتها قابل کشیدناند و با رها کردن در ناحیهٔ هدف انتخاب میشوند |
| داشبورد قابلچینش | `apps/web/src/components/ReorderableCards.tsx` | ترتیب کارتهای پنل پزشک با Drag & Drop در localStorage ذخیره میشود |
| نمودار RPM پیشرفته | `apps/web/src/components/design/index.tsx` (`TrendChart`) + `app/vitals/page.tsx` | نوار بازهٔ طبیعی، خط روند، tooltip بومی SVG |
| تم فصلی و ساعتی | `design/tokens.json`, `ThemeProvider.tsx`, `app/design/page.tsx` | ۳ تم فصلی (بهار/تابستان/پاییز) + تم تطبیقی بر اساس ساعت (بعد از ۱۹ شبانه) |
| Voice Search | `components/home/HomeView.tsx` | Web Speech API با زبان `fa-IR` |
| اتاق انتظار مجازی | `app/appointments/[id]/waiting/page.tsx` | شمارش معکوس، چکلیست ذخیرهشونده، تست دوربین/میکروفون |
| Pre-check هوشمند | `app/precheck/page.tsx` | چکلیست مدارک پیش از ویزیت (ذخیره محلی، بدون انتقال دادهٔ سلامت) |
| قالب SOAP | `app/appointments/[id]/soap/page.tsx` | سه قالب: روتین، پیگیری، علائم حاد |
| NPS و پشتیبانی | `components/NpsCard.tsx`, `app/support/page.tsx` | نظرسنجی ۱–۱۰ و تیکت با SLA ۲۴ ساعته |
| Passkey در مرورگر | `app/security/page.tsx` | ثبت و ورود با `@simplewebauthn/browser` |
| کیف پول | `app/wallet/page.tsx` | موجودی، شارژ، تاریخچه، تسویه و بیمه |

تمها و فونتها بهصورت بصری در `/design` و ایدهها در `/proposals` قابلانتخاباند. پیشفرض: `emerald-night` + شهرزاد + لوگوی نستعلیق.

## ۲) بکاند و دیتابیس

### لیست انتظار (`waitlist`)
- `apps/api/src/appointments/waitlist-policy.ts` — تطابق خالص و تستپذیر اسلات آزادشده با بازهٔ دلخواه.
- `waitlist.service.ts` — حداکثر ۳ پیشنهاد به هر بیمار، انقضای ۷روزه، Audit و اعلان via Outbox/Notification.
- وقتی نوبتی به حالت پایانی میرسد (`appointments.service.ts`) پوش آزادشده به لیستانتظار فرستاده میشود؛ شکست آن وضعیت نوبت را برنمیگرداند.
- job ساعتی `expireStale()` در `scheduler.service.ts`.

### Ledger مالی (`wallet`)
- جداول: `wallet_accounts`, `ledger_transactions`, `ledger_entries`, `payouts`, `insurance_policies`.
- قید دیتابیس: `ΣDEBIT = ΣCREDIT` با constraint trigger deferable، موجودی غیرمنفی، مبلغ مثبت.
- نوشتن فقط در context سیستمی؛ مجوزدهی در سرویس؛ idempotency با کلید منحصربهفرد.
- حسابهای سیستمی: `GATEWAY_CLEARING`, `PLATFORM_REVENUE`, `PAYOUT_CLEARING`, `INSURANCE_CLEARING`.
- شمارهٔ بیمه با `FieldCrypto` و AAD رمزنگاری میشود.
- شارژ کیف پول در production مسدود است مگر `ALLOW_WALLET_TOPUP=true` و تأیید درگاه.

### Audit Chain Verifier
- `apps/api/src/audit/audit-verifier.service.ts` — فراخوانی تابع `verify_audit_chain()` دیتابیس.
- `GET /admin/audit/verify` (فقط ADMIN) + بررسی روزانه توسط maintenance worker.

### CQRS / Read Model
- `v_doctor_daily_stats` با `security_invoker=true` (RLS اعمال میشود).
- `GET /doctor/stats/daily` و `/summary`.

### Passkey / WebAuthn
- `@simplewebauthn/server` + `@simplewebauthn/types` + `@simplewebauthn/browser`.
- چالش ۵دقیقهای و یکبارمصرف (`ChallengeStore`)، محدودسازی نرخ، ذخیرهٔ counter و پرچم پشتیبانگیری، Audit کامل.
- متغیرها: `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`.

## ۳) امنیت و DevOps
- `.github/workflows/release.yml` — SBOM (SPDX) با Syft، امضای keyless Cosign، گواهی منبع SLSA و تأیید امضا.
- `.github/workflows/canary.yml` + `infra/canary/rollout.yaml` + `scripts/canary-gate.sh` — استقرار ۱۰←۲۵←۵۰←۱۰۰٪ با دروازهٔ بودجهٔ خطا و بازگشت خودکار.
- `infra/vault/vault.hcl` — پیکربندی نمونهٔ رازها و unseal با KMS.
- `infra/nginx/waf-rules.conf` — محدودساز نرخ مسیرهای احراز هویت، مسدودسازی رباتها، هدرهای امنیتی و صفحهٔ چالش ۴۲۹.
- `docs/error-budget-policy.md` — قواعد توقف استقرار بر اساس بودجهٔ خطا.
- `docs/adr/*` — ۵ تصمیم معماری شمارهدار.

## ۴) تست و کیفیت
- OpenAPI: **۱۴۶/۱۴۶ عملیات مستند (۱۰۰٪)** و فایل `api-types.generated.ts` بهروزرسانی شد.
- تستهای تازه: `waitlist-policy.test.ts`, `passkey-challenge.test.ts`, `posting.test.ts`.
- CI موجود: Jest/Vitest، integration با Postgres/Redis، Storybook axe + visual regression، Playwright E2E، k6، Trivy/Semgrep/gitleaks، preflight، fail-closed و Docker.
- `load/booking-journey.js` — پروفایل بار تدریجی با آستانهٔ p95.

## ۵) مهاجرتهای دیتابیس
- `prisma/sql/phase24-backend.sql` و فهرست `prisma/sql/ORDER`.
- migrationها توسط `node apps/api/scripts/generate-baseline-migrations.mjs` بازتولید شدند (۱۳ migration).
- اعمال روی دیتابیس واقعی: `corepack pnpm --filter @nobatyar/api db:deploy` (یا `db:phase24` در محیط توسعه).

## ۶) وضعیت اجرای دستورات در محیط توسعه
- ✅ `pnpm -r typecheck`
- ✅ `pnpm -r test` / Vitest وب و API
- ✅ build وب و API (با `NEXT_STANDALONE=false` در ویندوز)
- ⚠️ مهاجرت روی Postgres واقعی، Playwright/k6 با سرویسهای واقعی و استقرار Canary نیاز به محیط CI/خوشه دارند.

## ۷) گام بعدی پیشنهادی
1. اجرای `sh scripts/ci-db-setup.sh` سپس `pnpm --filter @nobatyar/api test:int` روی Postgres محلی.
2. دانلود baselineهای بصری از job `storybook` و commit آنها در `apps/e2e/visual/__snapshots__`.
3. تنظیم `WEBAUTHN_RP_ID` و `WEBAUTHN_ORIGIN` برای دامنهٔ واقعی و تست Passkey روی دستگاه فیزیکی.
4. committing تمام تغییرات (مخزن فعلاً هیچ commit ندارد).
