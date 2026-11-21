# تحلیل جامع نقشهٔ راه نوبت‌یار — بستهٔ ۲۸ اکتبر ۲۰۲۶

> منبع: `NobatYar_Roadmap_Zero_to_Release_2026-10-28.zip`
> تاریخ تحلیل: ۲۱ آذر ۱۴۰۵
> این سند دو کار میکند: (۱) استخراج کامل و دقیقِ تمام ایدهها و قابلیتهای ذکرشده در بسته، (۲) توسعه و ارتقای خلاقانهٔ هر کدام به گزینههای قابلانتخاب برای پروژه.

---

## ۰. بازبینی مرجع و هشدارهای مهم

بستهٔ دریافتی شامل ۹ سند فارسی + خلاصهٔ اجرایی + MANIFEST + یک آرشیو مرجع است:

| فایل | نقش |
| --- | --- |
| `README_FA.md` | نمای کلی، وضعیت مبنا، ترتیب شروع |
| `docs/01_MASTER_ROADMAP_FA.md` | نقشهٔ مادر، فاز ۰ تا ۱۰، فاز ۵.۵، DoD |
| `docs/02_ARCHITECTURE_AND_DATA_FLOW_FA.md` | معماری کلان، ۸ اصل، ۱۲ مرز ماژول، ۴ گردش داده |
| `docs/03_BACKLOG_AND_SPRINTS_FA.md` | ۱۲ اسپرینت، بکلاگ P0–P3 |
| `docs/04_SECURITY_PRIVACY_CHECKLIST_FA.md` | ۵ گروه چکلیست امنیت + ریسکهای مبنا |
| `docs/05_TESTING_RELEASE_GATES_FA.md` | هرم تست، Gate A–E، ثبت نتایج |
| `docs/06_DECISIONS_AND_OPEN_QUESTIONS_FA.md` | ۹ ADR + ۱۰ پرسش باز |
| `docs/07_OPERATIONS_RUNBOOK_FA.md` | محیطها، استقرار، worker، backup، لاگ، حادثه |
| `docs/08_RISKS_AND_METRICS_FA.md` | ۱۱ ریسک، ۸ شاخص، Go/No-go |
| `docs/09_DEVELOPER_HANDOFF_TEMPLATE_FA.md` | قالب تحویل، چکلیست PR، قالب باگ |
| `reference/nobatyar-phase8-fixed.zip` | کپی تغییرنیافته آرشیو مبنا (ادعای build/test موفق ندارد) |

**هشدارها:**

1. بسته در تاریخ ۲۸ اکتبر ۲۰۲۶ بر اساس «تحلیل مبنا» نوشته شده است؛ نویسندهٔ آن build/test/staging را اجرا نکرده است. بنابراین جملاتی مانند «Noop notifier»، «UI MFA موجود نبوده»، «schema ناسازگار است» **ادعاهای مبنا**اند، نه حقایق قطعیِ امروز پروژه.
2. آرشیو مرجع نامش `phase8` است ولی پوشهٔ ریش داخل آن `nobatyar-phase7-build` است — نفسه بسته هشدار میدهد که فازها را عملیاتی فرض نکنید.
3. بنابراین هر «قابلیت موجود» در رودمپ را باید با کد واقعی پروژه راستیآزمایی کرد (بخش ۳ همین سند).
4. رودمپ **برنامهٔ رسیدن به بتا** است، نه فهرست ایدههای محصول. ولی در دل خود حداقل ۵۰ ایده/قابلیت صریح و دهها مورد ضمنی دارد؛ تمام آنها در بخش ۱ استخراج شدهاند.

---

## ۱. استخراج کامل: تمام ایدهها، پیشنهادها و قابلیتهای ذکرشده

### ۱.۱ هدف محصول و نقشها

**هدف:** پلتفرم فارسی و RTL برای اتصال بیمار، پزشک و تیم مدیریت. هسته: مشاهدهٔ پزشک ← رزرو ← پرداخت ← پیگیری ← ارتباط بیمار/پزشک. اولویتها: صحت رزرو/پرداخت، امنیت، حریم خصوصی، ممیزی — بر رشد سریع امکانات.

| نقش | قابلیتهای ذکرشده |
| --- | --- |
| بیمار | ورود، جستوجوی پزشک، انتخاب زمان، رزرو، پرداخت، پیگیری، لغو، (مراحل بعد) چت/ویدئو/پرونده سلامت |
| پزشک | پروفایل، برنامه زمانی، نوبتها، مدارک، ارائهٔ خدمت |
| ادمین | بررسی پزشک، مدیریت کاربران، پرداخت/بازپرداخت با دسترسی محدود و قابل ممیزی |

### ۱.۲ فازها (تمام آیتمها، بدون حذف)

**فاز ۰ — Baseline و زیرساخت (۱۰ آیتم):** ثبت commit/tag و branch کاری؛ بررسی مخزن برای `pnpm-lock.yaml`، `prisma/migrations`، scripts، CI و env؛ تفکیک local/test/staging/production و secrets؛ تعریف نقشها، مسیرهای کاربر، ماشین وضعیت نوبت و قرارداد API؛ اجرای clean install، migration، lint، typecheck، unit، integration و build. خروجی: baseline report قابل بازتولید + CI اولیهٔ سبز.

**فاز ۱ — پایگاه داده و امنیت (۵ آیتم):** همسانسازی Prisma schema، migrations و مدلهای TS؛ بررسی تراکنشها و قید ضد رزرو دوبل؛ تست RLS و دسترسی مبتنی بر مالکیت؛ مستندسازی طبقهبندی داده و retention؛ بازبینی AES-256-GCM/AAD/چرخش کلید و زنجیرهٔ audit. خروجی: migration موفق از DB خالی و ارتقایافته + تستهای منفی دسترسی سبز.

