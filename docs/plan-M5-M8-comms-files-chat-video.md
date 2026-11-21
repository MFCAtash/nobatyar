# طرح اجرایی M5–M8 — اعلان، فایل، چت، ویدئو

## M5 — اعلان چندکاناله و مرکز ترجیحات

**Flag:** `FF_M5_NOTIF_ORCHESTRATOR` · **تخمین:** 4–6 روز

### وضعیت فعلی و شکاف
Outbox و worker موجوداند؛ ولی ارکستراتور کانال، ترجیحات دقیق، quiet hours، قالبهای نسخهدار، DLQ dashboard و اسکالیشن تلفنی وجود ندارد.

### Schema / Migration
```prisma
model NotificationPreference {
  userId      String @id @map("user_id") @db.Uuid
  eventType   String @map("event_type")
  channel     String
  enabled     Boolean @default(true)
  quietFrom   String? @map("quiet_from")   // "22:00"
  quietTo     String? @map("quiet_to")
  @@id([userId, eventType, channel])
  @@map("notification_preferences")
}
model NotificationTemplate {
  key       String @id
  version   Int
  channels  String // JSON
  bodyFa    String @map("body_fa")
  abGroup   String? @map("ab_group")
  @@map("notification_templates")
}
model DeadLetterNotice {
  id        String @id @default(uuid()) @db.Uuid
  jobId     String @map("job_id")
  reason    String
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  @@map("dead_letter_notices")
}
```

### API Contract
`GET|PUT /me/notification-preferences` · `GET /admin/notification-templates` · `POST /admin/notification-templates/:key/activate` · `GET /admin/dead-letters` · `POST /admin/dead-letters/:id/retry`.

### UI
صفحهٔ «اعلانها»: جدول رویداد × کانال با سوئیچ، ساعات سکوت، لینک deep-link به نوبت؛ ادمین: dead-letter dashboard با دکمهٔ retry.

### تستها
unit: انتخاب کانال و quiet hours؛ integration: worker با provider جعلی، DLQ پر شود؛ E2E: یادآوری ۲۴ ساعته؛ security: بدون شماره/PHI در لاگ اعلان.

---

## M6 — خط لولهٔ فایل هوشمند

**Flag:** `FF_M6_SMART_FILES` · **تخمین:** 6–8 روز

### وضعیت فعلی و شکاف
Pipeline امن پایه موجود است؛ ولی resumable upload، multi-AV، DLP/PHI detection، auto-redaction، OCR و dedupe نیست.

### Schema / Migration
```prisma
model FileAnalysis {
  id          String @id @default(uuid()) @db.Uuid
  objectKey   String @map("object_key")
  sha256      String
  mime        String
  scanning    String // QUEUED|SCANNING|APPROVED|REJECTED
  phiFlags    String? @map("phi_flags")
  ocrTextKey  String? @map("ocr_text_key")
  redactedKey String? @map("redacted_key")
  @@map("file_analyses")
}
```

### API Contract
`POST /files/upload-intent` (با `chunked=true`) · `PUT /upload/:id/chunk/:n` (signed) · `POST /files/:id/complete` · `GET /files/:id/analysis` · `GET /files/:id/preview` (signed, watermarked).

### UI
Dropzone با نوار پیشروی آپلود، نماینده وضعیت اسکن («در بررسی امنیتی»)، پیشنمایش با watermark، دکمهٔ «حذف چهره/نام» قبل از پیوست به پرونده.

### تستها
unit: magic bytes vs extension، محاسبهٔ sha256؛ integration: quarantine تا scan؛ security: MIME spoofing، فایل حجیم، path traversal، expired URL، PHI detection.

---

## M7 — چت بالینی همیار

**Flag:** `FF_M7_CHAT_ASSIST` · **تخمین:** 5–7 روز

### وضعیت فعلی و شکاف
چت رمزنگاری و RLS موجود است؛ ولی **تست E2E چت بلادرنگ قرمز است** (پیام در DB ثبت نمیشود) — این مورد قبل از هر چیز باید رفع شود. سپس پاسخ سریع، ترجمه، خلاصه و اسکالیشن اضافه میشود.

### Schema / Migration
```prisma
model ChatQuickReply {
  id       String @id @default(uuid()) @db.Uuid
  doctorId String @map("doctor_id") @db.Uuid
  textFa   String @map("text_fa")
  @@map("chat_quick_replies")
}
model ConversationSummary {
  conversationId String @id @map("conversation_id") @db.Uuid
  bodyEnc        Bytes  @map("body_enc")
  consentId      String @map("consent_id") @db.Uuid
  @@map("conversation_summaries")
}
```

### API Contract
`GET /me/quick-replies` · `POST /conversations/:id/summarize` · `POST /conversations/:id/escalate` (به video/appointment) · `POST /conversations/:id/translate`.

### UI
پنل چت: دکمههای پاسخ سریع، ترجمهٔ درونخطی، دکمهٔ «خلاصه با رضایت»، «تبدیل به تماس تصویری»، وضعیت ارسال/خطا.

### تستها
**بحرانی:** رفع تست چت بلادرنگ (بررسی outlet SSE و transaction)؛ unit: consent سازی خلاصه؛ integration: دسترسی بعد از بازه 403؛ security: IDOR، spam rate limit، PHI در log.

---

## M8 — ویدئو و ویزیت هوشمند

**Flag:** `FF_M8_VIDEO_SMART` · **تخمین:** 5–7 روز

### Schema / Migration
```prisma
model VideoRoomPolicy {
  appointmentId String @id @map("appointment_id") @db.Uuid
  waitingRoom   Boolean @default(true) @map("waiting_room")
  allowScreenShare Boolean @default(false) @map("allow_screen_share")
  recordConsent  Boolean @default(false) @map("record_consent")
  retentionHours Int?   @map("retention_hours")
  @@map("video_room_policies")
}
```

### API Contract
`GET /appointments/:id/video/policy` · `POST /appointments/:id/video/token` · `POST /appointments/:id/video/end` · `POST /appointments/:id/video/consent`.

### UI
صفحهٔ انتظار مجازی، precheck دوربین/میکروفون، نوار کیفیت اتصال، دکمهٔ ضبط با dual-consent، خوانندهٔ زنده.

### تستها
unit: token scope و انقضا؛ integration: اتاق اشتباه 403؛ E2E: join پزشک و بیمار؛ ops: آمار join failure و reconnect.
