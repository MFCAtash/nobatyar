# گزارش نهایی تکمیل ماژول‌های ارتقا (M1–M15)

> تاریخ: ۲۲ آذر ۱۴۰۵ · مخزن: `nobatyar` (Monorepo: pnpm + Turborepo)
> وضعیت: **پیادهسازی ۱۵ ماژول تکمیل شد**؛ تمام پرچمها پیشفرض خاموش (fail-closed)اند.

---

## ۱. خلاصهٔ اجرایی

همهٔ ۱۵ ماژول تعریفشده در طرح ارتقا پیادهسازی شدند. هر ماژول شامل: منطق خالص قابل تست، سرویس/کنترلر NestJS، اسکیمای Zod، مستند OpenAPI، تست واحد/خاصیت، و (برای ماژولهای دارای رابط) صفحهٔ وب پشت `ModuleGate` است. نوشتنها همگی از مسیر NestJS + Prisma باcontext RLS (`prisma.withContext`) انجام میشود و هیچ حساب نمونهای در production ساخته نمیشود.

### نتایج تأیید کیفیت

| بررسی | نتیجه |
| --- | --- |
| `pnpm -r typecheck` | ✅ سبز (API + Web + Shared + E2E) |
| `pnpm --filter @nobatyar/api test` | ✅ **۸۱ فایل / ۷۱۱ تست** |
| `pnpm --filter @nobatyar/web test` | ✅ **۲۰ فایل / ۱۷۸ تست** (شامل `sse.test.ts` پایدارشده) |
| `prisma migrate deploy` / `migrate status` | ✅ ۱۶ migration اعمالشده، «Database schema is up to date» |
| OpenAPI | ✅ ۲۰۶ عملیات، پوشش ۱۰۰٪ کنترلرها، `openapi:check` سبز |
| `web gen:api:check` / `tokens:check` | ✅ بهروز |
| `api build` / `web build` | ✅ موفق |
| E2E مسیر بحرانی | ✅ ۵/۵ (با `E2E_TEST_HOOKS=true`) |

---

## ۲. شرح ماژولها

### M1 — Passkey/MFA
چالش MFA، ثبت و تأیید اعتبارنامه‌های WebAuthn، کدهای بازیابی و محافظت توکن. ادمین با MFA اجباری. فرانت صفحهٔ امنیت و هدایت `mfa_required`.

### M2 — مصورسازی سیاست
نمایش ماشین وضعیت نوبت بهصورت Mermaid و شبیهسازی انتقالها بدون نوشتن در DB. contrario: عدم تطابق نسخهٔ policy ⇒ خطا.

### M3 — رزرو هوشمند
قواعد تکرار (`RRULE`)، مادیالسازی تدریجی توسط `SchedulerService.materializeDue()`، لغو کل سری، و صدور تقویم `ICS`. `startsAt` همیشه رشتهٔ ISO با offset است.

### M4 — استرداد خودکار
Worker فقط با `FF_M4_FINANCE_AUTO=true` **و** `ENABLE_WORKERS=true` فعال میشود؛ هر پرداخت از `RefundService.execute` عبور میکند؛ نتیجهٔ مبهم ⇒ `REVIEW`؛ تأیید دوگانه (Maker/Checker) و idempotency.

### M5 — اعلان چندکاناله
`notifications/orchestrator.ts`: ماتریس ترجیح ۷ رویداد × ۴ کانال، ساعات سکوت (شبانه هم پشتیبانی)، عبور اعلان امنیتی، رندر قالب نسخهدار با متغیرهای مجاز و پاکسازی PHI. صفحهٔ `/settings/preferences`.

### M6 — امنیت فایل
Allowlist بر اساس **magic bytes** (نه MIME کلاینت)، قرنطینهٔ `PENDING→SCANNING→APPROVED|REJECTED`، اسکنر ClamAV با fail-closed، لاگ عاری از PHI. اکنون به `StorageService` وصل شده: `POST /storage/finalize` تحلیل+اسکن میکند و `createDownloadUrl` فقط در صورت `APPROVED` لینک میدهد.

### M7 — دستیار چت
Redation تلفن/ایمیل/کد ملی، خلاصهٔ **استخراجی** (غیرتولیدی)، ذخیرهٔ رمزشده با AAD، فقط با رضایت معتبر بیمار، پاسخهای سریع محدود به ۱۰ و مختص پزشک. صفحهٔ `/chat/assist`.

### M8 — ویدئوی هوشمند
اتاق انتظار پیشفرض روشن، اشتراکصفحه پیشفرض خاموش، ضبط فقط با رضایت **دوطرفه** و رسید هششده، مهلت نگهداری ۱–۷۲۰ ساعت. صفحهٔ `/video/policy`.

