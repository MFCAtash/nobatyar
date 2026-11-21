# فاز ۲۱ — اجرای کامل پیشنهادهای A0–A11 و B0–B10

این سند ثبت میکند که پیشنهادهای مطرحشده در `docs/phase-20-audit-and-design.md` چگونه در کد پیاده شدند.

## بکاند و دیتابیس

| مورد | پیادهسازی |
|---|---|
| **A0** | `apps/api/scripts/generate-baseline-migrations.mjs` و `check-migrations.mjs` — ۱۲ migration شامل init و تمام SQLهای ORDER ساخته شدند؛ اسکریپت `db:baseline` |
| **A1** | `ADMIN_REQUIRE_MFA` پیشفرض `false` (opt-in) + هشدار `preflight`؛ مسیر break-glass مستند شد |
| **A2** | `MfaService.enroll` در حالت فعال با ۴۰۹ رد میشود؛ `POST /me/mfa/rotate` با تأیید کد فعلی اضافه شد |
| **A3** | RLS vitals محدود به رابطه درمانی فعال + رضایت؛ پاسخ شامل `patientId/patientName` و cursor pagination |
| **A4** | `purgeExpired()` در maintenance worker (هر دقیقه) + متریک `nobatyar_scribe_purged_total` |
| **A5** | `POST /appointments/:id/scribe/apply` دارای `expectedVersion` خوشبینانه |
| **A6** | `DataRequestReview` (دو رأی مستقل)، grace ۳۰ روزه،job اجرای واقعی EXPORT (ذخیره در MinIO) و DELETE (حذف داده سلامت، حفظ سوابق مالی/ممیزی)، لینک دانلود، صف ادمین |
| **A7** | FHIR: `includeDocuments` با محتوای base64، وضعیت Condition، `meta.security`، ETag |
| **A8** | OpenAPI ۱۲۵/۱۲۵ مسیر (پنج مسیر جدید مستند شدند) |
| **A9** | `pnpm.overrides` تک نسخه OTel و حذف type-cast |
| **A10** | CHECK با `now()` به trigger تبدیل شد؛ محافظت از تغییر status توسط نقش اپ |
| **A11** | `scoreNoShow` توضیحپذیر +job امتیازدهی هفتگی (`noShowRisk` / `riskScoredAt`) |

## فرانت و طراحی

| مورد | پیادهسازی |
|---|---|
| **B0** | چهار صفحهnew بهجای `<main>` از `<div className="stack">` استفاده میکنند |
| **B1** | هدر گروهی: ۳ لینک اصلی + drawer «بیشتر» با `aria-expanded` و بستن با Escape؛ CSP dev برای React Refresh اصلاح شد |
| **B2/B3** | `ThemeProvider` واحد +Legacy mapping، `design/tokens.json` با ۶ تم و modifierهای density/fontScale/motion |
| **B4/B5** | خطاهای `vital_invalid.issues` ترجمه میشوند؛ `Alert`, `FormField`, `Sparkline`, `VitalCard`, `EmptyState` در صفحه RPM |
| **B6** | Stepper چهارمرحلهای Scribe، چکلیست رضایت واقعی از API، ترجمه خطاها، دکمه «نزدیکترین وقت آزاد» در Reschedule |
| **B7** | Modal تأیید حذف داده با تایپ عبارت + توضیح ۳۰روزه |
| **B8** | راز TOTP مخفی پیشفرض، نمایش/کپی/دانلود کدهای پشتیبان و لینک otpauth |
| **B9** | `DesignSystem.stories.tsx` + صفحه `/design` (نمایشگاه زندهتمها و کامپوننتها) |
| **B10** | `themeColor` پویا، تم سالمند و کمپهنایباند، هدایت تمها، و ایجاد صفحه انطباق ادمین |

## نحوه مشاهده بصری

صفحهٔ **`/design`** (در هدر «نمایشگاه طراحی»)تمها و کامپوننتها را زنده نشان میدهد:

- کلیک روی هر تم ⇒ بلافاصله اعمال و ذخیره (`data-theme`)
- تغییر تراکم و مقیاس قلم ⇒ بلافاصله اعمال
- پالت رنگ تم فعلی، Stepper، Badge، Alert، StatCard، VitalCard، Sparkline، جدول، فرم و EmptyState

## نتایج اجرا

- `pnpm -r typecheck` ✅
- `pnpm -r test` ✅ — API ۵۲۳، Web ۱۶۹، shared ۱۴
- `pnpm -r build` ✅ (وب با `NEXT_STANDALONE=false` در ویندوز)
- `tokens` و `openapi` و `gen:api` ✅ (۱۲۵ عملیات)
