# فاز ۶ — چت real-time · آپلود فایل · پرونده سلامت

## وضعیت
فاز ۵ پایه — این بسته **فاز ۶** است.
بعدی: فاز ۷ ویزیت ویدئو (WebRTC/LiveKit) — انجام شد: `docs/phase-7.md` (شامل گزارش بازبینی این فاز)

---

## آنچه ساخته شد

### ۱. Storage Service (MinIO/S3)
| فایل | توضیح |
|------|-------|
| `apps/api/src/storage/storage.service.ts`    | presigned PUT/GET/DELETE/HEAD |
| `apps/api/src/storage/storage.controller.ts` | `POST /storage/upload-token` |

**جریان آپلود امن (browser never touches our server):**
```
client → POST /storage/upload-token { bucket, mime, bytes }
server → presigned PUT URL (5 دقیقه اعتبار)
client → PUT presignedUrl (مستقیم به MinIO)
client → POST /records/:id/attachments { objectKey, fileName, ... }
server → headObject تأیید → ثبت در DB
```

---

### ۲. چت real-time (WebSocket + Socket.IO)
| فایل | توضیح |
|------|-------|
| `apps/api/src/chat/chat.gateway.ts`    | WebSocket Gateway با رویدادهای `send_message`, `read_messages`, `typing` |
| `apps/api/src/chat/chat.service.ts`    | تأیید فایل، رمزنگاری AES-256 متن، cursor pagination |
| `apps/api/src/chat/chat.controller.ts` | `GET /conversations`, `/conversations/:id/messages` |
| `apps/web/src/hooks/use-chat.ts`       | hook کامل با reconnect، typing، read receipt |
| `apps/web/src/app/chat/page.tsx`       | لیست مکالمات با badge خوانده‌نشده |
| `apps/web/src/app/chat/[id]/page.tsx`  | UI چت با bubble، typing indicator، آپلود |

**امنیت:**
- متن پیام با AES-256-GCM رمزنگاری می‌شود (کلید در سرور)
- objectKey پیام فایل پس از ارسال در MinIO HEAD تأیید می‌شود
- تنها اعضای conversation (patient + doctor) می‌توانند پیام بخوانند
- لینک دانلود presigned فقط ۶۰ ثانیه اعتبار دارد

---

### ۳. پرونده سلامت (Health Records)
| فایل | توضیح |
|------|-------|
| `apps/api/src/records/records.service.ts`    | CRUD + AES محتوا + share/revoke |
| `apps/api/src/records/records.controller.ts` | 9 endpoint |
| `apps/web/src/app/records/page.tsx`          | لیست + فیلتر دسته‌بندی + ایجاد |
| `apps/web/src/app/records/[id]/page.tsx`     | جزئیات + آپلود پیوست + اشتراک پزشک |

**مدل اشتراک:**
- بیمار پرونده را با پزشک share می‌کند (با تاریخ انقضا اختیاری)
- پزشک از مسیر `GET /records` پرونده‌های به‌اشتراک‌گذاشته می‌بیند
- بیمار در هر لحظه دسترسی را revoke می‌کند

---

## Schema — تغییرات
```prisma
// Message — اضافه شد:
kind           MessageKind  // TEXT | FILE | IMAGE | SYSTEM
attachmentName String?
attachmentMime String?
attachmentBytes Int?
readAt         DateTime?
editedAt       DateTime?
deletedAt      DateTime?

enum MessageKind { TEXT FILE IMAGE SYSTEM }

// HealthRecord — اضافه شد:
category  RecordCategory  // NOTE | LAB_RESULT | IMAGING | ...
visitDate DateTime?
tags      String[]

// RecordAttachment — اضافه شد:
fileName String

enum RecordCategory { NOTE LAB_RESULT IMAGING PRESCRIPTION DISCHARGE_SUMMARY REFERRAL VACCINATION OTHER }
```

---

## متغیرهای محیطی جدید
```env
# MinIO / S3
MINIO_ENDPOINT=http://minio:9000
MINIO_REGION=us-east-1
MINIO_ACCESS_KEY=nobatyar
MINIO_SECRET_KEY=nobatyar_secret

# WebSocket CORS
WEB_ORIGIN=http://localhost:3001
```

## وابستگی‌های جدید
```
API:  @nestjs/websockets  @nestjs/platform-socket.io  socket.io
      @aws-sdk/client-s3  @aws-sdk/s3-request-presigner
Web:  socket.io-client
```

## راه‌اندازی
```bash
# MinIO از docker-compose در دسترس است
docker compose up minio minio-init -d

# Migration
pnpm --filter @nobatyar/api db:migrate

# Build
pnpm build
```

## معیار پایان فاز ۶
- [ ] دو کاربر می‌توانند پیام real-time رد و بدل کنند
- [ ] فایل در MinIO آپلود و دانلود می‌شود
- [ ] typing indicator نمایش داده می‌شود
- [ ] read receipt (✓✓) کار می‌کند
- [ ] پرونده سلامت ایجاد/ویرایش/حذف می‌شود
- [ ] پیوست به پرونده آپلود می‌شود
- [ ] پرونده با پزشک به اشتراک گذاشته می‌شود
- [ ] pnpm build و pnpm typecheck سبز

## ⚠️ فازهای بعدی
- **فاز ۷** — ویزیت ویدئو WebRTC با LiveKit
- **فاز ۸** — triage هوشمند AI، نظر دوم، SOAP note، نسخه دیجیتال
- **فاز ۹** — Redis pub/sub برای SSE/WS multi-instance، load test
