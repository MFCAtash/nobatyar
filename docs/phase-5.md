# فاز ۵ — پرداخت، اعلان‌ها، اعضای خانواده، مقایسه پزشکان

## وضعیت
فاز ۴ تحویل شده؛ این بسته **فاز ۵** است.
بعدی: فاز ۶ پیام‌رسانی و فایل، ۷ ویزیت ویدئو، ۸ triage/پرونده سلامت، ۹ سخت‌سازی، ۱۰ بتا.

---

## آنچه ساخته شد

### ۱. پرداخت (درگاه زرین‌پال)
| فایل | توضیح |
|------|-------|
| `apps/api/src/payment/payment.service.ts`    | initiate، verify، getStatus با idempotency |
| `apps/api/src/payment/payment.controller.ts` | `POST /payments/initiate`, `POST /payments/verify`, `GET /payments/:appointmentId` |
| `apps/web/src/app/payment/page.tsx`          | صفحه ۲ مرحله‌ای: شروع + تأیید callback |

**جریان:**
```
بیمار → POST /payments/initiate → دریافت paymentUrl → ریدایرکت به درگاه
درگاه → redirect به /payment?step=verify&Authority=...&Status=OK
کلاینت → POST /payments/verify → PAID + نوبت PENDING_CONFIRMATION
```

**امنیت:**
- `callbackUrl` در برابر `ALLOWED_CALLBACK_ORIGINS` اعتبارسنجی می‌شود (open-redirect)
- اطلاعات کارت هرگز از سرور ما عبور نمی‌کند
- idempotency key جلوی double-charge را می‌گیرد
- فاز ۶: تأیید واقعی از API زرین‌پال با authority + amount

---

### ۲. اعلان‌ها (SSE + DB)
| فایل | توضیح |
|------|-------|
| `apps/api/src/notifications/notification.service.ts` | push, list, markRead, markAllRead |
| `apps/api/src/notifications/notification.controller.ts` | SSE `/notifications/stream`، CRUD |
| `apps/web/src/lib/use-notifications.ts` | hook با SSE + polling fallback |
| `apps/web/src/app/notifications/page.tsx` | صفحه مرکز اعلان‌ها |
| `apps/web/src/components/Header.tsx` | bell icon با badge شمارنده خوانده‌نشده |

**انواع اعلان:** `APPOINTMENT_REMINDER`, `APPOINTMENT_CONFIRMED`, `APPOINTMENT_CANCELLED`,
`PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `SECOND_OPINION_READY`, `SYSTEM`

**معماری SSE:**
- هر کاربر یک `Subject<object>` در حافظه (Map)
- کلاینت با `EventSource` به `/api/v1/notifications/stream` متصل می‌شود
- disconnect خودکار Subject را پاک می‌کند
- فاز ۷: جایگزینی با Redis Pub/Sub برای multi-instance

---

### ۳. اعضای خانواده
| فایل | توضیح |
|------|-------|
| `apps/api/src/family/family.service.ts`    | CRUD + AES-256 کد ملی |
| `apps/api/src/family/family.controller.ts` | `GET/POST/PATCH/DELETE /me/family` |
| `apps/web/src/app/family/page.tsx`         | مدیریت اعضا با Modal ویرایش |

**امنیت:** کد ملی با `FieldCrypto` + AAD منحصربه‌فرد رمزنگاری می‌شود.
در پاسخ API فقط ۶ رقم اول ماسک می‌شود.

---

### ۴. مقایسه پزشکان
| فایل | توضیح |
|------|-------|
| `apps/api/src/compare/compare.controller.ts` | `GET /doctors/compare?ids=...` حداکثر ۳ |
| `apps/web/src/app/compare/page.tsx`          | جدول مقایسه کنار هم |
| `apps/web/src/app/page.tsx`                  | چک‌باکس مقایسه روی کارت‌های جستجو + نوار پایین |

---

## Prisma Schema — مدل‌های جدید
```prisma
model FamilyMember { ... }  // ownerId, fullName, relation, birthYear, nationalId(enc)
model Notification { ... }  // userId, kind, titleFa, bodyFa, payload, readAt
enum NotificationKind { ... }
```

## متغیرهای محیطی جدید
```env
ALLOWED_CALLBACK_ORIGINS=http://localhost:3001,https://app.nobatyar.ir
ZARINPAL_SANDBOX=true        # false در production
ZARINPAL_MERCHANT_ID=...     # فاز ۶: تأیید واقعی
```

## Migration
```bash
pnpm --filter @nobatyar/api db:migrate  # اعمال FamilyMember + Notification
```

## ⚠️ هنوز پوشش داده نشده
- چت و پیام‌رسانی (فاز ۶)
- ویزیت ویدئو (فاز ۷)
- triage هوشمند (فاز ۸)
- پرونده سلامت + آپلود فایل (فاز ۸)
- نظر دوم پزشکی (فاز ۸)
- تأیید واقعی پرداخت از API زرین‌پال (فاز ۶)
- SSE multi-instance با Redis (فاز ۹)
- SOAP note + نسخه‌نویسی پزشک (فاز ۸)
- نمودار درآمد پزشک (فاز ۸)

## معیار پایان فاز ۵
- [ ] `pnpm build` و `pnpm typecheck` سبز
- [ ] Migration اعمال شده روی DB
- [ ] جریان کامل: رزرو → PENDING_PAYMENT → پرداخت sandbox → CONFIRMED
- [ ] اعلان پرداخت موفق در bell header ظاهر می‌شود (SSE)
- [ ] افزودن/ویرایش/حذف عضو خانواده
- [ ] مقایسه ۲ پزشک از صفحه جستجو
