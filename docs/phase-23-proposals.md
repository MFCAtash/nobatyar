# فاز ۲۴ — پیشنهادهای جامع توسعه و ارتقا (بصری + قابلانتخاب)

صفحهٔ بصری قابلانتخاب: **`/proposals`** (هدر ← «نقشه پیشنهادها»). هر ایده قابلتیک است و انتخابها در localStorage ذخیره میشوند.

> وضعیت فعلی: فاز ۱۹–۲۲ پیاده شده (MFA، reschedule، FHIR، RPM، Scribe، SREConfig، ۱۲ تم، ۶ فونت، لوگوی Nastaliq/ECG). این سند فقط **پیشنهاد** است تا زمانی که کاربر گزینهها را انتخاب کند.

---

## ۱) فرانت و طراحی ظاهری (اولویت ویژه)

### الف) ایدههای بصری و تعامل
| ایده | توضیح | 🎯 | 🔧 |
|---|---|---|---|
| Command Palette (Ctrl+K) | جستجوی لحظهای پزشک، نوبت، نسخه و پرونده از هر صفحه | ⭐⭐⭐ | M |
| Hero ECG متحرک | خط نبض ظریف پشت عنوان صفحه اصلی + CTA شفاف | ⭐⭐ | S |
| تقویم Drag-Reschedule | جابهجایی نوبت با کشیدن روی اسلات در تقویم هفتگی | ⭐⭐⭐ | L |
| داشبورد قابلچینش | کارتهای «امروز من» با Drag & Drop و ذخیره چیدمان | ⭐⭐⭐ | M |
| نمودار RPM پیشرفته | Sparkline + بازه هشدار + Tooltip + مقایسه با هفته قبل | ⭐⭐⭐ | M |
| تم تطبیقی ساعتی | تم شبانه بعد از ۲۰:۰۰ و روشن صبح، با امکان override توسط کاربر | ⭐⭐ | S |
| تم فصلی | پالتهای بهاری/تابستانی/پاییزی با همان ساختار توکنها | ⭐ | S |
| Micro-interaction تأیید | انیمیشن ملایم علامت تأیید و progress رزرو | ⭐⭐ | S |
| Voice Search فارسی | دکمه میکروفون و تبدیل گفتار به متن جستجو | ⭐⭐ | M |
| Skeleton دامنهای | اسکلت اختصاصی کارت پزشک/جدول/نمودار + blur-up تصویر | ⭐⭐ | M |
| Empty State هوشمند | پیام خالی همراه با دکمه اقدام و توضیح مرحله بعد | ⭐⭐ | S |
| Realtime Audio-only UI | حالت کمپهنایباند در ویدئو با تمرکز بر صدا | ⭐⭐ | M |

### ب) تجربه بیمار و پزشک
| ایده | توضیح | 🎯 | 🔧 |
|---|---|---|---|
| اتاق انتظار مجازی | شمارش معکوس، چکلیست آمادگی، تست دوربین/میکروفون | ⭐⭐⭐ | M |
| Pre-check هوشمند | تکمیل فرم/مدارک قبل از ویزیت در تدارک رزرو | ⭐⭐⭐ | M |
| NPS بعد از ویزیت | نظرسنجی ۱–۱۰ + دلیل، با انیمیشن و Bay-esque خلاصه | ⭐⭐ | S |
| مرکز پشتیبانی تیکتی | تیکت + SLA + چت پشتیبانی + وضعیت قابلپیگیری | ⭐⭐ | M |
| سفر نوبت Stepper | نمایش مراحل رزرو→پرداخت→ویزیت→خلاصه در تمام صفحات | ⭐⭐⭐ | M |
| قالبهای SOAP/نسخه | میانبر شخصیپزشک با متغیرهای بیمار | ⭐⭐⭐ | S |
| ا-imپای دیجیتال | امضای پزشک با تأیید دومرحلهای (MFA فعلی) | ⭐⭐ | M |

### ج) سیستم طراحی
- Design Token v3: لایهٔ معنایی `surface/raised/overlay`، سایه و هاله بصری.
- Storybook: story برای **تمها و فونتها** + baseline بصری Playwright.
- Accessibility: axe در CI، تمرکز قابلمشاهده، حداقل کنتراست AAA در تم ادمین.
- i18n: fa/en/ar با RTL/LTR و ترجمه پویا.

---

## ۲) بکاند و دیتابیس

| ایده | توضیح | 🎯 | 🔧 |
|---|---|---|---|
| Outbox Exactly-Once | کلید دوبارهپردازی unify + جدول processed dedup | ⭐⭐⭐ | M |
| Read Models (CQRS) | جداول materialized برای داشبورد پزشک و BI | ⭐⭐⭐ | L |
| Waitlist Auto-fill + No-show |job پر کردن جای خالی و امتیاز no-show (فعلاً اسکیما آماده) | ⭐⭐⭐ | L |
| Ledger مالی | کیف پول + پرداخت ترکیبی + بیمه + payout با double-entry | ⭐⭐⭐ | L |
| Passkey/WebAuthn | ورود بدون رمز مکمل OTP فعلی | ⭐⭐⭐ | M |
| Multi-tenant | tenant_id در RLS + white-label | ⭐⭐ | L |
| FHIR Bulk + Subscription | خروجی گروهی و subscription برای تغییرات پرونده | ⭐⭐ | M |
| Audit Chain Verifier |job بررسی زنجیره هش Audit و هشدار هنگام گسست | ⭐⭐⭐ | M |
| Partitioning | پارتیشن ماهانه appointments/audit/outbox | ⭐⭐ | M |

