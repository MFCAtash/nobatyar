# نمودار ER (نسخه‌ی مفهومی — مبنای اسکیمای Prisma در فاز ۱)

```mermaid
erDiagram
  USER ||--o| PATIENT_PROFILE : has
  USER ||--o| DOCTOR_PROFILE : has
  USER ||--o{ SESSION : owns
  USER ||--o{ CONSENT : gives
  USER ||--o{ AUDIT_LOG : acts

  DOCTOR_PROFILE }o--o{ SPECIALTY : practices
  DOCTOR_PROFILE ||--o{ AVAILABILITY_RULE : defines
  DOCTOR_PROFILE ||--o{ TIME_OFF : blocks
  DOCTOR_PROFILE ||--o{ APPOINTMENT : receives
  DOCTOR_PROFILE ||--o{ DOCTOR_VERIFICATION : verified_by

  PATIENT_PROFILE ||--o{ APPOINTMENT : books
  PATIENT_PROFILE ||--o{ HEALTH_RECORD : owns
  PATIENT_PROFILE ||--o{ TRIAGE_SESSION : runs

  APPOINTMENT ||--o{ APPOINTMENT_STATUS_HISTORY : logs
  APPOINTMENT ||--o| PAYMENT : paid_by
  APPOINTMENT ||--o| CONVERSATION : has
  APPOINTMENT ||--o| VIDEO_ROOM : has
  APPOINTMENT ||--o{ SECOND_OPINION : may_trigger

  HEALTH_RECORD ||--o{ RECORD_ATTACHMENT : contains
  HEALTH_RECORD ||--o{ RECORD_SHARE : shared_via
  DOCTOR_PROFILE ||--o{ RECORD_SHARE : receives

  CONVERSATION ||--o{ MESSAGE : contains
  PAYMENT ||--o{ REFUND : may_have

  USER { uuid id PK
    string phone_hash UK
    string role
    timestamptz created_at }
  APPOINTMENT { uuid id PK
    uuid doctor_id FK
    uuid patient_id FK
    timestamptz starts_at
    timestamptz ends_at
    string status
    string kind "in_person|video|chat"
    bytes reason_enc "HEALTH, encrypted" }
  HEALTH_RECORD { uuid id PK
    uuid patient_id FK
    bytes content_enc "HEALTH, encrypted (key id embedded)" }
  PAYMENT { uuid id PK
    uuid appointment_id FK
    string gateway_ref UK
    string idempotency_key UK
    bigint amount_rial
    string status }
  AUDIT_LOG { bigint id PK
    uuid actor_id
    string action
    string object_type
    uuid object_id
    string prev_hash
    string hash
    timestamptz at }
```

## یادداشت‌های طراحی
- `USER` پایه + پروفایل‌های جدا (بیمار/پزشک)؛ نقش در `USER.role`.
- `RECORD_SHARE` تنها مسیر دسترسی پزشک به پرونده‌ی بیمار غیر از نوبت فعال است (رضایت‌محور).
- جدول‌های HEALTH با ستون‌های `*_enc`؛ شناسه‌ی کلید داخل بلاب است (چرخش کلید بدون ستون جدا).
- مبلغ‌ها به ریال و `bigint`؛ زمان‌ها `timestamptz` به UTC.
- `AUDIT_LOG` فقط INSERT (REVOKE UPDATE/DELETE) و زنجیره‌ی هش.