**فاز ۲ — احراز هویت (۶ آیتم):** تصمیم قطعی OTP-only یا OTP+password؛ افزودن فیلدهای auth به Prisma + migration؛ یکسانسازی claims توکن (`ver`، `sid`، `mfa`) با کد و تست؛ تکمیل MFA ادمین (enroll، QR/otpauth، verify، recovery codes، revoke)؛ مدیریت `mfa_required` در API client و UI؛ rate limit، جلوگیری از user enumeration، reset/recovery، ابطال session. خروجی: backend/frontend/docs همقرارداد + تست auth سبز.

**فاز ۳ — چرخهٔ نوبت (۵ آیتم):** ماشین وضعیت واحد در backend و `packages/shared`؛ نقش مجاز هر انتقال؛ رزرو idempotent، انقضای رزرو موقت، رفتار پرداخت دیررس؛ سیاست لغو/no-show/تغییر زمان/refund؛ تست رقابت همزمان روی یک slot. خروجی: بدون رزرو دوبل یا وضعیت مالی مبهم.

**فاز ۴ — تجربهٔ کاربری (۴ آیتم):** تکمیل UI مطابق پروتوتایپ؛ RTL، تاریخ/ساعت، متن دوجهته، responsive موبایل؛ حالتهای loading/empty/error/offline/retry؛ دسترسپذیری صفحهکلید، focus، label، کنتراست. خروجی: تست مسیر اصلی موبایل/دسکتاپ.

**فاز ۵ — پرداخت (۵ آیتم):** تأیید قرارداد درگاه و sandbox؛ اعتبارسنجی callback در سمت سرور (عدم اعتماد به redirect مرورگر)؛ idempotency، ثبت reference، reconciliation؛ worker بازپرداخت و پایش صف؛ تست callback جعلی/تکراری، مبلغ نادرست، timeout و refund. خروجی: تست sandbox مستند + مسیر مالی قابل ممیزی.

**فاز ۵.۵ — تثبیت احراز هویت (اولویت فوری، ۴–۶ روز):**
- Schema: `User.passwordHash`, `passwordUpdatedAt`, `tokenVersion`, `mfaSecretEnc`, `mfaEnabledAt`, `mfaRecoveryHashes` و `Session.mfaAt` — با tipos/nullable/default/index و RLS/data classification.
- تست: اصلاح `token.service.test.ts`؛ تست password، TOTP با بردار RFC 6238، replay protection، recovery code یکبارمصرف، tokenVersion و تعلیق کاربر.
- فرانت: صفحهٔ MFA با enroll/verify، نمایش یکبارهٔ کدهای بازیابی، مدیریت `mfa_required`، هدایت ادمین.
- تصمیم محصول: یا UI کامل password/reset/change یا حذف مسیرهای password — حالت نیمهکاره ممنوع.
- مستندات/Gate: `.env.example`، README، `phase-5b.md`، threat model (T2/T12/T17)، ADR؛ همهٔ lint/typecheck/unit/integration/build سبز، migrations/lockfile در Git، تست sandbox درگاه، review نفر دوم.
- **قانون:** قبل از Gate، فاز ۶ وارد main نشود.

**فاز ۶ — اعلان، فایل، چت (۳–۴ هفته، ۶.sub آیتم):**
- ۶.۱ اعلان: جایگزینی `AppointmentNotifier` Noop با Outbox + worker + retry/backoff + dead-letter/alert؛ پیامک رزرو، یادآوری، پرداخت، لغو، refund؛ تست Kavenegar کنترلشده.
- ۶.۲ فایل: upload URL امضاشده، سقف حجم، allowlist، بررسی magic bytes، quarantine، malware scan، storage خصوصی، URL دریافت کوتاهعمر؛ تکمیل آپلود مدارک پزشک.
- ۶.۳ چت: Conversation متصل به appointment، بررسی عضویت/مالکیت/consent `HEALTH_DATA_PROCESSING`، رمزنگاری، RLS، Audit، rate limit، بازهٔ زمانی مشخص.
- ۶.۴ پیوست: فقط از pipeline امن فایل.
- ۶.۵ UI: مرکز اعلان، صفحهٔ چت، وضعیت ارسال و خطا.
- ۶.۶ تست: IDOR، دسترسی بعد از بازه، replay، spam، MIME spoofing، URL منقضی.
- خروجی: ارسال واقعی قابل رصد، فایل خصوصی، چت با تست منفی دسترسی سبز.

**فاز ۷ — ویدئو با LiveKit (۴ آیتم):** توکن کوتاهعمر محدود به room/role/appointment؛ precheck دوربین/میکروفون؛ reconnect؛ پایان جلسه؛ consent/retention برای ضبط (پیشفرض خاموش). خروجی: فقط اتاق مجاز، بدون توکن بلندعمر/reusable.

**فاز ۸ — پرونده سلامت، triage، نظر دوم (۴ آیتم):** RecordShare با scope/expiry/revoke، audit، consent، export/delete؛ triage غیرتشخیصی و red-flag escalation؛ بازبینی حقوقی و بالینی پیش از عرضه. خروجی: تست حریم خصوصی + تأیید متخصص؛ triage جایگزین پزشک نمیشود.

**فاز ۹ — سختسازی (۷ آیتم):** KMS/Vault؛ backup رمزنگاریشده و تمرین restore؛ پایش API/DB/Redis/storage/worker/provider؛ اجرای زمانبندیشدهٔ `verify_audit_chain`؛ dependency/container scanning؛ incident response؛ redaction لاگ و حذف داده سلامت از telemetry. خروجی: restore واقعی، هشدارهای آزمایششده، playbook حادثه.