---

## ۳) امنیت و حریمخصوصی

| ایده | توضیح | 🎯 | 🔧 |
|---|---|---|---|
| SBOM + cosign | ایجاد SBOM و امضای تصویر Docker | ⭐⭐⭐ | M |
| Vault/KMS | جایگزینی env با secret manager و چرخش خودکار | ⭐⭐⭐ | L |
| WAF + Bot + CAPTCHA | محدودسازی تلاش OTP و محافظت لبه | ⭐⭐⭐ | M |
| E2EE چت | کلید مکالمه و رمزنگاری انتهابهانتها | ⭐⭐ | L |
| Secret Rotation Drill | تست چرخش کلیدها بدون downtime | ⭐⭐⭐ | M |
| RBAC ریزدانه + Audit Viewer | نقشهای منشی/داروسازو model permissions | ⭐⭐⭐ | M |
| Pentest + بازبینی حقوقی | پیش از GA | ⭐⭐⭐ | L |
| Data Residency | میزبانی داخل کشور و مستندسازی | ⭐⭐⭐ | L |

---

## ۴) DevOps و CI/CD

| ایده | توضیح | 🎯 | 🔧 |
|---|---|---|---|
| Pipeline واقعی GH Actions | lint/typecheck/test/build/migrate/e2e/k6 | ⭐⭐⭐ | M |
| Canary/Blue-Green | rollout تدریجی + rollback خودکار بر اساس SLO | ⭐⭐⭐ | L |
| Preview Env per PR | محیط موقتی با DB/Redis جدا | ⭐⭐ | M |
| Migration Safety Checker | expand/contract و جلوگیری از UPDATE مخرب | ⭐⭐⭐ | M |
| IaC با Terraform | provisioning ابری قابلتکرار | ⭐⭐ | L |
| Secrets Scanning | gitleaks + trivy + semgrep در CI (config موجود) | ⭐⭐⭐ | S |
| Chaos Game Day | قطع عمدی Redis/DB در استیج | ⭐⭐ | M |

---

## ۵) مانیتورینگ و SRE

| ایده | توضیح | 🎯 | 🔧 |
|---|---|---|---|
| Error Budget Policy | توقف deploy هنگام مصرف بودجه خطا | ⭐⭐⭐ | M |
| Synthetic Full Journey | probe نویسی واقعی رزرو/پرداخت در استیج | ⭐⭐⭐ | L |
| Log PII Guard Test | تست CI مبنی بر عدم خروج داده سلامت به Sentry/Loki | ⭐⭐⭐ | M |
| On-call Runbook Bot | لینک runbook در هشدار + دستورات رایج | ⭐⭐ | S |
| Trace Exemplars | اتصال metrics→trace در Grafana (Tempo آماده) | ⭐⭐ | M |

---

## ۶) تست و کیفیت

| ایده | توضیح | 🎯 | 🔧 |
|---|---|---|---|
| Integration Testcontainers | Postgres/Redis حقیقی در Vitest | ⭐⭐⭐ | M |
| Contract Tests | Pact بین API و وب | ⭐⭐ | M |
| Visual Regression | commit baselineهای Playwright | ⭐⭐⭐ | M |
| Mutation Testing | Stryker روی policyها | ⭐⭐ | M |
| k6 Profiles | بار رزرو/پرداخت/جستجو | ⭐⭐⭐ | M |
| Axe CI | دسترسپذیری تمام صفحات | ⭐⭐⭐ | S |

---

## ۷) مستندات و حاکمیت

| ایده | توضیح | 🎯 | 🔧 |
|---|---|---|---|
| ADR Library | تصمیمات معماری شمارهدار (کیف پول/FHIR/چندمستأجری) | ⭐⭐⭐ | S |
| OpenAPI Request Schemas | تکمیل بدنهها برای type-safety واقعی | ⭐⭐⭐ | M |
| Runbook + Postmortem | الگوی حادثه و بازنگری | ⭐⭐ | S |
| Privacy Impact Assessment | ارزیابی حریم خصوصی برای Scribe/RPM/FHIR | ⭐⭐⭐ | M |

---

## ۸) پیشنهادهای بصری خاص (پالت و هاله)

- **هاله نور دوگانه**: radial-gradient اصلی `var(--teal-glow)` + ثانویه `color-mix(var(--blue) 14%)`.
- **لوگوی ECG پالسدار**: انیمیشن نبضآرام روی `.brand-ecg` با احترام به reduced-motion.
- **کارت شیشهای کلاسیک**: glass حذفشده، جایگزین سطح مات + border ظریف + سایه نرم (مناسب پزشکی).
- **رنگ برچسب بالینی**: سبز=طبیعی، کهربا=توجه، قرمز=هشدار، همراه متن و آیکون (never color alone).
- **تایپوگرافی**: شهرزاد برای بدنه، نستعلیق فقط لوگو/عناوین، Inter برای اعداد/کدها.
