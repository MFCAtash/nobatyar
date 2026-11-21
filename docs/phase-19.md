# فاز ۱۹ — «پایهٔ محکم + تمایز» (پیادهسازی واقعی)

این سند وضعیت **واقعی** کدهای اضافهشده در فاز ۱۹ را ثبت میکند. برخلاف اسناد قبلی، تمام مسیرها، مدلها، تستها و فایلهای پیکربندی اشارهشده در اینجا در مخزن وجود دارند.

---

## ۰) تثبیت baseline (انجام شد)

- وابستگیها با `corepack pnpm install --no-frozen-lockfile` نصب و `pnpm-lock.yaml` ایجاد شد.
- دو خطای **از پیش موجود** در `schema.prisma` (نبود relation مقابل برای `FamilyMember.owner` و `Notification.user`) برطرف شد؛ `prisma generate` اکنون موفق است.
- خطاهای تایپیک از پیش موجود（`compare.controller`، `notification.service`، `sentry.ts`، `tracing-register.ts`）رفع شد؛ `apps/api` و `apps/web` هر دو `typecheck` سبزاند.
- پوشش OpenAPI از **۴۴٪ به ۱۰۰٪** رسید (`120/120`) و `openapi/undocumented.json` خالی شد. هر مسیر جدید حتماً مستند شده است.
- باگ P2: `callbackFor` آدرس نامعتبر را به جای ۵۰۰، با ۴۰۰ رد میکند؛ `parseDotenv` کامنت انتهایی را قبل از نقل قول جدا میکند.

> وابستگیها نصب شدند ولی برخی تستهای **پیشین** (push/refund/tracing) هنوز قرمزاند؛ جزئیات در انتهای همین سند.

---

## ۱) 🔐 MFA/TOTP ادمین (کامل)

| لایه | فایل |
|---|---|
| الگوریتم خالص RFC 6238 | `apps/api/src/auth/totp.ts` + `totp.test.ts` (۸ تست: بردارهای RFC، پنجره ±۱، otpauth، کدهای پشتیبان) |
| سرویس | `apps/api/src/auth/mfa.service.ts` |
| مسیرها | `apps/api/src/auth/mfa.controller.ts` |
| enforcement | `apps/api/src/auth/mfa.guard.ts` (Global Guard سوم بعد از Roles) |
| پیکربندی | `ADMIN_REQUIRE_MFA` در `config/auth.config.ts` (پیشفرض: `true` در production) |
| claim توکن | `mfa?: boolean` در `token.service.ts` / `AuthUser` |
| UI | `apps/web/src/app/admin/security/page.tsx` |

**گاردریلها:**
- راز TOTP با `FieldCrypto` (AES-256-GCM + AAD) در `users.mfa_secret_enc` ذخیره؛ فقط در لحظه `enroll` یکبار به کلاینت داده میشود.
- کدهای پشتیبان فقط به صورت **hash** ذخیره و تکبارمصرفاند.
- قفل ۱۵ دقیقهای بعد از ۵ تلاش ناموفق.
- با `ADMIN_REQUIRE_MFA=true` هر درخواست ادمین بدون claim ی `mfa` با `403 {error:"mfa_required"}` رد میشود؛ مسیرهای مجاز فقط ثبت/تأیید MFA، step-up و خروجاند.
- خروجی «هرگز» به عنوان جایگزین رمز عبور نیست؛ MFA **دومین عامل** است و OTP همچنان وجود دارد.

**مسیرها:** `GET /me/mfa`، `POST /me/mfa/enroll`، `POST /me/mfa/enable`، `POST /auth/mfa/verify`، `POST /me/mfa/disable`.

---

## ۲) 📅 جابهجایی اتمی نوبت (کامل — رفع نقص فاز ۳)

| لایه | فایل |
|---|---|
| سیاست خالص | `apps/api/src/appointments/reschedule-policy.ts` + `.test.ts` |
| سرویس | `apps/api/src/appointments/reschedule.service.ts` |
| مسیر | `apps/api/src/appointments/reschedule.controller.ts` (`POST /appointments/:id/reschedule`) |
| رویداد | `appointment.rescheduled` در outbox + handler اعلان دوطرفه |
| UI | `apps/web/src/components/ReschedulePanel.tsx` در صفحه جزئیات نوبت |

