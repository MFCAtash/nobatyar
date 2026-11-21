# فاز ۲۰ — ممیزی بکاند/دیتابیس + پیشنهاد طراحی و تجربه کاربری

> ✅ تمام موارد A0–A11 و B0–B10 در فاز ۲۱ پیادهسازی شدند: `docs/phase-21-implementation.md`.

این سند **بررسی** است، نه ادعای اتمام کار. تمام موارد با خواندن کد واقعی مخزن استخراج شدهاند. در انتها یک نقشهٔ راه اولویتبندی شده آمده است.

---

## بخش الف — مشکلات واقعی بکاند و دیتابیس

### A0. بلوکر استقرار: مهاجرتهای Prisma وجود ندارند
- `apps/api/prisma/migrations` در مخزن **وجود ندارد**؛ تنها `prisma/sql/ORDER` و فایلهای SQL امنیتی و `pnpm-lock.yaml` موجوداند.
- پیامد: `prisma migrate deploy` روی محیط تازه شکست میخورد؛ `db:phase19` هم نمیتواند «diff» معنیداری بسازد مگر اینکه baseline ساخته شده باشد.
- **پیشنهاد:** اجرای `scripts/bootstrap-baseline.sh` روی یک Postgres محلی/Docker، commit کردن تمام migrationها، و اضافه کردن چک CI مبنی بر اینکه هر ورودی `prisma/sql/ORDER` معادل یک دایرکتوری migration دارد.

### A1. راهاندازی ادمینها با MFA قفل میشود (fail-closed ولی بدون مسیر فرار)
- `ADMIN_REQUIRE_MFA` بهطور پیشفرض `true` در production است و `MfaGuard` تمام مسیرهای ادمین را بدون claim ی `mfa` مسدود میکند.
- هیچ ادمین seedشدهای راز TOTP ندارد ⇒ بلافاصله پس از استقرار تمام ادمینها قفل میشوند.
- **پیشنهاد:** (۱) مسیر break-glass حسابشده: متغیر `ADMIN_MFA_BREAK_GLASS_TOKEN` فقط برای فرآیند یکبارهای ثبت راز؛ (۲) یا rollout تدریجی: پیشفرض `false` تا زمانی که حداقل ۲ ادمین راز تأییدشده ثبت کنند و سپس با ادمین سوم فعالسازی؛ (۳) چک `preflight` برای هشدار «هیچ ادمین دارای MFA وجود ندارد».

### A2. `enroll` میتواند راز TOTP فعال را بازنویسی کند
- `MfaService.enroll` هر بار راز و کدهای پشتیبان را مینویسد، حتی اگر `mfaEnabledAt` از قبل تنظیم شده باشد. توکن قدیمی دارای claim ی mfa باقی میماند ولی کد جدید تنها راز معتبر است ⇒ قفل خودکار ادمین.
- **پیشنهاد:** مسیر جداگانه `POST /me/mfa/rotate` با الزام تأیید کد فعلی؛ `enroll` در صورت `enabled` با 409 رد شود؛ راز جدید تنها بعد از تأیید جایگزین شود.

### A3. RLS و API پایش از راه دور: دسترسی پزشک گسترده و غیرقابلانتساب است
- `phase19-backend.sql` به پزشک اجازه میدهد **هر** اندازهگیری بیمار را در صورتی که **هر زمان** نوبتی با هم داشته (حتی لغوشده/منقضی) بخواند.
- `VitalsService.present()` فاقد `patientId`/نام بیمار است ⇒ پزشک نمیتواند بفهمد اندازهگیری مربوط به کدام بیمار است.
- **پیشنهاد:** محدود کردن RLS به نوبتهای `CONFIRMED/COMPLETED/IN_PROGRESS` + رضایت فعال `HEALTH_DATA_PROCESSING`؛ اضافه کردن `patientId` (و نام ماسکشده) به پاسخ؛ paginate با cursor؛ جلوگیری از `source:"DEVICE"` بدون مدل اثبات دستگاه.

