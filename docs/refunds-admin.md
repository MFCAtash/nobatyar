# استرداد وجه واقعی و پنل مالی ادمین

## مدل
هر `Refund` (بدهی به بیمار) پس از ثبت (لغو نوبت، پرداخت دیرهنگام، پرداخت تکراری) **منتظر اجرای ادمین** می‌ماند — پیش‌فرض عمداً «خودکار نیست» (حرکت پول).

```
PENDING ──execute──▶ PROCESSING ──┬─ درگاه پذیرفت ───────▶ PROCESSED (نهایی)
FAILED  ──execute──▶              ├─ درگاه صریحاً رد کرد ─▶ FAILED   (پولی جابه‌جا نشد؛ قابل اجرای مجدد)
MANUAL  ──execute──▶              ├─ API/توکن/حداقل مبلغ ندارد ▶ MANUAL (ادمین از پنل درگاه انجام می‌دهد)
                                  └─ مبهم (timeout/۵xx/نامفهوم) ▶ REVIEW  (تکرار خودکار ممنوع)
PENDING/FAILED/MANUAL/REVIEW ──mark-processed(مرجع)──▶ PROCESSED
REVIEW ──mark-not-refunded(توضیح)──▶ FAILED
PROCESSING > ۱۰ دقیقه ──▶ REVIEW (crash بین پاسخ درگاه و ثبت)
```
- **claim اتمیک** (`updateMany` شرطی): دو ادمین/دو درخواست هم‌زمان هرگز دو بار به درگاه نمی‌روند.
- **چرا REVIEW و نه retry؟** API ی AddRefund زرین‌پال idempotency key ندارد؛ پس از timeout ممکن است ثبت شده باشد و تکرار = استرداد دوباره.
- **تریگر DB** (`phase13-refunds.sql`): مجموع استردادهای غیر-FAILED هر تلاش/پرداخت ≤ مبلغ دریافتی؛ ستون‌های هویتی ثابت؛ PROCESSED نهایی؛ بدون DELETE.
- پرداخت تکراری به «همان تلاشِ تکراری» (`attempt_id`) استرداد می‌شود، نه تلاش اصلی.
- `Payment.status = REFUNDED/PARTIALLY_REFUNDED` یعنی «تعهد استرداد ثبت شد»؛ **حرکت واقعی پول فقط با `Refund.status = PROCESSED`** تأیید می‌شود.

## درگاه‌ها
| درگاه | استرداد |
|---|---|
| زرین‌پال | GraphQL `AddRefund` (مستندات رسمی: `session_id`, `amount`, `method` PAYA/CARD, `reason`). نیازمند `ZARINPAL_ACCESS_TOKEN` (جدا از merchant id). حداقل ۲۰٬۰۰۰ ریال. |
| Zibal / IDPay | API ی استرداد پیاده نشده ⇒ همیشه `MANUAL` (پنل درگاه + ثبت مرجع) |
| sandbox | استرداد جعلی (فقط dev/test) |

متغیرها: `ZARINPAL_ACCESS_TOKEN`، `ZARINPAL_REFUND_METHOD=PAYA|CARD` (پیش‌فرض PAYA)، `ZARINPAL_GRAPHQL_URL` (اختیاری، https).

⚠️ **دو فرض تأییدنشده** (پیش از production در sandbox/پنل زرین‌پال بسنجید): ۱) `session_id` برابر بخش عددی `authority` است (`A000…123456 ⇒ 123456`)؛ ۲) نشانی GraphQL پیش‌فرض `https://next.zarinpal.com/api/v4/graphql/`. اگر نادرست باشند، نتیجه «رد» یا `MANUAL` است نه استرداد اشتباه.

## API (فقط ADMIN؛ داده‌ی مالی بدون داده‌ی سلامت)
`GET /admin/refunds?status=` · `POST /admin/refunds/:id/execute` · `/mark-processed {reference,note?}` · `/mark-not-refunded {note}` · `GET /admin/payments?attention=true` · `GET /admin/finance/summary`
هر اقدام در Audit: `refund.execute_started | processed | rejected | needs_manual | needs_review | marked_processed | review_not_refunded`. بیمار با اعلان «بازپرداخت ثبت شد» مطلع می‌شود. UI: `/admin/refunds`، `/admin/payments`.

## محدودیت‌های شناخته‌شده
- اجرای خودکار (job) عمداً نیست؛ تأیید دو نفره (four-eyes) برای مبالغ بالا هنوز نیست.
- پیگیری وضعیت نهایی استرداد نزد زرین‌پال (PENDING→SUCCESS) و webhook پیاده نشده؛ `PROCESSED` یعنی «نزد درگاه ثبت شد».

## تأیید دو نفره (Maker/Checker) — فاز ۱۷
هیچ ادمینی به‌تنهایی پول را جابه‌جا نمی‌کند (پیش‌فرض روشن؛ `REFUND_DUAL_APPROVAL`، آستانه‌ی `REFUND_DUAL_APPROVAL_MIN_RIAL`).

```
Maker(الف): request-approval {action: EXECUTE | MARK_PROCESSED(+reference)}  ⇒ approval=REQUESTED
Checker(ب≠الف): approval/approve | approval/reject(دلیل)                      ⇒ APPROVED | REJECTED
هر ادمین: execute  یا  mark-processed(با «همان» مرجع)                            ⇒ تأیید «مصرف» می‌شود (approval=NONE)
```
- تأیید **یک‌بارمصرف** و **مخصوص یک اقدام** است؛ حتی پس از نتیجه‌ی ناموفق، تلاش بعدی تأیید تازه می‌خواهد.
- `checker ≠ maker` در کد و با `CHECK` ی DB (`phase17-backend.sql`) اجبار می‌شود.
- در audit: `refund.approval_requested/approved/rejected` و در `refund.execute_started` شناسه‌ی maker و checker ثبت می‌شود.
- همه‌ی POST های مالی `Idempotency-Key` می‌خواهند (کلیک دوباره ⇒ همان پاسخ).
- نیاز عملیاتی: حداقل **۲ ادمین فعال**. هشدار `RefundApprovalWaiting` اگر درخواستی > ۱ ساعت منتظر بماند.
