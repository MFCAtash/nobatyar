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
