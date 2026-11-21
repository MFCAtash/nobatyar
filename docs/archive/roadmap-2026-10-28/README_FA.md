# بسته جامع نقشه‌راه و توسعه نوبت‌یار
نسخه 1.0 | تاریخ: ۲۸ اکتبر ۲۰۲۶

این بسته مستندات اجرایی برای رساندن نوبت‌یار از وضعیت موجود به بتای کنترل‌شده و انتشار تدریجی است. موارد گزارش‌شده از تحلیل پروژه از پیشنهادها و موارد نیازمند راستی‌آزمایی جدا شده‌اند.

## نکته مهم وضعیت
- معماری گزارش‌شده: Monorepo با pnpm/Turborepo، `apps/web` با Next.js 14 App Router، `apps/api` با NestJS/Prisma، PostgreSQL 16، Redis، MinIO و `packages/shared`.
- فازهای ۰ تا ۵ در تحلیل مبنا تحویل‌شده گزارش شده‌اند، اما build، تست‌ها و staging واقعی باید در محیط توسعه اجرا و ثبت شوند.
- گام فوری، **فاز ۵.۵: تثبیت احراز هویت** است. کد جدید password/MFA/tokenVersion با schema و تست‌ها ناسازگاری دارد و UI MFA در تحلیل مبنا موجود نبوده است.
- فازهای ۶ تا ۱۰ را عملیاتی فرض نکنید، مگر backend، frontend، تست و staging آن‌ها تأیید شود.
- فایل `reference/nobatyar-phase8-fixed.zip` کپی تغییرنیافته آرشیو ارائه‌شده است؛ این بسته ادعای اصلاح یا build موفق کد را ندارد.
- تحلیل مبنا build/test را اجرا نکرده بود چون وابستگی‌ها نصب نبودند و شبکه در دسترس نبود.

## فایل‌ها
- `docs/01_MASTER_ROADMAP_FA.md`: نقشه‌راه صفر تا انتشار
- `docs/02_ARCHITECTURE_AND_DATA_FLOW_FA.md`: معماری و گردش داده
- `docs/03_BACKLOG_AND_SPRINTS_FA.md`: بک‌لاگ و اسپرینت‌ها
- `docs/04_SECURITY_PRIVACY_CHECKLIST_FA.md`: امنیت و حریم خصوصی
- `docs/05_TESTING_RELEASE_GATES_FA.md`: تست و معیارهای انتشار
- `docs/06_DECISIONS_AND_OPEN_QUESTIONS_FA.md`: ADR و پرسش‌های باز
- `docs/07_OPERATIONS_RUNBOOK_FA.md`: عملیات و استقرار
- `docs/08_RISKS_AND_METRICS_FA.md`: ریسک و KPI
- `docs/09_DEVELOPER_HANDOFF_TEMPLATE_FA.md`: قالب تحویل کار
- `خلاصه_اجرایی_نوبت‌یار.txt`: خلاصه سریع

## ترتیب شروع
۱) baseline و commit مشخص؛ ۲) فاز ۵.۵؛ ۳) CI و staging؛ ۴) فاز ۶ (اعلان، فایل، چت)؛ ۵) ویدئو؛ ۶) پرونده سلامت/triage؛ ۷) سخت‌سازی؛ ۸) بتای بسته.