**فاز ۱۰ — بتای بسته و انتشار تدریجی (۷ آیتم):** تیم داخلی ← cohort محدود ← بتای بسته ← اصلاح ← گسترش کنترلشده؛ پشتیبانی، consent/privacy، مانیتورینگ، backup/restore، rollback. خروجی: مسیر اصلی پایدار، بدون باگ بحرانی باز، شاخصها/بازخورد قابل سنجش.

**زمانبندی راهنما:** ۵.۵: ۴–۶ روز؛ ۶: ۳–۴ هفته؛ ۷: ۲–۴ هفته؛ ۸: ۳–۶ هفته + بازبینی بالینی/حقوقی؛ ۹: ۲–۴ هفته؛ ۱۰: ۲–۴ هفته.

**Definition of Done (۹ الزام):** migration/schema، قرارداد API، کنترل مجوز/consent، UI و حالت خطا، تست، logging امن، env/docs، review دوم، rollback/feature flag. «ویژگی backend-only بدون این موارد Done نیست.»

### ۱.۳ اصول معماری (۸ اصل صریح)

1. NestJS تنها مالک نوشتن DB است.
2. تا اثبات نیاز، Modular Monolith حفظ شود.
3. قرارداد API و خطاها مشترک و versioned باشد.
4. ماشین وضعیت appointment/payment تعریف واحد داشته باشد.
5. side effectها با Outbox/worker و retry محدود.
6. رزرو، callback و refund idempotent.
7. دسترسی = role + مالکیت resource + consent + زمان اعتبار.
8. داده سلامت در logs، analytics، traces و crash reports ثبت نشود.

### ۱.۴ مرزبندی ماژولها (۱۲ ماژول)

Identity & Access · Doctor Verification · Availability · Appointment · Payment & Refund · Notification · File Service · Conversation · Video · Health Record · Triage/Second Opinion · Admin/Audit.

### ۱.۵ گردشهای داده (۴ گردش، ۲۴ گام)

**رزرو/پرداخت (۹ گام):** انتخاب پزشک/زمان ← بررسی هویت، وضعیت پزشک، slot و قوانین ← transaction + constraint ضد دوبل ← payment intent pending ← هدایت به درگاه ← callback با اعتبارسنجی مرجع/مبلغ/وضعیت ← callback تکراری بدون اثر ← رویداد outbox برای اعلان ← فرانت وضعیت را از API میخواند (query string منبع حقیقت مالی نیست).

**فایل/چت (۷ گام):** بررسی عضویت، مالکیت، consent و بازه ← ذخیرهٔ پیام با سقف و rate limit ← upload intent + signed PUT کوتاهعمر ← storage خصوصی + quarantine ← magic bytes + malware scan ← فقط فایل approved قابل دریافت ← download مجدداً authorize + URL کوتاهعمر.

**ویدئو (۳ گام):** بررسی appointment ← توکن کوتاهعمر محدود به room/role ← توکن در log ذخیره نشود، ضبط پیشفرض خاموش.

**پرونده/triage (۲ گام):** خواندن/نوشتن بر اساس role، مالکیت، رابطهٔ درمانی و consent ← RecordShare با scope/expiry/revoke؛ triage غیرتشخیصی، red flags به ارجاع مناسب.

### ۱.۶ قواعد DB و API (۴ قانون)

migrations نسخهدار در Git و بدون تغییر دستی DB؛ قید دیتابیس برای ضد دوبل (application check کافی نیست)؛ خطاهای استاندارد ۴۰۰/۴۰۱/۴۰۳/۴۰۹/۴۲۹/۵xx همراه correlation ID؛ عدم قرارگیری stack trace، secret، token یا داده سلامت در پاسخ/log.

### ۱.۷ چکلیست امنیت و حریم خصوصی (همهٔ آیتمها)

**هویت و نشست (۷):** سیاست ورود یکسان در UI/API/docs؛ OTP با TTL/rate limit/محدودیت تلاش/جلوگیری از reuse؛ MFA ادمین اجباری + recovery hashشده و یکبارمصرف؛ tokenVersion/session revocation در مسیرهای حساس؛ refresh token reuse detection + session expiry؛ جلوگیری از user enumeration در login/reset؛ اثر فوری تعلیق کاربر.

**مجوز و مالکیت (۵):** RBAC + ownership/relationship؛ بیمار A نمی‌تواند نوبت/چت B را بخواند؛ دسترسی ادمین محدود و auditشده؛ break-glass با دلیل اجباری و بازبینی؛ RLS با integration test.

**داده سلامت (۷):** طبقهبندی PHI و مستندسازی مسیر؛ consent نسخهدار و قابل اثبات؛ عدم حضور داده سلامت در log/analytics/traces/crash report؛ retention/حذف/ناشناسسازی/export؛ storage خصوصی؛ AES-256-GCM با nonce یکتا، AAD صحیح، key rotation؛ backup رمزنگاریشده با دسترسی محدود.

**API و فایل (۷):** validation سرور، CSRF/XSS/CORS/security headers؛ rate limit روی auth/booking/payment/chat/upload؛ signed URL کوتاهعمر و scope محدود؛ magic bytes و اندازه واقعی؛ quarantine + malware scan؛ filename کاربر مسیر storage را تعیین نکند؛ download مجدداً authorize.

**پرداخت و عملیات (۶):** callback با مبلغ/مرجع/وضعیت validate؛ callback تکراری idempotent؛ secret و داده کارت ذخیره نشود؛ reconciliation و refund queue پایش؛ audit chain دورهای verify؛ backup restore تمرینشده؛ dependency/container scan + incident playbook؛ review دوم auth/payments/hardening SQL.

