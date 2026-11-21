> ⚠️ بخش «۱) استایل‌ها» با [فاز ۱۶](phase-16-frontend-ux.md) منسوخ شد: `tokens.css` و `utilities.css` اکنون از `design/tokens.json` تولید می‌شوند و کلاس‌های `u-*` حذف شدند.

# فاز ۱۵ — جداسازی فایل‌ها (بدون تغییر رفتار)

هدف: فایل‌های بزرگ و درهم به فایل‌های مجزا و پیوندخورده با import تقسیم شوند. منطق و ظاهر عوض نشده است.

## ۱) استایل‌ها (`apps/web/src/styles/`)
`app/globals.css` اکنون فقط نقطه‌ی ورود است و با `@import` این فایل‌ها را به‌ترتیب بارگذاری می‌کند:

| فایل | محتوا |
|---|---|
| `tokens.css` | رنگ، تایپوگرافی، شعاع، منحنی (تیره/روشن) |
| `base.css` | ریست، عناصر پایه، دسترس‌پذیری، چیدمان (`stack/row/grid`) |
| `header.css` | هدر و ناوبری |
| `components.css` | کارت، فرم، دکمه، نشان، تب |
| `scheduling.css` | انتخاب روز و ساعت |
| `pages.css` | آواتار، hero، جستجو، پیام‌ها، اسکلت، مودال، توست، جدول |
| `video-call.css` | ویزیت تصویری (فاز ۷) |
| `utilities.css` | کلاس‌های کمکی جایگزین استایل‌های inline تکراری |
| `motion.css` | کاهش حرکت + انیمیشن `bounce` چت (قبلاً `<style>` داخل صفحه) |
| `print.css` | چاپ نسخه (فاز ۸) |

- بررسی خودکار: مجموعه‌ی قاعده‌های CSS قبل و بعد یکسان است (فقط `@keyframes bounce` جابه‌جا شد).
- ۱۰۶ استایل inline تکراری → ۲۷ کلاس `u-*`. انتخابگر دوتایی `.u-x.u-x` ویژگی را مثل inline از انتخابگرهای ترکیبی قوی‌تر نگه می‌دارد.
- حدود ۱۳۰ استایل inline یکتا/پویا باقی ماندند (باید به‌تدریج به کلاس معنایی تبدیل شوند).

## ۲) کدهای مشترک و کامپوننت‌ها (`apps/web/src`)
| فایل جدید | از کجا آمد |
|---|---|
| `lib/files.ts` | `formatBytes` و سقف ۲۰MB که در چت و پرونده کپی‌شده بود |
| `lib/record-categories.ts` | برچسب/آیکون دسته‌ی پرونده و نوع `RecordSummary` (از `records/page.tsx`) |
| `components/chat/FileMessage.tsx` | از `chat/[id]/page.tsx` |
| `components/payment/InitiateView.tsx` | مرحله‌ی ۱ از `payment/page.tsx` |
| `components/payment/VerifyView.tsx` | مرحله‌ی ۲ از `payment/page.tsx` |
| `components/video/VideoTile.tsx` | از `video/CallRoom.tsx` |

## ۳) صحت‌سنجی انجام‌شده و نشده
- ✅ تجزیه‌ی نحوی (parse) همه‌ی فایل‌های TS/TSX بدون خطا؛ هیچ شناسه‌ی تعریف‌نشده‌ای نیست.
- ❌ `pnpm install / lint / typecheck / test / build` اجرا نشد (محیط ساخت بدون اینترنت بود). پیش از merge اجرا کنید: `pnpm ci:local`.
- ❌ بررسی بصری مرورگر انجام نشد؛ صفحه‌های چت، پرداخت، پرونده و ویزیت را یک‌بار ببینید.

## ۴) پیشنهاد ادامه
شکستن `payment-settlement.ts` (314 خط)، `chat.service.ts` (279 خط) و `chat/[id]/page.tsx` به hook و زیرکامپوننت؛ تبدیل `msg: any` در `FileMessage` به نوع صریح.
