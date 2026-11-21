# فاز ۲ — احراز هویت، نقش‌ها و تأیید پزشک

## جریان‌ها
**ورود با OTP** (ثبت‌نام و ورود یکی است؛ کاربر جدید = `PATIENT`)
1. `POST /auth/otp/request {phone}` ← همیشه `202` یکسان (بدون افشای معتبر‌بودن شماره)
2. `POST /auth/otp/verify {phone, code}` ← `accessToken` (JWT، ۱۵ دقیقه) در بدنه + `refresh token` در کوکی `HttpOnly; SameSite=Strict; Path=/api/v1/auth`
3. `POST /auth/refresh` (کوکی + هدر `X-Nobatyar-Csrf: 1`) ← چرخش توکن؛ نقش و وضعیت تازه از DB خوانده می‌شود
4. `POST /auth/logout` (همین نشست) و `POST /auth/logout-all` (همه‌ی نشست‌ها، نیازمند توکن)

**پزشک‌شدن**
1. بیمار: `POST /doctors/applications {fullName, medicalCouncilNo, documentKey}` (پروفایل ساخته می‌شود ولی `isListed=false`)
2. ادمین: `GET /admin/doctor-verifications` → `POST /admin/doctor-verifications/:id/approve | reject`
3. پس از تأیید: `isListed=true` و `role=DOCTOR`؛ نقش جدید با اولین refresh در توکن می‌آید.

**پروفایل و رضایت:** `GET /me`، `PATCH /me/profile`، `GET/POST /me/consents`، `POST /me/consents/:type/revoke`. دکوراتور `@RequireConsent('HEALTH_DATA_PROCESSING')` برای مسیرهای فازهای بعد آماده است.

## کنترل‌های امنیتی (نگاشت به مدل تهدید)
| تهدید | کنترل پیاده‌شده |
|---|---|
| T1 سرقت نشست | JWT کوتاه‌مدت؛ refresh مات ۲۵۶ بیتی (فقط هش در DB)؛ کوکی HttpOnly+Strict؛ چرخش در هر refresh؛ **تشخیص استفاده‌ی مجدد ⇒ ابطال کل خانواده**؛ `Cache-Control: no-store` |
| T2 brute-force/SMS-pumping | cooldown هر شماره (۶۰ث)، سقف ساعتی هر شماره و هر IP، سقف روزانه‌ی کل، حداکثر ۵ حدس سپس قفل ۱۵ دقیقه، کد فقط HMAC در Redis، مصرف یک‌بار اتمیک، سقف IP روی verify/refresh |
| T3 جعل پزشک | بدون تأیید ادمین نقش DOCTOR داده نمی‌شود؛ ادمین نمی‌تواند درخواست خودش را تأیید کند؛ تأیید شرطی (دو ادمین هم‌زمان ⇒ یکی موفق) |
| T11 DoS | rate limit چندلایه؛ Audit فقط روی قفل‌شدن (نه هر حدس) چون زنجیره‌ی Audit سریالی است |
| T12 ارتقای دسترسی | پیش‌فرض deny: `JwtAuthGuard` سراسری + `@Public()`؛ `RolesGuard`؛ نقش فقط از JWT امضاشده؛ ورودی‌ها با Zod `strict()` (فیلد اضافه رد می‌شود) |
| CSRF | SameSite=Strict + هدر سفارشی اجباری + بررسی Origin با فهرست مجاز |
| RLS (فاز ۱) | همه‌ی دسترسی‌ها با `withContext({role,userId})`؛ ورود/ثبت‌نام با `SYSTEM` |

## راه‌اندازی
```bash
pnpm --filter @nobatyar/api gen:keys     # حالا JWT_ACCESS_SECRET و OTP_SECRET هم تولید می‌شود
# مقادیر را در .env بگذارید؛ SMS_PROVIDER=console برای توسعه (کد در لاگ سرور چاپ می‌شود)
pnpm infra:up && pnpm --filter @nobatyar/api dev
curl -X POST localhost:3000/api/v1/auth/otp/request -H 'content-type: application/json' -d '{"phone":"09120000001"}'
```
تست‌ها: `pnpm test` (واحد: OTP، سیاست refresh، JWT، CSRF) و `pnpm --filter @nobatyar/api test:int` (جریان کامل e2e روی Postgres؛ Redis در تست با نسخه‌ی حافظه‌ای جایگزین است).

## تصمیم‌ها و محدودیت‌ها
- **تغییر نقش/تعلیق کاربر** تا انقضای access token (≤۱۵ دقیقه) اعمال نمی‌شود؛ refresh فوراً آن را اعمال می‌کند. اگر فوریت لازم است: کوتاه‌کردن TTL یا `tokenVersion` در DB.
- **دو تب هم‌زمان** که با یک refresh توکن بخواهند چرخش کنند، یکی ۴۰۱ می‌گیرد و (به‌خاطر تشخیص reuse) خانواده باطل می‌شود. فرانت باید refresh را سریالی/با قفل بین‌تبی انجام دهد.
- **ادمین فقط با OTP** وارد می‌شود؛ پیشنهاد جدی: احراز دوم (TOTP/WebAuthn) و فهرست IP برای مسیرهای `/admin` پیش از انتشار (فاز ۹).
- **کاوه‌نگار** فقط به‌صورت اولیه نوشته شده؛ پارامترها و قالب را با مستندات فعلی سرویس تأیید کنید و حتماً در محیط staging با شماره‌ی واقعی تست کنید.
- **آپلود مدارک پزشک** هنوز نیست: `documentKey` باید به شیئی در MinIO اشاره کند که کاربر با URL امضاشده آپلود کرده؛ این بخش در فاز ۶ (فایل‌ها) با آپلود امن، محدودیت نوع/اندازه و اسکن ساخته می‌شود. تا آن زمان فقط پیشوند `verification/<userId>/` بررسی می‌شود.
- شماره‌ی موبایل فقط به‌صورت رمزنگاری‌شده + شاخص کور ذخیره می‌شود؛ در پاسخ‌ها ماسک است.
- قانون Semgrep جدید: ممنوعیت `$queryRawUnsafe/$executeRawUnsafe` و هشدار برای لاگ توکن/OTP (`.semgrep/nobatyar.yml`).

## معیار پایان فاز ۲
- [ ] `pnpm test` و `test:int` سبز (به‌ویژه `auth.int.test.ts`)
- [ ] تست دستی با SMS واقعی در staging
- [ ] تصمیم درباره‌ی احراز دوم ادمین
- [ ] بازبینی کد `auth/` و `admin/` توسط نفر دوم
