# ۸. ریسک‌ها و شاخص‌های بتا

| ریسک | شدت | اقدام کاهشی | مالک پیشنهادی |
|---|---|---|---|
| ناسازگاری schema/auth | بحرانی | migration و Gate فاز ۵.۵ | Backend |
| تست قدیمی token | بالا | اصلاح قرارداد و regression | Backend/QA |
| ادمین بدون UI MFA | بالا | UI MFA و E2E | Frontend/Backend |
| سیاست ورود متناقض | بالا | ADR و یکسان‌سازی | Product |
| callback/refund نامطمئن | بحرانی | sandbox، idempotency، reconciliation | Backend/Finance |
| notifier از نوع Noop | بالا | Outbox worker و تست provider | Backend/Ops |
| فایل پزشک ناامن/ناقص | بحرانی | private storage، scan، signed URL | Backend/Security |
| چت/IDOR | بحرانی | policy مشترک و تست منفی | Security/QA |
| backup/key recovery ناقص | بحرانی | KMS، backup و restore drill | Ops |
| triage گمراه‌کننده | بحرانی | بازبینی بالینی و red flags | Clinical/Product |
| scope بیش از حد | بالا | اولویت هسته و feature freeze | Product |

## شاخص‌ها
- نرخ تکمیل رزرو؛ نرخ خطای پرداخت؛ زمان نتیجه پرداخت.
- درصد callbackهای تکراری مدیریت‌شده به‌صورت idempotent.
- تحویل پیامک و سن قدیمی‌ترین job.
- زمان اسکن فایل و نرخ شکست آن.
- نرخ موفقیت ورود به ویدئو.
- خطاهای دسترسی غیرمجاز.
- رضایت بیمار/پزشک، زمان پاسخ پشتیبانی و باگ‌های Critical/High باز.
شاخص‌ها تجمیعی باشند و محتوای سلامت/چت جمع‌آوری نشود.

## Go/No-go بتا
**No-go:** build/test قرمز، migration غیرقابل تکرار، MFA/access tests ناقص، پرداخت/refund مبهم، restore تمرین‌نشده، داده سلامت در log، باگ امنیتی بحرانی یا نبود consent/privacy/support.
**Go مشروط:** همه Gateها سبز، باگ متوسط دارای مالک/موعد، cohort محدود، rollback آماده و تصمیم ادامه/توقف زمان‌بندی‌شده.