**تضمینها:**
- بدون لغو، بدون بازپرداخت، **بدون پرداخت مجدد**؛ `priceRial` و وضعیت پرداخت دستنخوردهاند.
- اعتبارسنجی اسلات دقیقاً همان قواعد رزرو است، منهای ردیف busy ی «خود نوبت».
- `UPDATE` شرطی روی `(id, startsAt, status)` ⇒ از درخواستهای همزمان تنها یک درخواست برنده میشود.
- تریگر `appointments_busy_sync` نمای busy را در همان تراکنش بهروز میکند؛ یادآوریهای ۲۴/۱ ساعته ریست میشوند.
- فقط نوبتهای `CONFIRMED` / `PENDING_CONFIRMATION` و حداقل `MIN_LEAD_MINUTES` قبل از شروع قابل جابهجاییاند.

### لیست انتظار و ریسک no-show (پایهٔ داده)
مدلهای `AppointmentWaitlist` و فیلدهای `noShowRisk` / `riskScoredAt` در `Appointment` اضافه شدند و RLS آنها در `phase19-backend.sql` تعریف شده است. **منطق پر کردن خودکار و مدل امتیازدهی no-show هنوز پیاده نشده** (بخش «باقیمانده» را ببینید).

---

## ۳) 🧬 FHIR/ IPS + رضایت پویا + حق حذف/خروجی (کامل در سطح MVP)

| لایه | فایل |
|---|---|
| سازنده Bundle خالص | `apps/api/src/records/fhir-export.ts` + `fhir-export.test.ts` (۵ تست: Bundle، LOINC BP، Condition/Medication/Allergy/DocumentReference، ارجاع Patient، JSON تمیز) |
| سرویس | `apps/api/src/records/fhir.service.ts` |
| مسیرها | `apps/api/src/records/fhir.controller.ts` |
| UI | `apps/web/src/app/privacy/page.tsx` |

- `GET /me/health-record/fhir` ⇒ **FHIR R4 Bundle** شامل Patient، Observation (با کدهای LOINC)، Condition (تشخیصهای SOAP امضاشده)، MedicationStatement، AllergyIntolerance، DocumentReference (فقط عنوان/نوع مدرک) و Composition.
- تمام رمزگشاییها در سرویس و تحت RLS کاربر جاری است؛ خروجی `no-store` است.
- `POST /me/data-requests` با نوع `EXPORT` یا `DELETE`، فهرست و لغو درخواست. اجرای نهایی حذف توسط job انطباق **باقی است** (مدل `DataRequest` + Audit + RLS آمادهاند).

---

## ۴) 💳 کیف پول / بیمه / تسویه (وضعیت: طراحی نشده در این فاز)

این بخش «L / مالی-مقرراتی» است و اجرای ناقص آن خطر مالی جدی دارد. در فاز ۱۹ **هیچ کد مالی ناقصی اضافه نشد**؛ جریان پرداخت/استرداد موجود (فاز ۱۷) دستنخورده باقی ماند. فهرست کارهای لازم در انتهای سند آمده است.

---

## ۵) ⌚ پایش از راه دور RPM (کامل — MVP)

| لایه | فایل |
|---|---|
| سیاست و آستانهها | `apps/api/src/vitals/vitals-policy.ts` + `.test.ts` (۵ تست) |
| سرویس / مسیر / ماژول | `apps/api/src/vitals/vitals.{service,controller,module}.ts` |
| مدل | `VitalReading` + enum `VitalType` / `VitalSource` |
| RLS | `phase19-backend.sql` — بیمار مالک، پزشک دارای نوبت فقط خواندن |
| UI | `apps/web/src/app/vitals/page.tsx` |