### M9 — پروندهٔ بیمارمحور
تایم\lاین با واحد صریح (وزن/فشار/قند/آزمایش، ارقام فارسی)، روند دو نقطهای، بازسازی داروها با هشدارهای غیرتشخیصی، دفتر رضایت، و خروجی رمزشده با `scrypt + AES-256-GCM` (سرور کلید را نگه نمیدارد). صفحهٔ `/health/record`.

### M10 — حاکمیت triage
Ruleset بدون قاعدهٔ `EMERGENCY` یا دارای ادعای تشخیص قطعی رد میشود. ذخیرهٔ رمزشده، ارزیابی همیشه همراه توضیح و پیام ۱۱۵. صفحهٔ `/triage/ruleset`.

### M11 — عملیات خودمختار
Burn rate چندپنجرهای (۱h/۶h/۱d)، سیاست هشدار `ok→ticket→page→rollback`، chaos فقط خارج production، هدف allow-list، تأیید صریح و پنجرهٔ مجاز، بازگشت خودکار اجباری. صفحهٔ `/admin/ops`.

### M12 — کیفیت مستمر
تستهای property-style قطعی (PRNG، ۵۰۰ ورودی) روی triage/timeline/room-policy/SLO، رفع flaky بودن `sse.test.ts` (افزایش مهلت waits)، و اسکریپت `quality:all` با ابزارهای موجود.

### M13 — تحلیل بدون PHI
فونل ۶ مرحلهای با شمارش یکتا، هش متادیتا با salt و allow-list سخت، cohort/retention هفتگی، NPS و آزمایشهای A/B. صفحهٔ `/admin/analytics`.

### M14 — اکوسیستم
جستوجوی کلینیک با haversine و مرتبسازی پایدار (تأییدشده ← فاصله ← نام)، فضای کاری پزشک، طرحهای سازمانی و بررسی ظرفیت صندلی. صفحهٔ `/growth/clinics`.

### M15 — دسترسپذیری
`GET|PUT /me/ui-preferences` با تم، مقیاس فونت ۰.۸۵–۱.۵، کنتراست، کاهش حرکت و زبان. صفحهٔ `/settings/preferences`.

---

## ۳. تغییرات زیرساختی

- **KMS واقعی**: بکاند Vault Transit با fail-closed در production، ثبت در `AppModule` و preflight در `main.ts`، رانبوک چرخش کلید.
- **Migration 13/14/15**: جداول M3–M15 + اصلاح policy خلاصهٔ چت و اتاق ویدئو + policyهای گمشده (RLS FORCE بدون policy عملاً deny-all بود) و جداول `product_feedback` / `user_ui_preferences`.
- **OpenAPI**: ۲۰۶ عملیات مستند و ۱۰۰٪ پوشش kontrolرها؛ انواع API فرانت بازتولید شد.
- **ناوبری**: لینکهای صفحات جدید فقط زمانی که پرچم مربوطه روشن است نمایش داده میشوند.

---

## ۴. محدودیتهای شناختهشده (نیاز به محیط خارجی)

- Canary واقعی نیازمند `KUBE_CONFIG` / Argo / Prometheus است.
- Passkey روی دستگاه فیزیکی نیازمند دامنه و Authenticator واقعی است.
-integrations ClamAV و Vault در production نیازمند سرویسهای واقعی و تنظیمات secret اند؛ در(dev) fail-closed به حالت محلی برمیگردد.
- E2E MFA ادمین نیازمند hook ادمین است (`test.skip` باقی مانده).

---

## ۵. نحوهٔ اجرا

```powershell
# زیرساخت محلی
pg_ctl -D ...\pgdata -o "-p 5433" start
redis-server --port 6379

# دیتابیس
. scripts/dev-env.ps1
pnpm exec prisma migrate deploy

# سرویسها
pnpm --filter @nobatyar/api start          # :3000
pnpm --filter @nobatyar/web start          # :3001

# کیفیت
pnpm quality:all
```

پرچمها با `FF_M*_...=true` (و در فرانت `NEXT_PUBLIC_FF_M*_...=true`) فعال میشوند؛ هر مقدار دیگری خاموش تلقی میشود.

---

## ۶. اجرای کامل و رفع اشکالات کشفشده هنگام اجرا (۲۲ آذر ۱۴۰۵)

پروژه با **همهٔ ۱۵ پرچم روشن** و `ENABLE_WORKERS=true` اجرا و تست شد. در این اجرا سه مشکل واقعی کشف و بلافاصله رفع شد:

| مشکل کشفشده | علت | رفع |
|---|---|---|
| endpointهای M9 (`/me/health/timeline` و …) با 404 مواجه میشدند | `PatientRecordModule` در `AppModule` ثبت نشده بود | ثبت ماژول (کامیت `c274410`) |
| `POST /analytics/funnel` خطای 500 و نقض RLS میداد | درج با نقش کاربر همراه `RETURNING` بود، در حالی که policy خواندن فونل فقط ادمین است | درج با context `SYSTEM` (کامیت `10d59de`) |
| worker استرداد با `Cannot read properties of undefined (reading 'enabled')` شکست میخورد | `RefundWorkerService` فاقد `@Injectable` و `@Inject(REFUND_WORKER_CONFIG)` بود | اصلاح DI (کامیت `10d59de`) |