**ریسکهای مبنا (۸ ادعا):** ناسازگاری schema/auth؛ تست قدیمی token و پوشش ناکافی MFA/password/tokenVersion؛ نبود UI MFA ادمین؛ سیاست ورود متناقض؛ Noop notifier؛ آپلود ناامن/ناقص مدارک پزشک؛ Zarinpal/Kavenegar تأییدنشده؛ وجود migrations/lockfile تأییدنشده.

### ۱.۸هرم تست و Gateها

**Unit (۷ دسته):** ماشین وضعیت نوبت، لغو/refund، claims توکن، password/TOTP، policy دسترسی، validation، error mapping.
**Integration (۶):** PostgreSQL، migrations، RLS، رزرو دوبل، payment callback، outbox worker، storage authorization، session revocation.
**E2E (۲):** ورود ← پزشک ← رزرو ← پرداخت sandbox ← callback ← تأیید ← لغو/refund؛ MFA ادمین.
**Security/abuse (۸):** IDOR، replay، brute force، OTP reuse، TOTP replay، callback forgery، duplicate callback، MIME spoofing، oversized upload، expired URL، log leakage.
**Operations (۸):** backup/restore، restart worker، provider timeout، DB/Redis outage، queue backlog، key rotation، rollback.

**تستهای فوری ۵.۵ (۷):** claims فعلی token؛ ادمین بدون MFA → 403 `mfa_required`؛ MFA موفق → مجاز؛ recovery بار دوم رد؛ TOTP replay رد؛ tokenVersion بعد تعلیق بیاعتبار؛ migration از خالی و ارتقایافته.

**رزرو/پرداخت (۵):** ۱۰۰ درخواست همزمان روی یک slot ≤ ۱ رزرو موفق؛ callback تکراری بدون اثر مالی/اعلانی؛ مبلغ/مرجع نادرست رد و audit؛ timeout به وضعیت قابل reconciliation؛ قطع redirect مانع بازیابی وضعیت سرور نشود.

**Gate A–E:** A Build (clean install، migrations، lint/typecheck/unit/integration/build، lockfile+migrations، نسخه Node/pnpm)؛ B Security (تستهای منفی، MFA کامل، بدون secret/PHI در log، threat model، review دوم)؛ C Core (E2E مسیر اصلی، callback idempotent، refund عملیاتی، UI pending/error)؛ D Phase 6 (SMS واقعی، فایل private/scanشده، چت فقط اعضا در بازه، IDOR سبز)؛ E Beta (restore تمرینشده، alert آزمایششده، پشتیبانی/incident، privacy/consent، بدون Critical/High باز).

**ثبت نتیجهٔ تست (۷ فELD):** commit SHA، تاریخ/محیط، نسخه ابزارها، فرمان دقیق، pass/fail، log/artifact، مالک رفع + نتیجهٔ اجرای مجدد.

### ۱.۹ ADRها و پرسشهای باز

**ADR-001** روش ورود (OTP-only در مقابل OTP+password) · **ADR-002** MFA اجباری ادمین و recovery امن · **ADR-003** میزبانی، data residency، KMS/Vault، مسئول چرخش/بازیابی کلید · **ADR-004** درگاه نهایی، merchant، sandbox، callback، settlement، refund · **ADR-005** درصد/مبلغ لغو، پنجره زمانی، لغو پزشک، no-show، SLA (بدون magic number) · **ADR-006** رمزنگاری چت (server-side field vs E2EE) · **ADR-007** بازهٔ مجاز چت，تمدید، اختیار بستن · **ADR-008** ویدئو: ضبط پیشفرض خاموش، consent/retention/metadata · **ADR-009** triage: بازبینی بالینی، عدم جایگزینی پزشک/اورژانس.

هر ADR باید: شناسه، تاریخ، وضعیت، زمینه، گزینهها، تصمیم، پیامدها، مالک، PR مرتبط داشته باشد.

**پرسشهای باز (۱۰):** migrations/lockfile در مخزن؟ نسخه Node/pnpm و فرمان CI؟ staging کجا و مالک کیست؟ کلیدها کجا؟ retention پیام/فایل/پرونده/audit؟ حذف حساب با داده قانونی/مالی؟ refund SLA و مالک؟ provider پیامک و sender ID؟ چه داده‌ای مجاز به analytics/error tracking است؟ (و موارد مشابه).

### ۱.۱۰ عملیات (Runbook)

**محیطها (۴):** Local (داده ساختگی) · CI (DB تست ایزوله) · Staging (شبیه production با داده بی هویت + sandbox) · Production (secret جدا، least privilege، backup، alert، rollback).

**شروع کار (۶):** استخراج نسخه از package.json/CI (حدس نزن)؛ `pnpm install --frozen-lockfile`؛ env از `.env.example` بدون commit secret؛ Docker Compose + DB تست؛ migration/lint/typecheck/unit/integration/build + ثبت؛ هر تغییر schema با migration/تست/rollback.

**استقرار:** artifact از commit مشخص → migration کنترلشده → staging → smoke test → rollout با feature flag → پایش error rate/latency/queue/provider → rollback در نقض آستانه.

**Worker/queue:** مستقل و قابل پایش؛ retry محدود exponential backoff + jitter؛ خطای دائمی → dead-letter + alert؛ پایش oldest job age؛ jobها idempotent.

**Backup/restore:**backup رمزنگاریشده DB + object storage؛ کلیدها جدا؛ restore دورهای در محیط ایزوله؛ RPO/RTO با مالک محصول؛ ثبت نتیجه و زمان بازیابی.

