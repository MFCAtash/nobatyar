# طرح اجرایی M1–M4 — هویت، ماشین وضعیت، رزرو، پرداخت

## M1 — هویت مقاوم در برابر فیشینگ

**Flag:** `FF_M1_PASSKEY_FIRST` · **وابستگی:** Foundations · **تخمین:** 5–7 روز

### وضعیت فعلی و شکاف
Passkey/WebAuthn و MFA/TOTP پیادهاند، ولی ورود پیشفرض هنوز OTP-based است؛ نشستها قابل مشاهدهٔ کاربر نیستند؛ نمایندگی خانوادگی و break-glass دو نفره وجود ندارد.

### Schema / Migration
```prisma
model TrustedDevice {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @map("user_id") @db.Uuid
  label       String
  credentialId String  @unique @map("credential_id")
  lastSeenAt  DateTime @map("last_seen_at") @db.Timestamptz
  riskScore   Int      @default(0) @map("risk_score")
  user        User     @relation(fields: [userId], references: [id])
  @@index([userId])
  @@map("trusted_devices")
}
model DelegatedAccess {
  id          String   @id @default(uuid()) @db.Uuid
  grantorId   String   @map("grantor_id") @db.Uuid
  granteeId   String   @map("grantee_id") @db.Uuid
  scope       String   // JSON: ["appointments:read","records:lab"]
  expiresAt   DateTime @map("expires_at") @db.Timestamptz
  revokedAt   DateTime? @map("revoked_at") @db.Timestamptz
  consentId   String   @map("consent_id") @db.Uuid
  @@map("delegated_access")
}
model ConsentReceipt {
  id        String  @id @default(uuid()) @db.Uuid
  userId    String  @map("user_id") @db.Uuid
  policy    String
  version   String
  at        DateTime @default(now()) @db.Timestamptz
  channel   String
  hash      String
  @@map("consent_receipts")
}
```
RLS: دسترسی به `TrustedDevice` فقط صاحب دستگاه؛ `DelegatedAccess` فقط طرفین؛ `ConsentReceipt` فقط صاحب + ادمین audit.

### API Contract
| Method | Path | توضیح | خطاها |
| --- | --- | --- | --- |
| POST | `/auth/passkey/options` | شروع ورود passkey | 400 |
| POST | `/auth/passkey/verify` | تأیید assertion و صدور session | 401 |
| GET | `/me/sessions` | لیست نشستها + device | 401 |
| DELETE | `/me/sessions/:id` | بستن یک نشست | 404 |
| POST | `/me/delegations` | اعطای نمایندگی | 403 without consent |
| DELETE | `/me/delegations/:id` | لغو فوری | 404 |
| GET | `/me/consent-receipts` | تاریخچهٔ رضایت | 401 |

### UI
صفحهٔ «امنیت حساب»: لیست دستگاهها با گزینهٔ «خروج از همه»، دکمهٔ «افزودن Passkey»، کارت نمایندگیها با اسکوپ و تاریخ انقضا، نمایش consent receipts.

### تستها
- unit: risk scoring، scope parsing، replay prevention.
- integration: بستن نشست قدیمی بلافاصله توکن را باطل کند؛ نمایندگی منقضی 403.
- E2E: ورود passkey → step-up MFA → مشاهدهٔsession → بستن remote.
- security: فیشینگ simulation، device clone، delegation escalation.

### مراحل
۱) schema+RLS ۲) service+controller ۳) UI ۴) feature flag ۵) tests ۶) docs + review دوم.

---

## M2 — ماشین وضعیت Policy-as-Code

**Flag:** `FF_M2_STATE_POLICY` · **وابستگی:** Foundations · **تخمین:** 4–6 روز

### وضعیت فعلی و شکاف
State machine در backend و shared وجود دارد، ولی_policyها در کد پراکندهاند؛ نمودار بصری و شبیهساز انتقال و جبران خطا نداریم.

### Schema / Migration
```prisma
model TransitionPolicy {
  id          String  @id @default(uuid()) @db.Uuid
  aggregate   String  // APPOINTMENT | PAYMENT
  fromState   String  @map("from_state")
  toState     String  @map("to_state")
  roles       String  // JSON: ["PATIENT","DOCTOR","SYSTEM"]
  guard       String  // expression id
  compensation String? @map("compensation")
  slaMinutes  Int?    @map("sla_minutes")
  version     Int
  @@unique([aggregate, fromState, toState, version])
  @@map("transition_policies")
}
```

### API Contract
| Method | Path | توضیح |
| --- | --- | --- |
| GET | `/admin/policies?aggregate=APPOINTMENT` | لیست قواعد نسخهدار |
| POST | `/admin/policies/simulate` | شبیهسازی انتقال با payload |
| POST | `/admin/policies/:id/activate` | فعالسازی نسخه |

