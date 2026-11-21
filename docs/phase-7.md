# فاز ۷ — ویزیت ویدئویی (WebRTC / LiveKit)

## وضعیت
فاز ۶ پایه — این بسته **فاز ۷** است. بعدی: فاز ۸ (پرونده سلامت هوشمند، triage، نظر دوم، SOAP، نسخه‌نویسی).

> ⚠️ پیش از ادامه «گزارش بازبینی فازهای ۵ و ۶» (پایین همین سند) را بخوانید: چند مورد باعث می‌شد اپ بالا نیاید یا چت/پرونده کار نکند. دو مورد بوت‌کننده همین‌جا اصلاح شد؛ بقیه فهرست و برای «فاز ۶.۵» پیشنهاد شده‌اند.

---

## معماری

```
مرورگر ──(HTTPS)──► API:  POST /appointments/:id/video/token   (JWT کاربر + قواعد نوبت)
   │                       ◄── { url, token(≤۱۰ دقیقه، محدود به یک اتاق و یک هویت) }
   │
   └──(WSS + WebRTC/UDP)──► LiveKit (SFU)  ── webhook امضاشده ──► API: POST /video/webhook
                                                (ورود/خروج، room_finished)
```
- **رسانه (تصویر/صدا) هرگز از API عبور نمی‌کند**؛ API فقط «اجازه‌ی ورود» (توکن) می‌دهد.
- توکن‌ها JWT ‌ی HS256 هستند که با `jose` ساخته می‌شوند؛ `livekit-server-sdk` عمداً اضافه نشد (وابستگی کمتر، سطح حمله‌ی کوچک‌تر). مدیریت اتاق (بستن) با Twirp روی HTTP.
- هر ویزیت دقیقاً **دو نفر** (`room.max_participants: 2`): پزشک و بیمار؛ حتی با نشت توکن، نفر سوم وارد نمی‌شود.

## مسیرهای جدید
| مسیر | نقش | کار |
|---|---|---|
| `GET /appointments/:id/video` | بیمار/پزشک همان نوبت | وضعیت و پنجره‌ی ورود: `OPEN / TOO_EARLY / ENDED / UNAVAILABLE / NOT_VIDEO` |
| `POST /appointments/:id/video/token` | بیمار/پزشک همان نوبت | صدور توکن ورود (`Cache-Control: no-store`، سقف ۳۰ درخواست در ۱۰ دقیقه) |
| `POST /video/webhook` | LiveKit | ثبت حضور و اعلان؛ بدون JWT کاربر، با امضا و هش بدنه‌ی خام |

## قواعد ورود (`apps/api/src/video/video-policy.ts` — تابع خالص + تست)
1. فقط دو طرفِ همین نوبت. ادمین و بقیه ⇒ `404` (وجود نوبت لو نمی‌رود).
2. فقط `kind=VIDEO` و وضعیت `CONFIRMED` یا `IN_PROGRESS`.
3. پنجره: از `شروع − START_EARLY_MINUTES` (همان ۱۰ دقیقه‌ی «شروع زودهنگام پزشک») تا `پایان + VIDEO_JOIN_GRACE_MINUTES` (پیش‌فرض ۱۵). ویزیتِ طولانی‌شده تا پایان مهلت می‌تواند دوباره وصل شود.
4. انقضای توکن = کمترِ (`VIDEO_TOKEN_TTL_SEC`، پایان پنجره). توکن بعد از پایان پنجره قابل‌استفاده نیست.
5. شکست: `404 not_participant` · `422 not_video_visit` · `409 invalid_state` · `422 too_early{opensAt}` · `422 too_late` · `429` · `503 video_unavailable`.

## چرخه‌ی عمر
- **شروع/پایان ویزیت** همچنان با `start`/`complete` ماشین وضعیت نوبت است؛ ورود به اتاق وضعیت را عوض نمی‌کند (پزشک داخل اتاق «شروع ویزیت» و «پایان ویزیت» را دارد).
- **پایان نوبت ⇒ بستن اتاق:** `AppointmentsService.apply` پس از commit موفق، برای `COMPLETE`، لغوها، غیبت‌ها و `EXPIRE` قلاب `APPOINTMENT_LIFECYCLE.onFinished` را صدا می‌زند ⇒ `video_rooms.closed_at` + `DeleteRoom` در LiveKit (هر دو نفر قطع می‌شوند). شکست قلاب فقط لاگ می‌شود و تغییر وضعیت را برنمی‌گرداند.
- **خالی‌شدن اتاق ≠ پایان ویزیت:** LiveKit اتاق خالی را پس از ۵ دقیقه می‌بندد؛ `room_finished` فقط ثبت می‌شود و `closed_at` را عوض نمی‌کند.
- **اعلان:** نخستین ورود پزشک ⇒ اعلان `VIDEO_ROOM_READY` برای بیمار (فقط یک‌بار؛ با `doctor_first_join_at`).