### A4. TTL دستیار بالینی اجرا نمیشود
- `ScribeService.purgeExpired()` وجود دارد ولی **هیچ job ای آنرا صدا نمیزند** (برخلاف پاکسازی idempotency و relay ی outbox). متن خام رمزنگاریشده پس از ۱۵ دقیقه فیزیکی پاک نمیشود.
- **پیشنهاد:** ثبت repeatable job در `jobs/scheduler.service.ts` (مثلاً هر ۵ دقیقه) + متریک `scribe_purged_total` و هشدار هنگام انقضای غیرمعمول.

### A5. `applyToSoap` فاقد بهروزرسانی خوشبینانه است
- `applyToSoap` بدون `expectedVersion` صدا میزند ⇒ پیشنویس AI میتواند ویرایش همزمان پزشک را بازنویسی کند.
- **پیشنهاد:** ارسال `expectedVersion` از GET SOAP و استفاده از همان condition ی `saveDraft`.

### A6. درخواست حذف داده اجراکننده ندارد
- `DataRequest(DELETE)` فقط ثبت میشود؛ هیچ سرویس/job آن را به `IN_PROGRESS/COMPLETED` منتقل نمیکند.
- **پیشنهاد:** صفحه انطباق با تأیید دو نفره، دورهٔ grace ۳۰ روزه، حذف فیزیکی داده + پیوستها + ثبت ممیزی، و اعلان به بیمار. حداقل فعلی: افزودن SLA و صف ادمین.

### A7. FHIR خروجی «کامل» نیست
- `DocumentReference.content.attachment` تنها عنوان/نوع مدرک دارد، محتوای رمزگشایی شده ارسال نمیشود؛ تمام Conditionها «active» ثبت میشوند.
- **پیشنهاد:** گزینهٔ `include=documents` با data/base64 تحت رضایت صریح؛ نگاشت وضعیت و تاریخ واقعی تشخیص؛ `meta.security` و ETag؛ export ناهمزمان job برای پروندههای بزرگ.

### A8. OpenAPI ۱۰۰٪ سطحی است
- ۱۲۰/۱۲۰ مسیر مستنداند ولی حدود ۵۳ مسیر بدون body/query/response schemaاند؛ بنابراین «type-safety واقعی فرانت» هنوز محقق نشده است.
- **پیشنهاد:** تکمیل Zod اسکیمای ورودی تمام مسیرها و اضافه کردن چک CI مبنی بر غیر `any` بودن تایپهای generated.

### A9. ناهمخوانی نسخه OpenTelemetry
- در درخت وابستگی دو نسخه `sdk-trace-base` (۱٫۲۸ و ۱٫۳۰) وجود دارد؛ خطای تایپ با `as never` پوشانده شد ولی خطر ناسازگاری runtime در exporter باقی است.
- **پیشنهاد:** `pnpm.overrides` برای تک نسخه کردن `@opentelemetry/*` و حذف type-cast.

### A10. قید SQL با `now()` و مسائل RLS ریزدانه
- `vital_readings_measured_not_future` از `now()` داخل CHECK استفاده میکند (معنای dump/restore متغیر است).
- Policyهای `FOR ALL` روی `appointment_waitlist` و `data_requests` به بیمار اجازه میدهد فیلد `status` را مستقیم تغییر دهد.
- **پیشنهاد:** انتقال چک زمان به trigger؛ ممنوع کردن UPDATE status توسط نقش اپ و اختصاص آن به SYSTEM از طریق SECURITY DEFINER function.

### A11. فیلدهای بدون مصرف
- `Appointment.noShowRisk` / `riskScoredAt` فقط در اسکیمااند، هیچ کد آنها را مینویسد یا میخواند.
- **پیشنهاد:** یا پیادهسازی امتیازدهی no-show (با audit و توضیحپذیری) یا حذف موقت فیلدها تا گیجکننده نشوند.

---

## بخش ب — مشکلات واقعی فرانت و طراحی ظاهری