**Logs/monitoring:** لاگ ساختاریافته با correlation ID + redaction؛ ممنوعیت متن چت/PHI/token/OTP/secret/signed URL/داده کارت؛ metricها: API errors/latency، payment failures، queue age، SMS delivery، scan failures، video join failures.

**Incident response (۷):** تشخیص شدت → محدودسازی/feature flag → حفظ شواهد حداقلی → تعیین دامنه → لغو session/چرخش کلید → اطلاع امنیت/حقوقی → بازیابی/مانیتور → postmortem و اقدام اصلاحی.

### ۱.۱۱ ریسکها و شاخصها

**ریسکها (۱۱):** ناسازگاری schema/auth (بحرانی)؛ تست قدیمی token (بالا)؛ نبود UI MFA (بالا)؛ سیاست ورود متناقض (بالا)؛ callback/refund نامطمئن (بحرانی)؛ Noop notifier (بالا)؛ فایل پزشک ناامن (بحرانی)؛ چت/IDOR (بحرانی)؛ backup/key recovery ناقص (بحرانی)؛ triage گمراهکننده (بحرانی)؛ scope بیش از حد (بالا).

**شاخصها (۸ گروه):** نرخ تکمیل رزرو؛ نرخ خطای پرداخت؛ زمان نتیجه پرداخت؛ درصد callback تکراری idempotent؛ تحویل پیامک و سن قدیمیترین job؛ زمان اسکن فایل و نرخ شکست؛ نرخ ورود به ویدئو؛ خطاهای دسترسی غیرمجاز؛ رضایت بیمار/پزشک، زمان پاسخ پشتیبانی، باگ Critical/High باز. شاخصها تجمیعی و فاقد محتوای سلامت.

**Go/No-go:** No-go = build/test قرمز، migration غیرقابل تکرار، MFA/access tests ناقص، پرداخت/refund مبهم، restore تمریننشده، PHI در log، باگ امنیتی بحرانی، نبود consent/privacy/support. Go مشروط = Gateها سبز، باگ متوسط با مالک/موعد، cohort محدود، rollback آماده، تصمیم ادامه/توقف زمانبندیشده.

### ۱.۱۲ قالب تحویل و کیفیت

**Handoff (۱۲ فیلد):** مرحله/اسپرینت، وضعیت، Commit/PR، فایلها، Schema/migration، ADR، فرمانها و نتیجه، Unit/Integration/E2E، شواهد CI/staging، تغییر env، مسائل باز و شدت، ریسک امنیت/حریم خصوصی، بازبین، rollback/feature flag، مرحله بعد.

**چکلیست PR (۱۱):** معیار پذیرش، API contract، migration، مجوز/consent، edge case/idempotency، تست، حالتهای loading/empty/error، log عاری از PHI، env/docs، CI+review دوم، rollback/flag.

**گزارش باگ (۱۰):** عنوان، محیط/commit، نقش، پیششرط، مراحل بازتولید، انتظار، واقعیت، شدت، داده حساس؟، لاگ پاکسازی شده/correlation ID، مالک/موعد، نتیجه تست مجدد.

---

## ۲. توسعه و ارتقای خلاقانهٔ ایدهها — ۱۵ ماژول قابلانتخاب

در این بخش هر ایدهٔ استخراجشده به یک «ماژول پیشنهادی» ارتقا مییابد. شما میتوانید هر subset را انتخاب کنید.

### M1 — هویت مقاوم در برابر فیشینگ (ارتقای فاز ۲ و ۵.۵)
**از رودمپ:** OTP/password، MFA TOTP، recovery، tokenVersion، session revocation، ضد user enumeration.
**ارتقا:** Passkey/WebAuthn بهعنوان ورود پیشفرض ( phishable-none)، TOTP بهعنوان fallback، «ورود ریسکمحور» (دستگاه/IP/زمان/رفتار ← step-up MFA)، «مدیریت نشستها» (دیدن و بستن_remote همهٔ دستگاهها)، «دسترسی نمایندگی» (همسر/فرزند با consent محدود و قابل لغو)، «احراز هویت متخصص» با استعلام خارجی نظام پزشکی، «break-glass دو نفره» با دلیل و انقضای ۱۵ دقیقهای، «consent receipt» رمزنگاریشده.
**خروجی:** ورود بدون رمز عبور، ادمین غیرقابل فیشینگ، poleview نشستها، نمایندگی خانوادگی امن.

### M2 — ماشین وضعیتلساسیون (ارتقای فاز ۳)
**از رودمپ:** state machine واحد، نقش مجاز انتقال، idempotency، hold expiry، late payment، لغو/no-show/refund.
**ارتقا:** تعریف وضعیتها بهصورت **policy-as-code** در `packages/shared` + نمودار بصری قابل رندر در ادمین؛ **شبیهساز انتقال** (تست «اگر پرداخت ۲ دقیقه دیررسد چه میشود؟»)؛ **Saga/compensation** برای هر گام با عمل جبرانی ثبتشده؛ **SLA timer** خودکار برای هر وضعیت (مثلاً تأیید پزشک ظرف ۶ ساعت)؛ **idempotency key** سراسری برای رزرو/callback/refund/اعلان.
**خروجی:** وضعیتها قابل مشاهده، قابل شبیهسازی، قابل ممیزی و بدون اثر تکراری.

