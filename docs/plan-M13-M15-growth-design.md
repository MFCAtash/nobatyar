# طرح اجرایی M13–M15 — تحلیل، اکوسیستم، طراحی

## M13 — تحلیل محصول بدون PHI

**Flag:** `FF_M13_PRODUCT_ANALYTICS` · **تخمین:** 4–6 روز

### وضعیت فعلی و شکاف
ماژول `analytics` و SLOها موجوداند، ولی فونل رزرو، cohort/retention، NPS و A/B وجود ندارد وtelemetry باید privacy-safe تأیید شود.

### Schema / Migration
```prisma
model FunnelEvent {
  id        String @id @default(uuid()) @db.Uuid
  anonymousId String @map("anonymous_id")
  step      String
  at        DateTime @default(now()) @map("at") @db.Timestamptz
  metaHash  String? @map("meta_hash")
  @@index([step, at])
  @@map("funnel_events")
}
model Experiment {
  key       String @id
  variants  String // JSON
  enabled   Boolean @default(false)
  @@map("experiments")
}
```

### API Contract
`POST /analytics/funnel` (فقط مراحل، بدون محتوا) · `GET /admin/analytics/funnel` · `GET /admin/analytics/cohorts` · `GET|POST /me/feedback` · `GET /admin/experiments`.

### UI
داشبورد فونل (جستوجو → اسلات → پرداخت → تأیید)، نمودار cohort، کارت NPS درونبرنامهای، صفحهٔ آزمایش A/B.

### تستها
unit: هش کردن metadata و حذف PHI؛ integration: هیچ رکورد حاوی متن آزاد ذخیره نشود؛ security: اسکن لاگ/telemetry صفر PHI.

---

## M14 — اکوسیستم و رشد

**Flag:** `FF_M14_ECOSYSTEM` · **تخمین:** 8–12 روز

### وضعیت فعلی و شکاف
ماژولهای `family` و `compare` و شبکهٔ ۱۱ درمانگاه در دادهٔ دمو وجود دارند؛ ولی پروفایل مرکز درمانگاه، فضای کاری پزشک، اشتراک سازمانی، داروخانه/آزمایشگاه، شهرک اعتبار و PWA کامل نیستند.

### Schema / Migration
```prisma
model Clinic {
  id        String @id @default(uuid()) @db.Uuid
  name      String
  addressFa String @map("address_fa")
  phone     String
  geoLat    Float? @map("geo_lat")
  geoLng    Float? @map("geo_lng")
  verified  Boolean @default(false)
  @@map("clinics")
}
model DoctorWorkspace {
  doctorId  String @id @map("doctor_id") @db.Uuid
  dashboard String // JSON layout
  @@map("doctor_workspaces")
}
model OrganizationPlan {
  id        String @id @default(uuid()) @db.Uuid
  name      String
  seats     Int
  @@map("organization_plans")
}
```

### API Contract
`GET /clinics?q&lat&lng` · `GET /doctors/:id/clinic` · `GET /doctor/me/dashboard` · `POST /organizations` · `GET /me/organization`.

### UI
صفحهٔMergeشدهٔ جستوجوی درمانگاهها با نقشه، فضای کاری پزشک (نوبتها/درآمد/اولویتها)، بستهٔ سازمانی، PWA install prompt و حالت offline.

### تستها
unit: جستوجوی نزدیکی؛ integration: اتصال پزشک به clinic؛ E2E: PWA offline؛ security: عدم افشای اطلاعات خصوصی در نمای عمومی.

---

## M15 — طراحی، دسترسپذیری و تمها

**Flag:** `FF_M15_WCAG` · **تخمین:** 5–7 روز

### وضعیت فعلی و شکاف
۱۵ تم در `apps/web/design/tokens.json` و صفحهٔ `/design` موجود است؛ ولی design system مشترک، voice input، screen reader کامل و WCAG 2.2 AA/AAA در CI نیستند.

### Schema / Migration
نیازی به migration؛ فقط توکنها و کامپوننتها.

### API Contract
`GET /me/ui-preferences` · `PUT /me/ui-preferences` (تم، فونت، فاصله، صدا، خواننده).

### UI
کاتالوگ Design system باهمهٔ کامپوننتها و ۱۵ تم، پنل تنظیمات دسترسپذیری (فونت، کنتراست، voice، screen reader).

### تستها
axe-core در CI برایهمهٔ صفحات کلیدی، keyboard-only E2E، visual regression ۱۵ تم،اندازهٔ فونت ۱۰۰/۱۲۵/۱۵۰.