## امنیت و حریم خصوصی
- **Webhook:** `Authorization` = JWT امضاشده با secret، `iss` = API key، claim ی `sha256` = هش بدنه‌ی «خام» (`express.text` فقط روی همین مسیر در `main.ts`). مقایسه‌ی هش `timingSafeEqual`؛ بدنه‌ی دستکاری‌شده، secret/issuer اشتباه، `alg=none` ⇒ `401`. رویداد تکراری با `video_events.event_id UNIQUE` بی‌اثر است.
- **RLS** (`prisma/sql/phase7.sql`): `video_rooms` — خواندن برای هر کس که نوبت را می‌بیند، نوشتن فقط دو طرف/SYSTEM. `video_events` — فقط `SYSTEM` می‌نویسد (کاربر نمی‌تواند حضور جعلی ثبت کند) و برای نقش اپ `UPDATE/DELETE` بسته است (شواهد append-only).
- **هویت LiveKit** = `u_<userId>` (شبه‌ناشناس)؛ نام نمایشی فقط `fullName` که طرف مقابل ویزیت هم می‌بیند. موبایل/دلیل مراجعه/هیچ داده‌ی HEALTH به LiveKit یا `video_events` نمی‌رود.
- Audit: `video.join_token` با `meta={role}`.
- **CSP وب:** `connect-src` فقط به آدرس LiveKit (`LIVEKIT_PUBLIC_URL`) باز شد؛ `media-src blob: mediastream:` و `worker-src blob:` اضافه شد. `Permissions-Policy` از قبل `camera/microphone=(self)` بود.
- **ضبط:** ضبط تصویر/صدا **وجود ندارد** (Egress فعال نیست) و توکن‌ها اجازه‌ی recorder ندارند. این تصمیم حقوقی/رضایت است، نه فنی؛ پیش از فاز ۸ (SOAP) باید صریح تصمیم گرفته شود.

## رابط کاربری (`apps/web`)
- صفحه‌ی `/appointments/[id]/video`: وضعیت‌ها ← **بسته/زود** (شمارش معکوس، بازشدن خودکار) ← **بررسی دستگاه** (پیش‌نمایش، انتخاب دوربین/میکروفون، نمایشگر سطح صدا، پیام فارسی برای هر خطای مجوز) ← **اتاق تماس** ← **خروج/پایان** (ورود دوباره).
- اتاق تماس: میکروفون/دوربین/اشتراک صفحه، کیفیت اتصال، «در حال اتصال دوباره»، انتظار طرف مقابل، بازکردن قفل صدا (سیاست autoplay)، تعویض دستگاه، نگه‌داشتن صفحه روشن (Wake Lock)، هشدار بستن تب، بازشدن ویزیت در تب دوم ⇒ پیام «دستگاه دیگر» (`DUPLICATE_IDENTITY`).
- خطای دوربین ویزیت صوتی را خراب نمی‌کند (میکروفون و دوربین جدا منتشر می‌شوند).
- پزشک: «شروع ویزیت»/«پایان ویزیت» داخل اتاق؛ بیمار/پزشک: «ورود به ویزیت» در جزئیات نوبت و لیست‌ها فقط داخل پنجره.

## راه‌اندازی
```bash
pnpm install                       # livekit-client (web) و express (api)
cp .env.example .env               # کلیدها: pnpm --filter @nobatyar/api gen:keys ؛ مقادیر LIVEKIT_* را بررسی کنید
echo 'LIVEKIT_PUBLIC_URL=ws://localhost:7880' >> apps/web/.env.local
pnpm infra:up                      # شامل livekit
pnpm --filter @nobatyar/api db:phase7   # ۱) مهاجرت schema  ۲) مهاجرت SQL (RLS) — هر دو را commit کنید
pnpm --filter @nobatyar/api test && pnpm --filter @nobatyar/web test
```
بدون `LIVEKIT_*` در توسعه، API بالا می‌آید و مسیرهای ویدئو `503 video_unavailable` می‌دهند؛ در production نبودنشان خطای بوت است (و `wss://` اجباری).
> دو مرورگر/پروفایل متفاوت (یا یکی ناشناس) با حساب پزشک و بیمار، نوبت `VIDEO` با وضعیت `CONFIRMED` و زمان شروع حداکثر ۱۰ دقیقه‌ی آینده.

## تست‌ها
| فایل | چه چیزی |
|---|---|
| `api/src/video/video-policy.test.ts` | ورود در/خارج پنجره، مرزها، همه‌ی ۱۰ وضعیت، kind، ادمین/غریبه، ویزیت طولانی |
| `api/src/video/video.config.test.ts` | اجباری‌بودن در production، `wss`، طول secret، مرزهای عددی |
| `api/src/video/livekit.test.ts` | ساختار JWT و گرنت‌ها، webhook (دستکاری، secret/issuer، `alg=none`)، Twirp و 404 |
| `web/src/lib/video-window.test.ts` | وضعیت UI پنجره، برچسب کیفیت، پیام خطای مجوز |