### B0. نقص دسترسپذیری: `<main>` تو در تو (من ایجاد کردم)
- `layout.tsx` از قبل دارای `<main id="main">` است؛ صفحات `/status`، `/vitals`، `/privacy`، `/admin/security` هر کدام دوباره `<main>` رندر میکنند.
- پیامد: دو landmark اصلی، هدف skip-link اشتباه، کاهش کیفیت axe.
- **پیشنهاد:** آن چهار صفحه به `<div className="stack">` تغییر یابند؛ `layout` تنها مرجع main باقی بماند.

### B1. هدر در موبایل با لینکهای زیاد اشباع میشود
- منوی بیمار اکنون ۹ لینک بهعلاوه اعلان، تم و خروج است و `.nav` فقط `flex-wrap` میکند ⇒ در موبایل چند ردیف و sticky header فضای زیادی میگیرد.
- **پیشنهاد:** الگوی «ناوبری گروهی»: لوگو + ۳ آیکون اصلی + دکمهٔ «بیشتر» با drawer؛ گروهبندی بر اساس نقش؛ `aria-expanded`، تمرکز قابلاندازهگیری و بستن با Escape.

### B2. سیستم تم محدود به dark/light و هویت بصری «نئون–glass» است
- `design/tokens.json` فقط دو تم دارد؛ رنگ غالب `#00e6b8` روی پسزمینه تقریباً سیاه، همراه با gradient و blur زیاد.
- برای سلامت، اعتماد و خوانایی سالمندان، نیاز به پالت آرامتر، کنتراست بالاتر و حالتهای نقشمحور است.
- **پیشنهاد:** tokens v2 (بخش ج).

### B3. تم وارداتی ناسازگار با وضعیت اولیه
- اسکریپت inline تم را از localStorage میخواند ولی state ی `Header` را همیشه `"dark"` مقداردهی میکند و در effect اصلاح مینماید ⇒ فلش/ناهنگامی کوتاه.
- **پیشنهاد:** `ThemeProvider` واحد با context، مقادیر `system|light|dark|clinical|senior|contrast`، و `data-theme`/`data-density`/`data-font-scale` روی `<html>`.

### B4. بارگذاری و خطاهای سطح فرم ضعیفاند
- `Loading` سه خط خاکستری برای تمام صفحات است؛ خطاهای `vital_invalid.issues` در UI نمایش داده نمیشوند؛ تلاش مجدد وجود ندارد.
- **پیشنهاد:** skeleton اختصاصی (کارت پزشک، جدول نوبت، نمودار)، خطای inline فیلدها، دکمهٔ «تلاش مجدد»، optimistic update برای ثبت اندازهگیری.

### B5. نمایش بالینی ناکافی
- پرچمهای vitals فقط متناند؛ بدون نمودار، بازهٔ مرجع، واحد واضح یا زمینهٔ زمانی.
- **پیشنهاد:** Sparkline سبک SVG (بدون وابستگی)، نوار بازهٔ طبیعی، رنگ + متن + آیکون (عدم تکیه صرف بر رنگ)، گروهبندی بر اساس نوع، و هشدار «غیرتشخیصی» قابلکلیک.

### B6. جابهجایی نوبت و Scribe فاقد راهنمای کاملاند
- Reschedule: فقط تاریخ + لیست اسلات؛ پیام خطاهای `slot_taken`/`too_early` ترجمه نمیشود؛ «نزدیکترین وقت آزاد» وجود ندارد.
- Scribe: چکلیست رضایت قبل از شروع نمایش داده نمیشود، مراحل (رضایت→متن→پیشنویس→بازبینی→انتقال) نامشخص است، و هشدار «نامها بهطور خودکار پاک نمیشوند» دیده نمیشود.
- **پیشنهاد:** Stepper ۴ مرحلهای، وضعیت رضایت جداگانه هر طرف، ترجمهٔ خطاها، دکمهٔ «نزدیکترین وقت»، modal تأیید قبل از پاکسازی فوری.