### M3 — رزرو هوشمند و تجربهٔ بیمار (ارتقای فاز ۳ + ۴)
**از رودمپ:** جستوجو، اسلات، RTL/responsive، loading/empty/error/offline/retry، ضد دوبل.
**ارتقا:** **رتبهبندی هوشمند اسلات** بر اساس ترجیح بیمار، احتمال no-show و بار پزشک؛ **نوبتهای تکرارشونده** (ماهانه/دوماهه) با قواعد لغو گروهی؛ **همگامسازی تقویم** (Google/Apple/Outlook با لینک کوتاهعمر)؛ **رزرو خانوادگی/گروهی** (چند نوبت پشت سر هم)؛ **جستوجوی مبتنی بر نزدیکی و حملونقل**؛ **تطبیق دسترسپذیری** (پزشک دارای تجهیزات/ساعات مناسب معلولان)؛ **ظرفیت پویا** با overbooking تحت شروط؛ **تمدید خودکار hold** هنگام پر شدن فرم.
**خروجی:** صفحهٔ «پیشنهاد بهترین نوبت»، رزرو periodic، تقویم متصل، و حالتِ senior /low-bandwidth موجود.

### M4 — پرداخت و مالی خودمختار (ارتقای فاز ۵)
**از رودمپ:** sandbox، callback validation، idempotency، reconciliation، refund worker، wallet/ledger.
**ارتقا:** **مسیریاب پرداخت** (انتخاب بهترین درگاه بر اساس موفقیت/کارمزد)؛ **پرداخت split/نمایندگی/بیمه با copay**؛ **کمک هزینه/کد تخفیف و اشتراک سلامت**؛ **داشبورد reconciliation** با تفاوتهای مشکوک و تخصیص self-service؛ **مدیریت disput/chargeback** با مهلت و شواهد؛ **قواعد لغو/جریمه بهصورت جدول policy** (نه magic number)؛ **refund SLA tracker** با escalation؛ **پرداخت آسانسازی شده** (لینک پرداخت، پرداخت در محل، BNPL) — تماماً با قید RLS/audit.
**خروجی:** جریان مالی کاملاً قابل ممیزی، خودتکمیل، چنددرگاهی.

### M5 — اعلان چندکاناله و مرکز ترجیحات (ارتقای فاز ۶.۱)
**از رودمپ:** Outbox، worker، retry/backoff، DLQ، SMS، Kavenegar، مرکز اعلان.
**ارتقا:** **ارکستراتور کانال** (SMS/push/email/in-app/پیامرسان) با first-fallback و quiet hours؛ **زمانبندی هوشمند** (یادآوری ۲۴ ساعت و ۲ ساعت قبل، بر اساس timezone بیمار)؛ **قالبهای نسخهدار و A/B**؛ **گزارش تحویل و dead-letter dashboard**؛ **اولویت/اسکالیشن تلفنی** برای لغو پزشک یا refund؛ **ترجیحات دقیق کاربر** (کدام رویداد، کدام کانال، ساعات سکوت)؛ **deep-link** به نوبت/چت.
**خروجی:** «هیچ رویدادی گم نمیشود» + تجربهٔ بدون اسپم.

### M6 — خط لولهٔ فایل هوشمند (ارتقای فاز ۶.۲)
**از رودمپ:** signed URL، magic bytes، quarantine، malware scan، storage خصوصی، مدارک پزشک.
**ارتقا:** **آپلود chunked/resumable** برای عکسهای بزرگ آزمایشگاهی؛ **چند موتور آنتیویروس** + یادگیری از نتایج؛ **DLP و تشخیص PHI** در تصویر/سند + **خودکار-redaction** چهره/نام؛ **OCR و استخراج نتایج آزمایش** به timeline (با consent)؛ ** dedupe محتوایی** (content-addressed)؛ **watermark و preview امن**؛ **چرخهٔ retention خودکار** بر اساس طبقهبندی.
**خروجی:** آپلود امن، سریع، هوشمند و قابل حذف قانونی.

### M7 — چت بالینی همیار (ارتقای فاز ۶.۳/۶.۴)
**از رودمپ:** conversation، consent، encryption، RLS، audit، rate limit، بازه، پیوست امن.
**ارتقا:** **پاسخهای سریع و قالبهای پزشک**؛ **ترجمهٔ درونخطی** (برای بیماران غیرفارسیزبان)؛ **خلاصهٔ conversation با consent** و پیوست به پرونده؛ **اسکالیشن یککلیکی به تماس/ویدئو/نوبت جدید**؛ **پیشنویس پاسخ AI** تنها از روی سوابق مجاز (بدون PHI در log) — متصل به Scribe موجود؛ **شاخص SLA پاسخ** و ** moderator tools** برای ادمین (با break-glass).
**خروجی:** چت کارآمدتر، کاملاً ممیزیپذیر، بدون نشت.data.

### M8 — ویدئو و ویزیت هوشمند (ارتقای فاز ۷)
**از رودمپ:** LiveKit، توکن کوتاهعمر، precheck، reconnect، ضبط خاموش.
**ارتقا:** **اتاق انتظار مجازی** + اعلام حضور پزشک؛ **همکاری با co-host / ضبط صفحه**؛ **زیرنویس و ترجمهٔ زنده**؛ **ضبط با dual-consent + auto-redaction و انقضای خودکار**؛ **تطبیق پهنای باند و حالت کممصرف** (موجود در تمها)؛ **نسخه و ارجاع الکترونیکی در حین تماس**؛ **خلاصهٔ خودکار post-visit** (Scribe موجود)؛ **پایش کیفیت اتصال و آمار join failure**.
**خروجی:** ویزیتی که واقعاً چرتکه میشود، نه فقط اتصال تصویری.