- انواع: فشار خون، قند، وزن، ضربان، دما، اکسیژن؛ اعتبارسنجی دامنه فیزیولوژیک و آستانه `normal/watch/alert`.
- یادداشت با `FieldCrypto` رمزنگاری میشود؛ مقادیر عددی در Audit نمیروند (فقط نوع و flag).
- هشدار ⇒ اعلان به بیمار و پزشک(ان) قبلی؛ روند ساده بر مبنای میانگین اختلافها.
- مسیرها: `POST /vitals`، `GET /vitals`، `DELETE /vitals/:id`.

> هشدارها «توصیه پزشکی» نیستند و جایگزین قضاوت پزشک نمیشوند (در UI هم تصریح شده).

---

## ۶) 🛰️ مرکز فرمان SRE (کامل — پیکربندی)

| فایل | محتوا |
|---|---|
| `infra/monitoring/slo-burn-rate.yml` | هشدار burn-rate چندپنجرهای (۱۴٫۴× / ۶× / ۱×) + افت قیف رزرو |
| `infra/monitoring/prometheus.yml` | rule_file جدید |
| `infra/monitoring/loki.yml`, `promtail.yml`, `tempo.yml` | جمعآوری لاگ و trace |
| `infra/monitoring/grafana-datasources.yml`, `grafana-dashboards.yml` | provisioning خودکار Grafana |
| `infra/monitoring/grafana/dashboards/nobatyar-slo.json` | داشبورد SLO، error budget، p95، قیف، Outbox، لاگ و trace |
| `docker-compose.observability.yml` | اجرای Grafana/Loki/Tempo/Promtail (پورتها localhost) |
| `scripts/synthetic-probe.mjs` | probe مصنوعی مسیر health→status→specialties→doctors (فقط خواندنی، بدون داده بیمار) |
| `apps/web/src/app/status/page.tsx` | صفحه عمومی `/status` با تازهسازی ۳۰ ثانیهیی |

---

## ۷) 🎙️ دستیار بالینی Ambient / AI Scribe (کامل — MVP محلی و ایمن)

| لایه | فایل |
|---|---|
| سیاست خالص | `apps/api/src/scribe/scribe-policy.ts` + `.test.ts` (۵ تست) |
| سرویس | `apps/api/src/scribe/scribe.service.ts` |
| مسیرها | `apps/api/src/scribe/scribe.controller.ts` |
| ماژول | `apps/api/src/scribe/scribe.module.ts` |
| مدل | `ScribeSession` + `ConsentType.AMBIENT_SCRIBE` |
| UI | `apps/web/src/components/ScribePanel.tsx` در صفحه SOAP |

**گاردریلهای سخت:**
1. **بدون رضایت صریح و فعال هر دو طرف (پزشک + بیمار) جلسه اصلاً ساخته نمیشود.**
2. متن گفتار بلافاصله با `scrubString` پاکسازی و سپس با `FieldCrypto` رمزنگاری میشود؛ فایل صوتی ذخیره نمیشود.
3. موتور پیشنویس **کاملاً محلی و قابل ممیزی** است (`local-rules-1`)؛ هیچ تماس خارجی/هیچ مدل دیگری فرستاده نمیشود.
4. خروجی همیشه همراه با بنر «پیشنویس خودکار — بازبینی پزشک الزامی» است.
5. `applyToSoap` فقط `SoapService.saveDraft` را صدا میزند ⇒ وضعیت `DRAFT`؛ **امضا جداگانه و فقط توسط پزشک** (`POST /appointments/:id/soap/sign`) ممکن است.
6. TTL (پیشفرض ۱۵ دقیقه) + `purgeExpired()` متن خام را فیزیکی پاک میکند؛ پاکسازی فوری توسط پزشک هم موجود است.
7. Outbox فقط شناسهها را می گیرد؛ متن گفتار/پیشنویس هرگز وارد Outbox/Audit/Sentry نمیشود.

> محدودیت صریح: الگوهای PII نام افراد را تشخیص نمیدهند؛ بازبینی پزشک الزامی است و در UI تصریح شده.

---

## ۸) 🏥 مکان نوبت حضوری (کامل)

- فیلدهای `clinicName/clinicAddress/clinicPhone` به `DoctorProfile` اضافه شد.
- تنظیمات از طریق `PATCH /doctors/me/settings` (با Zod) و UI در `apps/web/src/app/doctor/schedule/page.tsx`.
- نمایش در دایرکتوری پزشکان (`clinic`) و در صفحه جزئیات نوبت فقط برای `IN_PERSON`.