### B7. خطر در صفحه حریم خصوصی
- دکمهٔ «درخواست حذف داده» بدون تأییدیه یا توضیح دورهٔ grace است.
- **پیشنهاد:** Modal با تایپ عبارت تأیید، توضیح ۳۰ روزه، و لغو آسان.

### B8. نمایش راز MFA
- راز TOTP بهصورت متن ساده در DOM نمایش داده میشود.
- **پیشنهاد:** QR (OpenCV-free SVG generator محلی)، دکمهٔ کپی، کدهای پشتیبان قابل دانلود، هشدار «هرگز به اشتراک نگذارید».

### B9. فقدان Storybook/بصری برای کامپوننتهای جدید
- `ScribePanel`، `ReschedulePanel`، `ConsentPanel`، vitals/status/privacy/security هیچ story و baseline بصری ندارند ⇒ guardrails فقط کلاسها را بررسی میکند نه ظاهر.
- **پیشنهاد:** Storybook story برای هر حالت (بارگذاری، خالی، هشدار، خطا، موفق) و commit baselineهای Playwright.

### B10. سایر موارد
- فاقد i18n (فقط fa)؛ فاقد حالت سالمند/font-scale؛ فاقد NPS و مرکز پشتیبانی؛ فاقد داشبورد «امروز پزشک»؛ فاقد اتاق انتظار مجازی و pre-check؛ فاقد تقویم دوطرفه.
- صفحه وضعیت از React Query استفاده نمیکند.
- `themeColor` در viewport ثابت است و با تم light هماهنگ نمیشود.

---

## بخش ج — پیشنهاد کامل تمها و هویت بصری

### ج۱. معماری توکنها
`design/tokens.json` را با یک کلید `themes` به ساختار چندلایه گسترش دهید:

```
themes:
  clinical-light   ← پیشفرض بیمار
  clinical-dark    ← پیشفرض پزشک/شبانه
  high-contrast    ← امنیت/انطباق و WCAG AAA
  senior           ← font-scale 1.25، هدف لمس 48px+
  low-bandwidth    ← بدون gradient/blur، تصاویر فشرده
semantics:
  surface, surface-raised, text, text-muted, primary, primary-soft,
  success, warning, danger, focus-ring, chart-1..5, border, shadow
modifiers:
  density: compact | comfortable
  fontScale: 100 | 125 | 150
  motion: full | reduced
```

تولیدکننده `scripts/build-tokens.mjs` باید `[data-theme="..."]` و `[data-density="..."]` و `[data-font-scale="..."]` را emit کند؛ `tokens:check` در CI تضمین میکندgeneratedها کهنه نشوند.

### ج۲. پالتهای پیشنهادی (جهت، نه نسخه نهایی)

| تم | زمینه | سطح | اصلی | متن | کاربرد |
|---|---|---|---|---|---|
| Clinical Light | `#F5F9FB` | `#FFFFFF` | `#0F766E` / `#1D6FD1` | `#102A43` | پیشفرض بیمار، اعتماد و آرامش |
| Calm Teal | `#F2FAF7` | `#FFFFFF` | `#0E7C66` | `#12332C` | صفحات پروفایل سلامت و RPM |
| Clinical Dark | `#0B1220` | `#111C2B` | `#5EEAD4` | `#E6F1F5` | پنل پزشک، اتاق ویزیت، مانیتورینگ شبکه |
| High Contrast | `#000000` | `#0A0A0A` | `#FFFF00` | `#FFFFFF` | ادمین، انطباق، WCAG AAA |
| Senior | همان Clinical Light | + فونت ۱٫۵x، دکمه ۴۸px+، ناوبری ساده | | | سالمندان |
| Low Bandwidth | تک رنگ، بدون blur | | | | مناطق کمپهنایباند |

> اصل: رنگ فقط «تأکید» است نه تنها حامل معنا؛ هر هشدار همراه متن و آیکون است.