### UI
صفحهٔ ادمین «ماشین وضعیت»: گراف Mermaid زنده، کلیک روی یال ← نقش مجاز، guard، جبران، SLA؛ دکمهٔ «شبیهسازی» با نتیجهٔ step-by-step.

### تستها
unit: ارزیابی guardها و تشخیص انتقالهای غیرمجاز؛ property test:همهٔ transitions دارای compensation یا terminalاند؛ integration: Network partition شبیهسازی شده و جبران اجرا شود؛ E2E: لغو بعد از پرداخت → refund خودکار.

### مراحل
۱) policy DSL در shared ۲) migration ۳) admin API ۴) گراف بصری ۵) simulator ۶) tests.

---

## M3 — رزرو هوشمند

**Flag:** `FF_M3_SMART_BOOKING` · **وابستگی:** M1, M2 · **تخمین:** 6–8 روز

### Schema / Migration
```prisma
model BookingPreference {
  userId     String @id @map("user_id") @db.Uuid
  weekdays   String // JSON [0..6]
  timeBands  String // JSON [["09:00","12:00"]]
  maxDistanceKm Int? @map("max_distance_km")
  accessibilityNeeds String? @map("accessibility_needs")
  @@map("booking_preferences")
}
model RecurringBooking {
  id         String @id @default(uuid()) @db.Uuid
  patientId  String @map("patient_id") @db.Uuid
  doctorId   String @map("doctor_id") @db.Uuid
  rrule      String
  nextAt     DateTime @map("next_at") @db.Timestamptz
  @@map("recurring_bookings")
}
model CalendarLink {
  id        String @id @default(uuid()) @db.Uuid
  userId    String @map("user_id") @db.Uuid
  provider  String
  tokenEnc  Bytes  @map("token_enc")
  @@map("calendar_links")
}
```

### API Contract
`GET /doctors/:id/slots?ranked=true&preferences=true` → `{ slots, score, reason }` · `POST /appointments/recurring` · `GET /me/recurring` · `DELETE /me/recurring/:id` · `POST /me/calendar/link` · `GET /me/calendar/events`.

### UI
کارت «بهترین نوبتهای پیشنهادی» با امتیاز و دلیل («نزدیکتر، احتمال تأخیر کمتر، مناسب دسترسپذیری»)؛ فرم رزرو Periodic؛ دکمهٔ «افزودن به تقویم من».

### تستها
unit: ranking function (قابل توضیح و بدون PHI)؛ integration: رزرو گروهی atomic؛ E2E: رزرو دورهای + لغو گروهی؛ security:external calendar scope محدود.

### مراحل
۱) preferences schema ۲) ranking service ۳) recurring engine ۴) calendar sync ۵) UI ۶) tests.

---

## M4 — پرداخت و مالی خودمختار

**Flag:** `FF_M4_FINANCE_AUTO` · **وابستگی:** M2 · **تخمین:** 6–8 روز

### Schema / Migration
```prisma
model PaymentRoute {
  gateway   String @id
  priority  Int
  successRate Int @map("success_rate")
  feeBps    Int  @map("fee_bps")
  enabled   Boolean @default(true)
  @@map("payment_routes")
}
model CancellationRule {
  id        String @id @default(uuid()) @db.Uuid
  hoursBefore Int @map("hours_before")
  refundPct Int   @map("refund_pct")
  appliesTo String // status list
  @@map("cancellation_rules")
}
model DisputeCase {
  id        String @id @default(uuid()) @db.Uuid
  paymentId String @map("payment_id") @db.Uuid
  dueAt     DateTime @map("due_at") @db.Timestamptz
  state     String
  evidenceKey String? @map("evidence_key")
  @@map("dispute_cases")
}
```

### API Contract
`POST /payments/intent` (با `preferredGateway`) · `GET /admin/reconciliation?from&to` · `POST /admin/disputes/:id/evidence` · `GET /me/refund-sla` · `GET /admin/payment-routes`.

### UI
داشبورد مالی ادمین: تفاوتهای reconciliation، نرخ موفقیت درگاه، جدول قواعد لغو (ویرایشپذیر باجدول policy)، 페이지 disputes با مهلت و شواهد.

### تستها
unit: محاسبهٔ refund از_rule table (نه magic number)؛ integration: callback تکراری + مسیریاب؛ E2E: پرداخت → لغو → refund طبق rule؛ security: بدون secret/کارت در log.

### مراحل
۱) route+rule schema ۲) router ۳) reconciliation dashboard ۴) dispute flow ۵) UI ۶) tests.