---

## ۹) Quick Wins و رفع باگها

| مورد | وضعیت |
|---|---|
| جابهجایی نوبت | ✅ کامل |
| صفحه `/status` | ✅ کامل |
| MFA ادمین | ✅ کامل |
| OpenAPI ۱۰۰٪ | ✅ کامل (۱۲۰/۱۲۰) |
| مکان نوبت حضوری | ✅ کامل |
| رفع `callbackFor` / `parseDotenv` | ✅ کامل |
| نزدیکترین وقت آزاد | ❌ باقی است |
| اتصال no-show به video_events | ❌ باقی است |
| بازبینی داروساز آلرژی | ❌ باقی است |
| ClamAV/quarantine، PITR، CAPTCHA، پیام سیستمی چت، baseline بصری | ❌ باقی است |

---

## ۱۰) چگونه اجرا و مهاجرت کنید

```bash
corepack pnpm install --no-frozen-lockfile
cd apps/api && corepack pnpm exec prisma generate
corepack pnpm run db:phase19     # نیاز به Postgres محلی/Docker
cd ../.. && corepack pnpm -r typecheck && corepack pnpm -r test
docker compose -f docker-compose.prod.yml -f docker-compose.monitoring.yml -f docker-compose.observability.yml up -d
BASE_URL=https://your-domain node scripts/synthetic-probe.mjs
```

متغیرهای جدید:
- `ADMIN_REQUIRE_MFA` (پیشفرض `true` در production)
- `SCRIBE_TTL_MINUTES` (۵–۱۲۰، پیشفرض ۱۵)
- `GRAFANA_ADMIN_PASSWORD` (برای compose observability)
- `OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318` (اختیاری، برای traceها)

ترتیب SQLها: `prisma/sql/ORDER` اکنون شامل `phase19-backend` است.

---

## ۱۱) وضعیت صادقانه تستها

- ✅ `typecheck` API و Web: سبز.
- ✅ تستهای **جدید** فاز ۱۹ (TOTP، policy جابهجایی، vitals policy، scribe policy، FHIR builder، openapi): سبز.
- ✅ تستهای **پیشین** قرمز نیز برطرف شدند: `refund`/`push` کد خطا را در کنار `error` در پیام HttpException میگنجانند و `tracing.test.ts` اکنون از tracer داخلی مستقل از SDK استفاده میکند.
- ✅ `corepack pnpm -r test` سبز: **API ۵۲۰/۵۲۰، Web ۱۶۸/۱۶۸، shared ۱۴/۱۴**.
- ✅ `corepack pnpm -r build` برای API سبز؛ وب با `NEXT_STANDALONE=false corepack pnpm --filter @nobatyar/web build` سبز (کپی standalone در ویندوز با symlink EPERM میدهد؛ پیشفرض Docker/production بدون تغییر standalone است).
- ⚠️ تستهای integration (Postgres/Redis)، Playwright/بصری، k6 و CI واقعی هنوز اجرا نشدهاند.

---

## ۱۲) باقیماندهٔ نقشهٔ راه (انجام نشده —ネップ تعهد کد نشده)

مواردی که در فاز ۱۹ فقط **پایهٔ داده/RLS** آنها فراهم شد و نیاز به فاز بعدی دارند:
- موتور پر کردن خودکار لیست انتظار + امتیاز no-show و overbooking کنترلشده.
- Passkey/WebAuthn (فقط TOTP ادمین تمام شد).
- کیف پول، پرداخت ترکیبی، بیمه/e-claim، payout پزشکان و ledger مالی.
- اجرای job حذف/خروجی کامل داده (درخواستها ثبت میشوند، اجرا دستی/JOB باقی است).
- Scaffold باقیمانده Quick Wins (ClamAV، CAPTCHA، PITR drill، video_events→no-show، بازبینی داروساز، baseline بصری).
- تجربه بیمار/پزشک، BI، اپ نیتیو، i18n، E2EE چت، SBOM/cosign و pentest.
