# فاز ۱۴ — رفع چهار مشکل بحرانی (C1–C4)

## C1 — seed و ادمین اولیه
**مشکل:** `seed.ts` همیشه ادمین/پزشک/بیمار نمونه با شماره‌های ثابت می‌ساخت و runbook آن را برای production دستور می‌داد (و OTP ی ادمین به صاحب واقعیِ آن شماره می‌رفت).
**راه‌حل:**
- `seed.ts`: فقط تخصص‌ها (upsert). کاربران نمونه فقط در غیر production (`SEED_DEMO_USERS=false` برای خاموش‌کردن). در production `SEED_DEMO_USERS=true` ⇒ خطا؛ و اگر کاربر نمونه در DB باشد ⇒ کد خروج ۱.
- `create-admin` (`prisma/create-admin.ts`): ادمین واقعی؛ شماره دو بار و یکسان، شماره‌ی نمونه/ساختگی رد، بدون ارتقای بی‌صدای کاربر موجود (`ADMIN_PROMOTE_EXISTING=true`)، ثبت در Audit، فقط ۴ رقم آخر چاپ می‌شود.
- compose: سرویس `create-admin` با `--profile ops` (کلیدهای رمزنگاری فقط به همین job می‌رسند).
- قواعد خالص و تست‌شده: `src/admin/bootstrap-policy.ts`.
**باقی‌مانده:** MFA ادمین (هنوز نیست)؛ اگر نسخه‌ی قدیمی `seed` روی production اجرا شده، کاربران نمونه را دستی حذف/غیرفعال کنید.

## C2 — چت و RLS
**مشکل:** `ChatService` بدون `withContext` به جداول RLS-اجباری می‌زد ⇒ با نقش app خواندن خالی و درج رد؛ ضمناً `markRead` (UPDATE) برای نقش app اصلاً مجوز نداشت.
**راه‌حل:** همه‌ی دسترسی‌ها در `withContext`؛ `phase14-chat-rls.sql` (سیاست UPDATE فقط برای `read_at`، `GRANT UPDATE (read_at)`، trigger ی `messages_guard`: بقیه‌ی ستون‌ها تغییرناپذیر و `read_at` یک‌بار‌نوشتنی). اصلاحات هم‌جوار: N+1 در لیست مکالمه‌ها ⇒ یک `groupBy`؛ ترتیب صفحه‌بندی روی `id` (هم‌خوان با cursor)؛ اعتبارسنجی cursor؛ مالکیت `objectKey` (`chat/<userId>/…`) و نوع/حجم پیوست از HEAD ی MinIO (نه ادعای کلاینت)؛ `typing`/`read` فقط برای اتاق‌های عضو.
**تست:** `test/chat-rls.int.test.ts` (نیازمند Postgres)، `chat-policy.test.ts`.

## C3 — ذخیره‌ساز در production
**مشکل:** MinIO در compose/env production نبود؛ presigned URL با آدرس داخلی ساخته می‌شد (مرورگر نمی‌رسید)؛ CSP ی وب `connect-src` را به MinIO نمی‌داد؛ CORS ی MinIO تنظیم نبود.
**راه‌حل:** سرویس‌های `minio` + `minio-init` (bucket خصوصی، سیاست حداقلی، کاربر سرویس)، دامنه‌ی `STORAGE_DOMAIN` پشت Caddy (فقط GET/HEAD/PUT/OPTIONS، سقف ۲۱MB، Host دست‌نخورده)، دو کلاینت S3 (داخلی برای HEAD/DELETE، عمومی برای presign)، `loadStorageConfig` ی fail-closed (API در production بدون پیکربندی درست بالا نمی‌آید)، preflight، CSP/Dockerfile (`STORAGE_PUBLIC_URL`)، CORS ی dev، و بررسی `res.ok` در آپلود چت.
**باقی‌مانده:** اسکن بدافزار/magic bytes/quarantine؛ پشتیبان `miniodata`؛ تگ تصویرهای MinIO را با آخرین نسخه‌ی پایدار تطبیق و پین کنید.

## C4 — lockfile و migrations
**مشکل:** `pnpm-lock.yaml` و `prisma/migrations` در مخزن نبود ⇒ job ی docker و `migrate deploy` شکست؛ CI مهاجرت ساختگی (2000…) می‌ساخت.
**راه‌حل:** `scripts/bootstrap-baseline.sh` (یک‌بار: lockfile + init + هر SQL ی `prisma/sql/ORDER` با برچسب واقعی)، `scripts/check-repo-integrity.sh` + job ی CI «Repo integrity» (عضو `ci-gate`): lockfile معتبر، migrations واقعی، و «هر SQL امنیتی دقیقاً یک مهاجرت یکسان»؛ `ci-db-setup.sh` دیگر بی‌صدا نمی‌سازد (فقط با `ALLOW_TEMP_MIGRATIONS=true`، گذرا).
**اقدام شما (غیرقابل‌انجام بدون اینترنت):** `sh scripts/bootstrap-baseline.sh` و commit ی `pnpm-lock.yaml` + `apps/api/prisma/migrations`.