**صادقانه درباره‌ی اجرا:** در محیط ساخت این بسته شبکه نبود و `pnpm install` ممکن نبود؛ بنابراین `tsc`/`vitest`/`next build` کامل اجرا **نشد**. تست‌های خالص (policy، config، video-window) با شیم محلی روی Node اجرا و سبز شدند؛ `livekit.test.ts` (نیازمند `jose`) و کل type-check باید در محیط شما اجرا شود:
`pnpm typecheck && pnpm lint && pnpm test`. تست یکپارچه‌ی DB (`test:int`) برای ویدئو هنوز نوشته نشده است.

## محدودیت‌ها و تصمیم‌های باز
- **غیبت (no-show) هنوز بر اساس ساعت است، نه حضور.** `video_events` و `*_first_join_at` فقط شواهد را جمع می‌کنند. اتصال خودکار آن‌ها به `REPORT_*_NO_SHOW` و حل اختلاف = فاز ۸/۹.
- **تعویض شبکه/کیفیت:** `adaptiveStream`, `dynacast`, simulcast فعال است؛ حالت «فقط صدا هنگام ضعف شدید شبکه» خودکار نیست.
- **TURN:** برای شبکه‌های محدودکننده (ایران) سرور TURN/TLS روی ۴۴۳ لازم است؛ در این بسته فقط TCP 7881 و UDP محلی. تنظیم production = فاز ۹.
- **چت داخل تماس** نیست؛ از چت نوبت استفاده کنید (بعد از رفع مشکلات فاز ۶).
- **محدودیت ۳۰ توکن/۱۰ دقیقه** ثابت است (نه env).
- نوبت `kind=CHAT/IN_PERSON` ورودی ویدئو ندارد (`422 not_video_visit`).

---

# گزارش بازبینی فازهای ۵ و ۶ (یافته‌های واقعی از خواندن کد)

### اصلاح‌شده در این بسته
1. **اپ بالا نمی‌آمد:** `StorageService` و `PaymentService` توکن `"CONFIG_SERVICE"` را تزریق می‌کردند که هیچ‌جا ثبت نشده بود، و `@nestjs/config` هم وابستگی نبود. ⇒ هر دو از `process.env` می‌خوانند.
2. **MinIO:** نام bucket (`chat`/`records`) با bucket واقعی compose (`nobatyar-private`) نمی‌خواند و نام متغیرها فرق داشت ⇒ یک bucket (`MINIO_BUCKET`) با پیشوند کلید؛ `MINIO_ROOT_USER/PASSWORD` پذیرفته می‌شود.
3. `.env.example` در ریشه وجود نداشت (README به آن ارجاع می‌داد) ⇒ ساخته شد.

### باقی‌مانده — پیشنهاد «فاز ۶.۵ پایدارسازی» (پیش از فاز ۸)
| # | مشکل | اثر |
|---|---|---|
| 1 | `ChatService`، `RecordsService`، `NotificationService`، `FamilyService` مدل‌ها را **مستقیم** با `this.prisma.*` می‌خوانند، نه `withContext` | روی جداولی که RLS با `FORCE` دارند (`conversations`, `messages`, `health_records`, …) `app.user_id` خالی است ⇒ فهرست‌ها خالی و insert ها رد می‌شوند |
| 2 | `crypto.encrypt/decrypt` همگام است ولی با `await` صدا زده می‌شود، و `aad("msg", id)` دو آرگومان دارد (امضا سه‌تایی است: جدول، شناسه، ستون) | خطای کامپایل TypeScript؛ AAD رکوردها هم باید یک الگو شود |
| 3 | `markRead` روی `messages` `UPDATE` می‌زند ولی `hardening.sql` آن را از نقش اپ گرفته و policy ی UPDATE هم نیست | علامت «خوانده‌شده» کار نمی‌کند |
| 4 | هیچ‌جا `Conversation` ساخته نمی‌شود | چت هیچ مکالمه‌ای ندارد |
| 5 | کلاینت چت از `window.__ny_token` می‌خواند که هیچ‌جا مقدار نمی‌گیرد؛ `rewrites` ی Next وب‌سوکت `/socket.io` را پروکسی نمی‌کند | اتصال Socket.IO برقرار نمی‌شود |
| 6 | `notifications`، `family_members` در RLS نیستند | هر نقش اپ می‌تواند همه‌ی ردیف‌ها را بخواند/بنویسد |
| 7 | `Message` برای پیوست فایل `bodyEnc` خالی می‌گذارد و `getMessages` حالت `.length > 0` را بررسی می‌کند؛ `deleteObject`/پیام `SYSTEM` و ویرایش پیام هیچ مسیری ندارند | ناقص |
| 8 | پرداخت: `_buildGatewayUrl` ساختگی/نیمه‌کاره؛ تأیید واقعی با زرین‌پال و ایدمپوتنسی کامل بررسی نشده | پیش از production |
| 9 | SSE اعلان‌ها و `userSockets` گیت‌وی چت در حافظه‌ی یک نمونه‌اند | چندنمونه‌ای کار نمی‌کند (برنامه‌ی فاز ۹ — Redis pub/sub) |

> ترتیب پیشنهادی: ۶.۵ (موارد ۱–۷) ← ۸ ← ۹ ← ۱۰. ویدئو (این فاز) به هیچ‌کدام از این موارد وابسته نیست و مستقل کار می‌کند.