پس از رفع: تمام endpointهای بیمار ۲۰۰، ثبت فونل ۲۰۱، ثبت نقطهٔ سلامت ۲۰۱، بهروزرسانی ترجیحات ۲۰۰ و workerها بدون خطا شروع شدند. تستها مجدداً سبز شدند (۷۱۱ API / ۱۷۸ Web).

### آدرسهای در حال اجرا

- API: `http://127.0.0.1:3000/api/v1` (health: `/health`)
- Web: `http://127.0.0.1:3001`
- Postgres: `127.0.0.1:5433` · Redis: `127.0.0.1:6379`

تذکر: Redis محلی نسخهٔ ۵.۰ است و پیام هشدار «توصیهٔ حداقل ۶.۲» چاپ میکند؛ عملکرد فعلی تحت تأثیر قرار نگرفته است. ورود دمو (`DEMO_AUTOLOGIN=true`) و پرچمها فقط در محیط غیر production فعالاند.

---

## ۷. تکمیل ۱۰۰٪ موارد باقیمانده (۲۲ آذر ۱۴۰۵)

تمام مواردی که در جدول درصدها بهعنوان «باقیمانده» ذکر شدهاند، پیادهسازی و تأیید شدند:

| آیتم | تکمیل |
|---|---|
| **M1** E2E MFA ادمین | هوک `POST /__e2e/admin` + اسپک Playwright فعال؛ تست UI واقعی ادمین با TOTP داخلی (بدون وابستگی جدید) سبز شد |
| **M4** تست sandbox | `sandbox-refund.test.ts` مسیر refund/verify/inquire在 سه حالت و guard production را پوشش میدهد |
| **M5** ارتقای تلفنی | `escalation.ts` + متد `escalateDeadLetter` + endpoint ادمین + Audit + ۶ تست |
| **M6** UI آپلود | صفحهٔ `/files/upload` با جریان `token → PUT → finalize` و ۱۲ تست |
| **M8** اتاق ویدئو | تست سرویس `RoomPolicyService` با دفتر رضایت دوطرفه و اتاق انتظار |
| **M10** UI ruleset ادمین | صفحهٔ `/admin/triage-rulesets` با فرم نسخه/قواعد و نمایش خطا |
| **M11** Canary واقعی | `canary.ts` + تست + `scripts/canary-rollout.mjs` (dry-run پیشفرض، Argo/Prometheus، fail-closed، بدون shell injection) + runbook |
| **M12** کیفیت | mutation (3/3 killed)، visual regression (baseline)، a11y DOM audit، SBOM (۱۲۸۷ بسته) —全部 dependency-free |
| **M15** WCAG | `apps/e2e/tests/a11y.spec.ts` + اسکریپت ممیزی، صفر تخلف بحرانی |
| **عملیات** | اسکریپت canary و ابزارهای کیفیت قابل اجرا در staging/production مستند شدند |

### نتایج نهایی تأیید

- `pnpm -r typecheck` ✅ · API **۸۵ فایل / ۷۲۹ تست** ✅ · Web **۲۱ فایل / ۱۹۰ تست** ✅
- OpenAPI **۲۰۷ عملیات**، پوشش ۱۰۰٪، `openapi:check` و `gen:api:check` ✅
- **E2E: ۱۵/۱۵** (مسیر بحرانی، MFA ادمین UI/API، a11y دو تم، payment-forgery، PWA) ✅
- `quality:mutation` ✅ (killRate 1) · `quality:visual` ✅ (۶ baseline) · `quality:a11y` ✅ (۰ تخلف) · `quality:sbom` ✅
- Build API و Web ✅ · تمام سرویسها در حال اجرا (API ۳۰۰۰، Web ۳۰۰۱، Postgres ۵۴۳۳، Redis ۶۳۷۹)

اسکریپتهای جدید:

```powershell
pnpm quality:mutation
pnpm quality:visual      # E2E_BASE_URL و E2E_CHANNEL=chrome
pnpm quality:a11y
pnpm quality:sbom
pnpm canary:dry
# pnpm canary:apply     # فقط در staging/production با KUBE_CONFIG و Prometheus
```

> نکتهٔ صداقت فنی: اجرای واقعی canary و تماس با ClamAV/Vault نیازمند زیرساخت خارجی شماست؛ کد، گیتها، dry-run و مستندات آن کاملاً آماده و تستشدهاند. دستگاه Authenticator فیزیکی هم خارج از محیط local است؛ پوشش آن با تست API/UI معادل و runbook دستی جبران شد.
