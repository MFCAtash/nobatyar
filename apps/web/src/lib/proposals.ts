export type ProposalCategory =
  | "فرانت و طراحی" | "تجربه کاربر" | "بکاند و دیتابیس" | "امنیت"
  | "DevOps و CI/CD" | "مانیتورینگ" | "تست و کیفیت" | "مستندات";

export interface Proposal {
  id: string;
  cat: ProposalCategory;
  title: string;
  desc: string;
  impact: 1 | 2 | 3;
  effort: "S" | "M" | "L";
  icon: string;
}

export const PROPOSALS: Proposal[] = [
  // فرانت و طراحی
  { id: "cmd-k", cat: "فرانت و طراحی", title: "Command Palette", desc: "جستجوی لحظهای پزشک، نوبت، نسخه و پرونده با Ctrl+K", impact: 3, effort: "M", icon: "⌘" },
  { id: "hero-ecg", cat: "فرانت و طراحی", title: "Hero ECG متحرک", desc: "خط نبض ظریف پشت عنوان صفحه اصلی و CTA شفاف", impact: 2, effort: "S", icon: "📈" },
  { id: "drag-reschedule", cat: "فرانت و طراحی", title: "تقویم Drag-Reschedule", desc: "جابهجایی نوبت با کشیدن روی اسلات در تقویم هفتگی", impact: 3, effort: "L", icon: "🗓️" },
  { id: "dash-reorder", cat: "فرانت و طراحی", title: "داشبورد قابلچینش", desc: "کارتهای امروز من با Drag & Drop و ذخیره چیدمان", impact: 3, effort: "M", icon: "🧩" },
  { id: "rpm-chart", cat: "فرانت و طراحی", title: "نمودار RPM پیشرفته", desc: "بازه هشدار، Tooltip و مقایسه با هفته قبل", impact: 3, effort: "M", icon: "📊" },
  { id: "adaptive-theme", cat: "فرانت و طراحی", title: "تم تطبیقی ساعتی", desc: "شبانه بعد از ۲۰:۰۰ و روشن صبح با override کاربر", impact: 2, effort: "S", icon: "🌗" },
  { id: "seasonal-theme", cat: "فرانت و طراحی", title: "تمهای فصلی", desc: "پالتهای بهاری/تابستانی/پاییزی با همان ساختار توکنها", impact: 1, effort: "S", icon: "🌿" },
  { id: "success-motion", cat: "فرانت و طراحی", title: "انیمیشن تأیید", desc: "Micro-interaction ملایم هنگام تأیید رزرو و امضا", impact: 2, effort: "S", icon: "✨" },
  { id: "voice-search", cat: "فرانت و طراحی", title: "Voice Search فارسی", desc: "دکمه میکروفون و تبدیل گفتار به متن جستجو", impact: 2, effort: "M", icon: "🎤" },
  { id: "domain-skeleton", cat: "فرانت و طراحی", title: "Skeleton دامنهای", desc: "اسکلت اختصاصی کارت پزشک/جدول/نمودار", impact: 2, effort: "M", icon: "🦴" },
  { id: "smart-empty", cat: "فرانت و طراحی", title: "Empty State هوشمند", desc: "پیام خالی همراه دکمه اقدام و توضیح مرحله بعد", impact: 2, effort: "S", icon: "📭" },
  { id: "audio-only", cat: "فرانت و طراحی", title: "ویدئوی Audio-only", desc: "حالت کمپهنایباند با تمرکز بر صدا", impact: 2, effort: "M", icon: "🎧" },

  // تجربه کاربر
  { id: "waiting-room", cat: "تجربه کاربر", title: "اتاق انتظار مجازی", desc: "شمارش معکوس، چکلیست آمادگی و تست دوربین", impact: 3, effort: "M", icon: "🚪" },
  { id: "pre-check", cat: "تجربه کاربر", title: "Pre-check هوشمند", desc: "تکمیل فرم و مدارک قبل از ویزیت", impact: 3, effort: "M", icon: "📋" },
  { id: "nps", cat: "تجربه کاربر", title: "NPS بعد از ویزیت", desc: "نظرسنجی ۱–۱۰ با دلیل و خلاصه تحلیلی", impact: 2, effort: "S", icon: "💬" },
  { id: "support-ticket", cat: "تجربه کاربر", title: "مرکز پشتیبانی", desc: "تیکت + SLA + چت پشتیبانی قابلپیگیری", impact: 2, effort: "M", icon: "🎫" },
  { id: "journey-stepper", cat: "تجربه کاربر", title: "سفر نوبت Stepper", desc: "رزرو→پرداخت→ویزیت→خلاصه در تمام صفحات", impact: 3, effort: "M", icon: "🧭" },
  { id: "soap-templates", cat: "تجربه کاربر", title: "قالب SOAP/نسخه", desc: "میانبر شخصی پزشک با متغیرهای بیمار", impact: 3, effort: "S", icon: "📝" },

  // بکاند و دیتابیس
  { id: "outbox-exactly", cat: "بکاند و دیتابیس", title: "Outbox Exactly-Once", desc: "یکسانسازی کلید دوبارهپردازی و جدول dedup", impact: 3, effort: "M", icon: "📮" },
  { id: "read-models", cat: "بکاند و دیتابیس", title: "Read Models (CQRS)", desc: "جداول materialized برای داشبورد پزشک و BI", impact: 3, effort: "L", icon: "🧱" },
  { id: "waitlist-engine", cat: "بکاند و دیتابیس", title: "موتور لیست انتظار", desc: "پر کردن خودکار جای خالی و امتیازدهی no-show", impact: 3, effort: "L", icon: "⏱️" },
  { id: "ledger", cat: "بکاند و دیتابیس", title: "Ledger مالی", desc: "کیف پول، پرداخت ترکیبی، بیمه و تسویه دوطرفه", impact: 3, effort: "L", icon: "💳" },
  { id: "passkey", cat: "بکاند و دیتابیس", title: "Passkey/WebAuthn", desc: "ورود بدون رمز مکمل OTP فعلی", impact: 3, effort: "M", icon: "🔑" },
  { id: "multi-tenant", cat: "بکاند و دیتابیس", title: "Multi-tenant", desc: "tenant_id در RLS و قابلیت white-label", impact: 2, effort: "L", icon: "🏢" },
  { id: "fhir-bulk", cat: "بکاند و دیتابیس", title: "FHIR Bulk/Subscription", desc: "خروجی گروهی و subscription تغییرات پرونده", impact: 2, effort: "M", icon: "🧬" },
  { id: "audit-verifier", cat: "بکاند و دیتابیس", title: "Audit Chain Verifier", desc: "بررسی زنجیره هش Audit و هشدار گسست", impact: 3, effort: "M", icon: "🔗" },

  // امنیت
  { id: "sbom", cat: "امنیت", title: "SBOM + cosign", desc: "تولید SBOM و امضای تصویر Docker", impact: 3, effort: "M", icon: "🛡️" },
  { id: "vault", cat: "امنیت", title: "Vault/KMS", desc: "جایگزینی env با secret manager و چرخش خودکار", impact: 3, effort: "L", icon: "🔐" },
  { id: "waf", cat: "امنیت", title: "WAF + CAPTCHA", desc: "محافظت لبه و محدودسازی تلاش OTP", impact: 3, effort: "M", icon: "🧱" },
  { id: "e2ee", cat: "امنیت", title: "E2EE چت", desc: "رمزنگاری انتهابهانتها با کلید مکالمه", impact: 2, effort: "L", icon: "🔏" },
  { id: "rbac", cat: "امنیت", title: "RBAC ریزدانه", desc: "نقش منشی/داروساز و Audit Viewer", impact: 3, effort: "M", icon: "👥" },
  { id: "pentest", cat: "امنیت", title: "Pentest + حقوقی", desc: "بازبینی نفوذ و انطباق پیش از GA", impact: 3, effort: "L", icon: "⚖️" },

  // DevOps
  { id: "gh-actions", cat: "DevOps و CI/CD", title: "Pipeline واقعی", desc: "lint/typecheck/test/build/migrate/e2e/k6", impact: 3, effort: "M", icon: "⚙️" },
  { id: "canary", cat: "DevOps و CI/CD", title: "Canary/Blue-Green", desc: "rollout تدریجی و rollback خودکار بر اساس SLO", impact: 3, effort: "L", icon: "🚀" },
  { id: "preview-env", cat: "DevOps و CI/CD", title: "Preview Env", desc: "محیط موقت برای هر PR با DB/Redis جدا", impact: 2, effort: "M", icon: "🧪" },
  { id: "migration-check", cat: "DevOps و CI/CD", title: "Migration Safety", desc: "جلوگیری از ALTER مخرب و expand/contract", impact: 3, effort: "M", icon: "🛠️" },
  { id: "terraform", cat: "DevOps و CI/CD", title: "IaC با Terraform", desc: "provisioning ابری قابلتکرار", impact: 2, effort: "L", icon: "📦" },

  // مانیتورینگ
  { id: "error-budget", cat: "مانیتورینگ", title: "Error Budget Policy", desc: "توقف deploy هنگام مصرف بودجه خطا", impact: 3, effort: "M", icon: "📉" },
  { id: "synthetic-full", cat: "مانیتورینگ", title: "Synthetic Full Journey", desc: "probe نویسی واقعی رزرو/پرداخت در استیج", impact: 3, effort: "L", icon: "🤖" },
  { id: "pii-guard", cat: "مانیتورینگ", title: "Log PII Guard", desc: "تست CI مبنی بر عدم خروج داده سلامت", impact: 3, effort: "M", icon: "🧼" },
  { id: "runbook-bot", cat: "مانیتورینگ", title: "Runbook Bot", desc: "لینک runbook و دستورات رایج در هشدار", impact: 2, effort: "S", icon: "📖" },

  // تست
  { id: "testcontainers", cat: "تست و کیفیت", title: "Integration Containers", desc: "Postgres/Redis حقیقی در Vitest", impact: 3, effort: "M", icon: "🐳" },
  { id: "contract-test", cat: "تست و کیفیت", title: "Contract Tests", desc: "Pact بین API و وب", impact: 2, effort: "M", icon: "🤝" },
  { id: "visual-baseline", cat: "تست و کیفیت", title: "Visual Regression", desc: "commit baselineهای Playwright", impact: 3, effort: "M", icon: "🖼️" },
  { id: "mutation", cat: "تست و کیفیت", title: "Mutation Testing", desc: "Stryker روی policyها", impact: 2, effort: "M", icon: "🧬" },
  { id: "k6", cat: "تست و کیفیت", title: "k6 Load Profiles", desc: "بار رزرو/پرداخت/جستجو", impact: 3, effort: "M", icon: "📈" },
  { id: "axe-ci", cat: "تست و کیفیت", title: "Axe در CI", desc: "دسترسپذیری تمام صفحات", impact: 3, effort: "S", icon: "♿" },

  // مستندات
  { id: "adr", cat: "مستندات", title: "ADR Library", desc: "تصمیمات معماری شمارهدار", impact: 3, effort: "S", icon: "📐" },
  { id: "openapi-schemas", cat: "مستندات", title: "OpenAPI Schemas", desc: "تکمیل بدنهها برای type-safety واقعی", impact: 3, effort: "M", icon: "📜" },
  { id: "postmortem", cat: "مستندات", title: "Runbook/Postmortem", desc: "الگوی حادثه و بازنگری", impact: 2, effort: "S", icon: "📓" },
  { id: "pia", cat: "مستندات", title: "Privacy Impact", desc: "ارزیابی Scribe/RPM/FHIR", impact: 3, effort: "M", icon: "🔍" },
];