### M9 — پرونده سلامتبیمارمحور (ارتقای فاز ۸)
**از رودمپ:** RecordShare scope/expiry/revoke، consent، export/delete، FHIR.
**ارتقا:** **تایملاین سلامتبیمار** با نمودار روند وزن/فشار/قند؛ **بازسازی داروها (medication reconciliation)** و هشدار تداخل (غیرتشخیصی)؛ **دسترسی نمایندگی granular** (مثلاً فقط نتایج آزمایش، فقط ۳۰ روز)؛ **قابل حمل بودن کامل داده** (export/import استاندارد FHIR)؛ **consent receipt ledger** (کسی چه چیزی را کی دید)؛ **حذف قانونی با استثناء مالی** (قابل توضیح بهبیمار)؛ **retention self-service**؛ **zero-knowledge export** رمزشده با کلیدبیمار.
**خروجی:**بیمار مالک واقعی دادهاش است و میداند چه کسی آن را دیده است.

### M10 — triage و نظر دوم مسئولانه (ارتقای فاز ۸)
**از رودمپ:** triage غیرتشخیصی، red-flag escalation، نظر دوم، بازبینی بالینی.
**ارتقا:** **موتور قوانین توضیحپذیر و نسخهدار** (هر هشدار منبع و نسخه دارد)؛ **مسیر اورژانس ۱۱۵** با دکمهٔ واحد و بدون تشخیص؛ **بازار نظر دوم** با تطبیق تخصص، ناشناسسازی پرونده، escrow پرداخت و SLA؛ **جلسات MDT (تیم چندتخصصی)**؛ **هیئت حاکمیت بالینی** با ثبت مصوبهها؛ **آموزش بیمار** همراه با هر هشدار؛ **جلوگیری صریح از جایگزینی پزشک**.
**خروجی:** کمک اولیه بدون خطر گمراهی، با مسئولیت حقوقی و بالینی مشخص.

### M11 — عملیات خودمختار و قابلاعتماد (ارتقای فاز ۹)
**از رودمپ:** KMS، backup/restore drill، monitoring، verify_audit_chain، scanning، incident.
**ارتقا:** **SLO + error budget** با توقف خودکار rollout؛ **مانیتورینگ synthetic** (رزرو تستی هر ۵ دقیقه)؛ **chaos drill** دورهای (Redis/DB/provider down)؛ **Feature flag & canary هوشمند** (موجود) با auto-rollback؛ **runbook-self-healing** (پاکسازی صف، چرخش کلید)؛ **daily security posture** (SAST/SCA/container)؛ **cost observability**؛ **multi-region DR** و **audit-chain scheduler** (موجود).
**خروجی:** سیستمهایی که قبل ازبیمار متوجه مشکل میشوند.

### M12 — تست و کیفیت مستمر (ارتقای فاز ۵ و تستها)
**از رودمپ:** هرم تست، Gate A–E، ۱۰۰ درخواست همزمان، منفیها.
**ارتقا:** **property-based & fuzz tests** برای policyها؛ **mutation testing** برای پوشش واقعی؛ **contract tests (Pact/OpenAPI)**؛ **visual regression** برای ۱۵ تم؛ **axe accessibility** در CI؛ **SAST/DAST/SBOM**؛ **threat model as code**؛ **قرنطینهٔ تستهای flaky** (مثل `sse.test.ts`) با آمار بهجای حذف؛ **dashboards پوشش و روند**.
**خروجی:** کیفیت قابل اندازهگیری، نه صرفاً «تست سبز».

### M13 — تحلیل محصول بدون PHI (ارتقای فاز ۱۰ و KPI)
**از رودمپ:** شاخصهای تجمیعی، بازخورد هفتگی، Go/No-go.
**ارتقا:** **فونل رزرو** (جستوجو → اسلات → پرداخت → تأیید)؛ **cohort/retention**بیمار و پزشک؛ **داشبورد بهرهوری پزشک**؛ **NPS و feedback درونبرنامهای** با حداقل داده؛ **پلتفرم آزمایش A/B** با feature flag؛ **telemetry privacy-safe** (هش/تجمیع، بدون محتوای سلامت)؛ **گزارش هفتگی خودکار go/no-go**.
**خروجی:** تصمیمگیری بر اساس عدد، بدون نقض حریم خصوصی.

### M14 — اکوسیستم و رشد (جدید، فراتر از رودمپ)
**از رودمپ:** صریحاً نیامده، ولی نقش ادمین/پزشک/درمانگاه و فاز ۱۰ گسترش را زمینهسازی میکند.
**ارتقا:** **شبکهٔ درمانگاهها** (پروفایل مرکز، تخصصها، نقشه، نوبتدهی مرکزی) — دادهٔ نمایشی ۱۱ درمانگاه از قبل هست؛ **فضای کاری پزشک** (dashboard نوبتها، درآمد، viewModel اولویت)؛ **اشتراک و بستههای سلامت سازمانی**؛ **ادغام داروخانه/آزمایشگاه**؛ **نظرات و اعتبار پزشک** (با moderation و ضد تقلب)؛ **PWA/offline** و **اپ موبایل**؛ **چندزبانه** (فارسی/انگلیسی/عربی)؛ **API platform** برای third-partyها؛ **Trust center و status page عمومی**.
**خروجی:** از «ابزار نوبتدهی» به «پلتفرم سلامت» تبدیل میشود.

### M15 — طراحی، دسترسپذیری و تمها (ارتقای فاز ۴)
**از رودمپ:** RTL، متن دوجهته، responsive، کیبورد/focus/کنتراست، حالتهای خطا.
**ارتقا:** **Design system مشترک** (packages/shared) با توکنها؛ **۱۵ تم موجود** را با **تمهای فصلی/سازمانی** گسترش؛ **حالت Senior و کمپهنایباند موجود** را به **voice input، خوانندهٔ صفحه، فونت قابلتنظیم و فاصلهٔ لمسی** ارتقا؛ **سازگاری WCAG 2.2 AA/AAA** در CI؛ **پیشنهاد تم بر اساس زمان/شرایطبیمار**؛ **منطقهٔ خطاهای قابل فهم فارسی**.
**خروجی:** تجربهای که واقعاً برای_all قابل استفاده است.

