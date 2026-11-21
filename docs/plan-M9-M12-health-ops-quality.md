# طرح اجرایی M9–M12 — پرونده، triage، عملیات، کیفیت

## M9 — پرونده سلامت بیمارمحور

**Flag:** `FF_M9_PATIENT_RECORD` · **تخمین:** 6–8 روز

### وضعیت فعلی و شکاف
FHIR/RecordShare/consent/export موجودند؛ ولی تایم لاین روندها، medication reconciliation، نمایندگی granular، consent receipt ledger و export رمزشده با کلید بیمار کامل نیستند.

### Schema / Migration
```prisma
model HealthTimelinePoint {
  id        String @id @default(uuid()) @db.Uuid
  patientId String @map("patient_id") @db.Uuid
  kind      String // WEIGHT|BP|GLUCOSE|LAB
  valueEnc  Bytes  @map("value_enc")
  at        DateTime @map("at") @db.Timestamptz
  @@index([patientId, at])
  @@map("health_timeline_points")
}
model MedicationReconciliation {
  id        String @id @default(uuid()) @db.Uuid
  patientId String @map("patient_id") @db.Uuid
  itemsEnc  Bytes  @map("items_enc")
  reviewedBy String? @map("reviewed_by") @db.Uuid
  @@map("medication_reconciliations")
}
```

### API Contract
`GET /me/health/timeline?kind&from&to` · `POST /me/health/timeline` · `POST /me/health/medications/reconcile` · `GET /me/consent-ledger` · `POST /me/health/export` (رمزنگاری با کلید بیمار).

### UI
تایم لاین با نمودارهای وزن/فشار/قند، لیست داروها با هشدار تداخل (غیرتشخیصی)، صفحهٔ «چه کسی چه چیزی را دید»، دکمهٔ export/delete.

### تستها
unit: parser مقادیر،تشخیص هشدار تداخل؛ integration: RLS/share expiry/revoke؛ security: export بدون consent 403، PHI در log صفر.

---

## M10 — Triage و نظر دوم مسئولانه

**Flag:** `FF_M10_TRIAGE_GOV` · **تخمین:** 7–10 روز + بازبینی بالینی

### Schema / Migration
```prisma
model TriageRuleSet {
  id        String @id @default(uuid()) @db.Uuid
  version   String
  contentEnc Bytes @map("content_enc")
  approvedBy String @map("approved_by") @db.Uuid
  approvedAt DateTime @map("approved_at") @db.Timestamptz
  @@map("triage_rule_sets")
}
model SecondOpinionCase {
  id        String @id @default(uuid()) @db.Uuid
  patientId String @map("patient_id") @db.Uuid
  specialty String
  anonymousKey String @map("anonymous_key")
  state     String
  slaHours  Int    @map("sla_hours")
  @@map("second_opinion_cases")
}
```

### API Contract
`POST /triage/assess` (غیرتشخیصی،.redirect به ۱۱۵) · `GET /triage/ruleset/active` · `POST /second-opinions` · `GET /second-opinions/:id` · `POST /second-opinions/:id/award`.

### UI
فرم علائم با هشدارهای توضیحپذیر + منبع/نسخهٔrule، دکمهٔ اورژانس ۱۱۵، بازار نظر دوم با تخصص/قیمت/SLA و ناشناسسازی.

### تستها
unit: نسخهٔrule و توضیحپذیری؛ integration: escrow آزادسازی بعد از تحویل؛ clinical review: ثبت مصوبه؛ security: عدم جایگزینی پزشک در متنها.

---

## M11 — عملیات خودمختار

**Flag:** `FF_M11_AUTO_OPS` · **تخمین:** 5–7 روز

### Schema / Migration
```prisma
model SloBudget {
  service   String @id
  objective Float
  burnRate  Float  @map("burn_rate")
  window    String
  @@map("slo_budgets")
}
model ChaosDrill {
  id        String @id @default(uuid()) @db.Uuid
  target    String
  at        DateTime @map("at") @db.Timestamptz
  result    String
  @@map("chaos_drills")
}
```

### API Contract
`GET /admin/slo` · `GET /admin/chaos` · `POST /admin/chaos/:target` · `GET /health/synthetic` · `POST /admin/runbooks/:name/run`.

### UI
داشبورد SLO با error budget و نوار مصرف، نتایج chaos drill، دکمهٔ اجرای runbook، synthetic check زنده.

### تستها
unit: محاسبهٔ burn rate؛ integration: auto-rollback هنگام نقض SLO؛ ops: restore drill و هشدار تستشده.

---

## M12 — تست و کیفیت مستمر

**Flag:** `FF_M12_QUALITY` · **تخمین:** 5–7 روز

### وضعیت فعلی و شکاف
۵۴۵ تست API + ۱۶۹ تست Web سبزاند؛ ولی property/fuzz/mutation، contract test، visual regression ۱۵ تم، axe و SBOM نیستند و `sse.test.ts` گاهی flaky است.

### اقدامات
| اقدام | ابزار | خروجی |
| --- | --- | --- |
| property/fuzz | fast-check | policyها تحت ۱۰۰۰ ورودی تصادفی |
| mutation | Stryker | نرخ mutation ≥ ۸۰٪ برای policyها |
| contract | OpenAPI/Pact | انحراف صفر |
| visual regression | Playwright screenshots | ۱۵ تم |
| a11y | axe-core | صفر خطای بحرانی |
| security | SAST/DAST/SCA/SBOM | CI gate |
| flaky quarantine | script | آمار بهجای حذف تست |

### تستها
خود تستها همان ابزارهای بالااند؛ gate جدید: `pnpm quality:all`.

### مراحل
۱) fast-check ۲) stryker ۳) contract ۴) visual+a11y ۵) SBOM ۶) quarantine.