### ج۳. زبان بصری پیشنهادی
- لوگو: علامت صلیب پزشکی ملایم یا موج ECG داخل دایره؛ حذف gradient نئونی سه رنگه از هدر.
- Hero: تصویر انتزاعی خط ECG + کارت نوبت، به جای متن بزرگ تنها؛ CTA واضح «جستجوی پزشک».
- کارتها: سایه ملایم، border باریک، فاصلهگذاری ۸pt، بدون glass زیاد.
- تایپوگرافی: Vazirmatn، مقیاس ۱۲/۱۴/۱۶/۲۰/۲۴/۳۲، line-height ۱٫۶–۱٫۸، حداکثر عرض ۷۲۰px برای متن.
- States: skeleton → content → empty-with-CTA → error-with-retry → success-toast.
- Micro-interaction: Stepper، progress bar، transition ۲۰۰ms، احترام به prefers-reduced-motion.

### ج۴. کامپوننتهای جدید Design System
`Button (primary/secondary/ghost/danger)`, `Alert`, `Badge`, `Stepper`, `StatCard`, `Sparkline`, `Timeline`, `EmptyState`, `FormField (label/help/error)`, `DataTable`, `ConsentCard`, `VitalCard`, `AppointmentJourney`.

### ج۵. صفحات/جریانهای پیشنهادی (تجربه بهتر)
1. **داشبورد «امروز پزشک»**: نوبتها، خلاصه پرونده، هشدار آلرژی، اقدام سریع، reported_no_show.
2. **سفر نوبت بیمار**: جستجو → رزرو → پرداخت → pre-check → اتاق انتظار مجازی → ویزیت → خلاصه → نظرسنجی NPS → پیگیری.
3. **مرکز رضایت**: تمام رضایتنامهها با نسخه، تاریخ، ابطال و توضیح کاربرد (همان ConsentPanel ولی کامل).
4. **RPM**: نمودار روند، بازه مرجع، یادآور دارو، اتصال دستگاه، هشدار قابلتنظیم.
5. **پشتیبانی دروناپ**: تیکت + SLA + چت.
6. **حالت سالمند / Voice-first / کمپهنایباند** بهعنوان modifierهای تم، نه صفحات جداگانه.

---

## بخش د — اولویتبندی تکمیل پروژه

### P0 — قبل از هر چیز ( ایمنی/استقرار )
1. مهاجرتهای Prisma + CI چک ORDER.
2. رفع قفل ادمین MFA و چرخش امن راز.
3. `<main>` تو در تو + هدر موبایل drawer.
4. RLS/API vitals (patientId + محدودیت رابطهٔ درمانی).
5. job پاکسازی Scribe + جلوگیری از overwrite SOAP.
6. تأییدیه حذف داده.
7. تک نسخه OTel.

### P1 — تم و طراحی
8. tokens v2 + ۶ تم + ThemeProvider + font scale/density.
9. Design System کامپوننتها + Storybook و baseline بصری.
10. ترجمه خطاها، skeletonها و Stepper Scribe/Reschedule.

### P2 — تمایز محصول
11. موتور لیست انتظار + امتیاز no-show (با توضیحپذیری و جلوگیری از overbooking).
12. Passkey/WebAuthn، RBAC ریزدانه + Audit Viewer.
13. اجرای job حذف/خروجی + FHIR document data + ETag.
14. کیف پول/بیمه/payout تنها بعد از طراحی ledger و تأیید دو نفره مالی.
15. داشبورد پزشک، اتاق انتظار، pre-check، NPS، پشتیبانی، i18n (fa/en/ar).

### P3 — مقیاس
16. BI/قیف/کوهورت، A/B با feature flag، Multi-tenant، اپ Expo، SBOM/cosign، pentest و بازبینی حقوقی.

---

## بخش ه — نحوه اقدام پیشنهادی
پیشنهاد میشود ابتدا **P0** در یک PR کوچک و قابل تست (همراه Vitest + Playwright + migrate) اجرا شود، سپس **P1** بهعنوان لایهای طراحی جدا از منطق کسبوکار. در صورت تأیید، پیادهسازی هر گروه از موارد فوق بههمراه تست و مستند در فاز ۲۱ قابل انجام است.
