# چک‌لیست راه‌اندازی (go-live)

> هر خط باید «انجام شد + تاریخ + مسئول» داشته باشد. موارد ❌ در بخش «هنوز انجام نشده» تا پیش از انتشار عمومی بسته شوند.

## ۱. پیکربندی و رازها
- [ ] `.env.production` از `.env.production.example` ساخته شد، همه‌ی `change-me` ها رفتند؛ رازها با `gen:keys`/`openssl rand` ساخته و در گاوصندوق راز ذخیره شدند.
- [ ] **`node dist/preflight.cli.js .env.production` ⇒ «موفق ✓»** (sandbox/hook تست/رمز ضعیف/نقش مالک-برابر-اپ را رد می‌کند).
- [ ] نقش `nobatyar_app` بدون `BYPASSRLS/SUPERUSER` (CI این را می‌سنجد؛ روی production هم `\du`).
- [ ] DNS برای `DOMAIN` و `LIVEKIT_DOMAIN`؛ گواهی Caddy صادر شد؛ HSTS فعال.
- [ ] `IMAGE_TAG` = git sha (نه `local`).

## ۲. پرداخت و استرداد
- [ ] مرچنت واقعی زرین‌پال؛ `ZARINPAL_SANDBOX=false`؛ `ALLOWED_CALLBACK_ORIGINS` https.
- [ ] **یک پرداخت واقعی کم‌مبلغ** (مثلاً ۱۰٬۰۰۰ تومان) انجام و verify/نوبت‌تأیید دیده شد.
- [ ] `ZARINPAL_ACCESS_TOKEN` + یک استرداد واقعی ≥ ۲۰٬۰۰۰ ریال اجرا شد؛ **دو فرض `docs/refunds-admin.md` (session_id و نشانی GraphQL) تأیید شد** — وگرنه استرداد «دستی» می‌ماند.
- [ ] عملیات دستی استرداد (MANUAL → ثبت مرجع) یک بار تمرین شد.

## ۳. پایش و بازیابی
- [ ] `METRICS_TOKEN` + `docker-compose.monitoring.yml` بالا؛ Prometheus همه‌ی targets را UP نشان می‌دهد؛ مقصد Alertmanager واقعی است و **یک هشدار آزمایشی رسید** (مثلاً `docker compose stop worker` ⇒ `ApiInstanceDown`).
- [ ] Sentry (self-hosted یا در حاکمیت داده) + یک خطای آزمایشی بدون داده‌ی بیمار دیده شد.
- [ ] پشتیبان خودکار فعال؛ **حداقل یک تمرین بازیابی موفق** (`restore-drill.sh`) و RTO ثبت شد؛ کلید خصوصی age آفلاین و در دسترس چند نفر.
- [ ] پشتیبان بیرون از میزبان (`BACKUP_UPLOAD_CMD`) و dead-man's switch.

## ۴. امنیت و حریم خصوصی
- [ ] `docs/threat-model.md` و `docs/data-classification.md` مرور؛ pentest/بازبینی بیرونی (حداقل احراز هویت، RLS، پرداخت).
- [ ] متن شرایط/حریم خصوصی توسط مشاور حقوقی نهایی شد (`docs/privacy-policy-draft.md` فقط پیش‌نویس است)؛ مجوزهای لازم حوزه‌ی سلامت دیجیتال بررسی شد.
- [ ] `E2E_TEST_HOOKS` و `SMS_PROVIDER=memory/console` در production خاموش‌اند (preflight).
- [ ] ADMIN اولیه‌ی production با `create-admin` (شماره‌ی واقعی اپراتور، دو بار تأیید) ساخته شد؛ هیچ کاربر `0912000000x` در DB نیست؛ ورود ادمین پایش می‌شود (MFA ادمین هنوز باز است).
- [ ] آپلود و دانلود واقعی یک فایل (چت + پرونده) از مرورگر روی production آزمایش شد (`STORAGE_DOMAIN`، CORS، CSP، bucket خصوصی).
- [ ] `Repo integrity` سبز است (lockfile و migrations واقعی commit شده‌اند).

## ۵. کیفیت
- [ ] CI کامل سبز: unit، integration (Postgres)، **e2e-load** (Playwright + k6)، semgrep، trivy.
- [ ] `load/smoke-slo.js` روی محیط staging: p95 < 500ms، خطا < ۱٪.
- [ ] تست دستی روی موبایل واقعی: نصب PWA، Web Push (iOS نیازمند «افزودن به صفحه‌ی اصلی»)، ورود OTP با پیامک واقعی، ویدئو (LiveKit) پشت NAT.

## هنوز انجام نشده (مسئولیت با شما — در محیط ساخت قابل اجرا نبود)
❌ اجرای واقعی Playwright/k6/مهاجرت‌ها در CI • ❌ آزمون واقعی درگاه و استرداد • ❌ اجرای واقعی پشتیبان/بازیابی • ❌ پایش واقعی و هشدار • ❌ PITR (بایگانی WAL) • ❌ تأیید دو نفره‌ی استرداد • ❌ pentest.
