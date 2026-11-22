# M6 — خط لوله امن فایل

ماژول مستقلی برای پذیرش ایمن پیوستها در `apps/api/src/storage` است. این ماژول فقط توابع/کلاسها را فراهم میکند؛ **اتصال آن به `StorageService` و کنترلر توسط تیم مرکزی انجام میشود**.

## فایلها

| فایل | نقش |
| --- | --- |
| `file-analysis.ts` | توابع خالص و قطعی تحلیل بایت (startsWith, containsAscii, isUtf8, isSafePlainText, …) |
| `file-security.ts` | جدول جادو بایت، تصمیم پذیرش، ماشین وضعیت قرنطینه، لاگ عاری از PHI |
| `scan-provider.ts` | رابط `ScanProvider` + پیادهسازی memory/noop/deny-all و ClamAV |

## اصول امنیتی

1. **لیست مجاز بر اساس محتوا، نه ادعای کلاینت.** `sniffMagicBytes()` نوع واقعی فایل را از بایت تشخیص میدهد (PDF, PNG, JPEG, GIF, WEBP, TIFF, DICOM, DOCX/XLSX, DOC legacy, متن ساده). MIME ارسالشده توسط کلاینت هرگز نمیتواند فایلی را مجاز کند؛ تنها در صورت ناسازگاری باعث رد میشود (`MIME_MISMATCH`).
2. **محتوای فعال رد میشود.** SVG/HTML/Script قبل از تبدیل به `text/plain` شناسایی و با `ACTIVE_CONTENT` رد میشوند (جلوگیری از XSS). PDF علاوه بر `%PDF-` باید `%%EOF` هم داشته باشد. DOCX/XLSX علاوه بر امضای ZIP باید `[Content_Types].xml` و بهترتیب `word/` یا `xl/` داشته باشند.
3. **سقف حجم.** پیشفرض ۲۰ مگابایت (`MAX_FILE_BYTES`)، قابل تنظیم در `analyzeFile({ maxBytes })`.
4. **هیچ سرویسدهی قبل از تأیید.** وضعیتها: `PENDING → SCANNING → APPROVED | REJECTED`. تنها `APPROVED` قابل ارائه است؛ `assertServable()` قبل از صدور لینک دانلود فراخوانی میشود. خطای اسکن (`ERROR`) مانند آلودگی منجر به `REJECTED` میشود (fail-closed).
5. **لاگ عاری از PHI.** فقط `objectKey` server-generated و پسوند فایل لاگ میشود (`safeLogContext`, `decisionLogContext`). نام فایل — که ممکن است حاوی نام بیمار باشد — هرگز وارد لاگ نمیشود. امضای آنتیویروس هم پاکسازی میشود (`sanitizeSignature`).

## اسکنر

`loadScanProviderFromEnv()`:

- توسعه: پیشفرض `NoopScanProvider` (پاک) — قابل تنظیم با `MemoryScanProvider.setVerdict()` در تست.
- production: پیشفرض ClamAV و هر مقدار `SCAN_PROVIDER=none|memory` یا مقدار ناشناخته ⇒ **خطای startup** (fail-closed).
- متغیرها: `SCAN_PROVIDER` (`clamav`|`memory`|`noop`|`none`|`deny-all`)، `CLAMAV_HOST`، `CLAMAV_PORT` (پیشفرض 3310)، `CLAMAV_TIMEOUT_MS` (پیشفرض 5000).

`ClamAvScanProvider` از پروتکل `zINSTREAM` clamd استفاده میکند و در صورت قطع اتصال، timeout یا پاسخ ناشناخته، نتیجه‌ی `ERROR` برمیگرداند.

## نکته درباره `file-type`

بسته `file-type` در این مخزن تنها بهصورت **وابستگی اختیاری transient** در `@nestjs/common` نصب شده و در `package.json` اعلام نشده است، بنابراین مسیر اصلی تشخیص، جدول جادو بایت داخلی است (قطعی و مستقل از محیط نصب).adapter اختیاری `crossCheckWithFileType()` در صورت دردسترس بودن بسته، آنرا بهعنوان بررسی دوم بهکار میگیرد و در صورت تناقض، نتیجه را رد میکند؛ در تستها loader آن تزریق میشود تا رفتار قطعی بماند.

## یکپارچگی (پیشنهادی برای تیم مرکزی)

1. بعد از آپلود، `analyzeFile()` را با پیشوند محدودی از بایتهای شیء (مثلاً ۶۴ کیلوبایت اول) بهعنوان `bytes` و **اندازه‌ی واقعی از HEAD** بهعنوان `size` فراخوانی کن تا سقف حجم بر اساس طول پیشوند سنجیده نشود.
2. در صورت رد: وضعیت `REJECTED`، لاگ با `decisionLogContext` و حذف شیء.
3. در صورت پذیرش: `PENDING` → `SCANNING` → نتیجه اسکنر → `verdictToEvent` → `transition`.
4. `createDownloadUrl` فقط زمانی فراخوانی شود که `assertServable(state)` موفق باشد.