---

## ۳. وضعیت فعلی پروژه در برابر رودمپ (راستیآزمایی با کد واقعی)

| حوزه | وضعیت | شواهد (فایل/پوشه) |
| --- | --- | --- |
| OTP / MFA / recovery codes | پیادهشده | `auth/otp.service.ts`، `auth/mfa.service.ts`، `auth/totp.ts` (RFC 6238)، `auth/mfa.guard.ts` |
| Password | وجود ندارد — مطابق ADR-0002 (OTP + Passkey) تصمیمگرفته شده | نبود `passwordHash` در `schema.prisma`، `docs/adr/0002-passkey.md` |
| tokenVersion | ناقص؛ جایگزین: `sid` + `ims` و ابطال فوری Redis cutoff | `auth/token.service.ts`، `auth/session-revocation.ts` |
| Passkey/WebAuthn | پیادهشده | `auth/passkey.service.ts`، `WebAuthnCredential` در schema، `web/src/app/security/page.tsx` |
| UI MFA / `mfa_required` | ناقص: صفحهٔ ادمین هست، صفحهٔ عمومی فقط Passkey، هندلینگ frontend `mfa_required` یافت نشد | `web/src/app/admin/security/page.tsx`، `web/src/app/security/page.tsx` |
| state machine / رزرو / لغو / no-show / refund/waitlist/reschedule | پیادهشده | `packages/shared/src/appointment.ts`، `scheduling/actions.ts`، `appointments/*.service.ts` |
| idempotency و no_double_booking | پیادهشده | `idempotency/`
، `hardening.sql` (EXCLUDE gist) |
| gatewayها، callback، payment_attempts، reconciliation، wallet/ledger | پیادهشده | `payment/gateway/*`، `payment/payment-settlement.ts`، `wallet/ledger.service.ts` |
| refund worker خودکار | ناقص: استرداد دستی/Maker–Checker است؛ job بازپرداخت خودکار ندارد | `payment/refund.service.ts`، `admin/finance.controller.ts`، `jobs/scheduler.service.ts` |
| notifier / outbox worker / SMS provider | پیادهشده (واقعی؛ Noop وایر نشده) | `jobs/jobs.module.ts`، `notifications/push-notifier.ts`، `outbox/*`، `sms/sms.provider.ts` |
| notification preferences | وجود ندارد | فقط مرکز اعلان: `web/src/app/notifications/page.tsx` |
| signed upload / private storage | پیادهشده | `storage/storage.service.ts`، `storage/storage.config.ts` |
| magic bytes / quarantine / malware scan | وجود ندارد | `docs/phase-19.md` صریحاً «باقی است» میگوید |
| مدارک پزشک (prefix `verification/`) | ناقص: مسیر آپلودی برای این پیشوند وجود ندارد | `doctors/doctor-application.controller.ts`، `storage/storage.controller.ts` |
| چت: conversation / رمزنگاری / RLS / WS / پیوست | پیادهشده | `chat/chat.service.ts`، `chat/chat-codec.ts`، `chat/chat.gateway.ts` |
| چت rate limit | وجود ندارد | جستوجوی `RateLimiter` در `chat/` بی نتیجه |
| LiveKit / token محدود | پیادهشده | `video/livekit.ts`، `video/video.service.ts` |
| precheck سمت سرور / ضبط و consent ویدئو | ناقص / وجود ندارد | فقط UI: `web/src/app/precheck/page.tsx` |
| FHIR / RecordShare / consent / export-delete / triage / نظر دوم | پیادهشده | `records/*`، `triage/*`، `second-opinion/*` |
| KMS/Vault | ناقص (پیکربندی نمونه: `tls_disable=true`) | `infra/vault/vault.hcl` |
| backup/restore drill / monitoring / audit verify / SRE / k6 / OpenAPI / ۱۵ تم / Scribe / RPM | پیادهشده | `scripts/backup-db.sh`، `infra/monitoring/`، `audit/audit-verifier.service.ts`، `load/*.js`، `design/tokens.json` |
| feature flag اختصاصی | وجود ندارد (canary و toggle محیطی هستند) | `infra/canary/rollout.yaml`، `scripts/canary-gate.mjs` |
| unit / integration | پیادهشده (۵۴۵ + ۱۱ فایل integration) | `apps/api/src/**/*.test.ts`، `apps/api/test/*.int.test.ts` |
| E2E MFA ادمین و لغو/refund | وجود ندارد | `apps/e2e/tests/` فقط critical-path، payment-forgery، a11y، pwa |

**خلاصه:** رودمپ قدیمیتر از کد است. باگهای بحرانی رودمپ (Notifier، password نیمهکاره، FHIR، triage) حل شدهاند؛ شکاف واقعی در: **magic bytes/quarantine/scan، feature flags، ترجیحات اعلان، rate limit چت، consent ضبط ویدئو، refund worker، MFA frontend، E2Eهای ویژه و KMS واقعی** است.

---

## ۴. نحوهٔ انتخاب

پس از مطالعهٔ بخش ۲، کدامیک از ماژولهای M1–M15 را به پروژه اضافه کنیم؟ میتوانید:
- فقط یک یا چند ماژول،
- «همهٔ موارد امنیتی/زیرساختی»،
- یا «همهٔ موارد تجربهٔبیمار»،
- یا ترکیبی دلخواه (مثلاً M1+M3+M5+M13) انتخاب کنید.
