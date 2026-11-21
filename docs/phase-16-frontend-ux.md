# فاز ۱۶ — فرانت‌اند، طراحی و UX

این فاز پیشنهادهای بخش «فرانت‌اند و ظاهر» و «UI/UX» را اجرا می‌کند. **اجرای واقعی `pnpm install / lint / build / test` و Storybook و Playwright در محیط نگارش ممکن نبود (بدون اینترنت)**؛ بخش «صحت‌سنجی» پایین دقیقاً می‌گوید چه چیزی اجرا شد.

## ۱) توکن‌های طراحی (منبع واحد)
- منبع: `apps/web/design/tokens.json` (رنگ تیره/روشن، فاصله، شعاع، سایه، تایپوگرافی، عرض‌ها، z-index، زمان‌بندی).
- `pnpm --filter @nobatyar/web tokens` سه فایل می‌سازد (دستی ویرایش نشوند): `src/styles/generated/tokens.css`، `src/styles/generated/utilities.css`، `src/design/tokens.generated.ts`.
- `tokens:check` (داخل `pnpm lint` و CI): اگر فایل‌های ساخته‌شده کهنه باشند شکست می‌خورد.
- لایه‌های CSS: `@layer tokens, base, components, utilities` — لایه‌ی `utilities` همیشه بر کامپوننت‌ها غلبه می‌کند (جای ترفند قدیمی «انتخابگر دوتایی»).
- کلاس‌های utility اکنون **نام‌گذاری معنادار** دارند: `mt-4`، `gap-2`، `fs-sm`، `fw-bold`، `mw-lg`، `text-muted`، `flex items-center justify-between`… (به‌جای `u-display-flex-alignitems-center_gap-8px`).
- **باگ فاز ۱۵ رفع شد:** یک کلاس تولیدشده در `utilities.css` کد CSS خراب داشت (`display: flex"`، `alignItems: "center`) و چیدمان `FileMessage` و جدول مقایسه را می‌شکست.
- رنگ‌های سخت‌کد (`#022019`، `rgba(0,230,184,.18)`، `#05080c`…) توکن شدند؛ حباب پیام و متن روی دکمه اکنون در تم روشن هم درست است.
- **کنتراست WCAG AA:** تست `design/contrast.test.ts` همه‌ی جفت‌رنگ‌های متن/سطح را در هر دو تم می‌سنجد. در تم روشن `muted/teal/red/amber/blue` تیره‌تر شدند (پیش‌تر زیر ۴٫۵ بودند)؛ متن روی دکمه‌ی سبز در تم روشن سفید شد.

## ۲) حذف style inline (۱۵۹ مورد، نه ۱۳۰)
همه‌ی `style={{…}}` ها به کلاس utility یا کلاس کامپوننتی (`kit.css`، `chat.css`، `records.css`) رفتند. تنها استثنا مقدار پویا از راه custom property است: `style={cssVars({ "--level": "40%" })}` (`lib/css.ts`، مثل نوار سطح میکروفن).
نگهبان‌ها: قانون ESLint (`no-restricted-syntax`) **و** تست `design/guardrails.test.ts` که نبودِ inline style، نبودِ `Intl/toLocale*` بیرون از `lib/format.ts`، و وجود هر کلاس به‌کاررفته در CSS را بررسی می‌کند.

## ۳) الگوی page → container → view
`page.tsx` نازک است؛ `XContainer` (داده، حالت، رویداد) و `XView` (خالص، فقط props) جدا شدند. View ها در Storybook با داده‌ی ساختگی نمایش داده می‌شوند.

| حوزه | پوشه | فایل‌ها |
|---|---|---|
| چت | `components/chat/` | `ChatContainer`، `ChatView`، `MessageBubble`، `Composer`، `FileMessage`، `ConversationList{Container,View}` |
| پرونده‌ی سلامت | `components/records/` | `RecordsContainer/ListView`، `RecordDetailContainer/View`، `NewRecordModal`، `ShareModal` |
| خانه (جستجو) | `components/home/` | `HomeContainer/View`، `DoctorCardView`، `CompareBar` |
| رزرو نوبت | `components/booking/` | `DoctorBookingContainer`، `BookingView`، `DoctorProfileView` |
| ورود | `components/login/` | `LoginContainer/View` |
| مقایسه، خانواده، اعلان | `components/{compare,family,notifications}/` | Container + View |

## ۴) TanStack Query
- `lib/query/`: `client.ts` (تنظیمات)، `retry-policy.ts` (تست‌شده)، `keys.ts` (کلیدهای یکتا)، `hooks.ts` (`useApiQuery`، `useApiInfinite`، `useApiMutation` با invalidate).
- سیاست retry: خطای شبکه و ۵xx و ۴۰۸ تا ۲ بار با backoff؛ سایر ۴xx (از جمله ۴۲۹) هرگز.
- ⚠️ **حریم خصوصی:** cache فقط در حافظه است. `AuthCacheGuard` (در `QueryProvider`) با خروج از حساب یا ابطال نشست، cache و همه‌ی پیش‌نویس‌ها را پاک می‌کند.
- مهاجرت‌شده: تخصص‌ها، جستجوی پزشک (infinite + `keepPreviousData`)، پروفایل و ساعت‌های پزشک، نوبت‌ها، پرونده‌ها، مکالمه‌ها، مقایسه، خانواده. هنوز با state دستی: اعلان‌ها (SSE)، ویزیت تصویری، صفحه‌های پزشک/ادمین/triage/نسخه — به‌تدریج با همان هوک‌ها.

## ۵) تاریخ شمسی و اعداد فارسی
- `lib/format.ts` تنها نقطه‌ی قالب‌بندی است: `formatNumber`، `formatDigits` (بدون هزارگان: سال تولد «۱۳۷۰»)، `formatBadgeCount`، `formatBytes` (واحد فارسی)، `formatJalaliMedium`، `formatJalaliDateTime`، `toPersianDigits`، پیش‌نمایش `date/datetime-local`.
- کامپوننت‌ها: `<DateText>` (با `<time dateTime>`)، `<Num>`، `<Money>`، `<JalaliPreview>` (زیر inputهای تاریخ).
- **باگ‌های رفع‌شده:** سال تولد با جداکننده‌ی هزارگان («۱٬۳۷۰»)؛ ارقام لاتین در شمارنده‌های ادمین؛ ۴ نسخه‌ی کپی‌شده‌ی `Intl.DateTimeFormat`.

## ۶) UX
- **اسکلت و حالت خالی:** `components/kit/Skeleton*` و `EmptyState` (آیکون، توضیح، قدم بعدی) در همه‌ی فهرست‌ها.
- **رزرو مرحله‌ای:** `Stepper` (`aria-current="step"`) با سه گام: زمان ← جزئیات ← تأیید. **پیش‌نویس خودکار** (`lib/draft.ts`): فقط `sessionStorage`، TTL دو ساعت، نسخه‌دار؛ ساعت ذخیره‌شده فقط اگر هنوز خالی باشد بازیابی می‌شود. متن «دلیل مراجعه» بالینی است و روی دیسک ماندگار نمی‌شود.
- **ورود OTP:** `autocomplete="one-time-code"`، `inputMode="numeric"`، ارقام فارسی/عربی نرمال می‌شوند، **ارسال خودکار** با کامل‌شدن کد، شمارش معکوس «ارسال مجدد تا ۰۰:۴۷»، **WebOTP** (`lib/use-web-otp.ts`).
  - ⚙️ برای کار کردن WebOTP، **قالب پیامک در پنل Kavenegar** باید آخرین خطش `@دامنه‌ی-شما #%token` باشد (مثلاً `@nobatyar.ir #123456`). بدون آن، فقط autofill کیبورد کار می‌کند.
  - `NEXT_PUBLIC_OTP_LENGTH` باید با `OTP_LENGTH` ی API یکی باشد.
- **آفلاین:** بنر اتصال (`OfflineBanner`)، داده‌ی همین نشست از cache حافظه، و **صف ارسال چت** (`lib/outbox.ts`): پیام‌ها هنگام قطعی صف می‌شوند، پس از اتصال می‌روند، پیام‌های بیش از ۱۵ دقیقه ارسال نمی‌شوند و به کاربر گفته می‌شود.
  - 🔒 **تصمیم آگاهانه:** سیاست PWA این پروژه (`sw-policy.js`) «هیچ داده‌ی پزشکی روی دستگاه نمی‌ماند» است؛ پس «آخرین داده» و صف پیام **فقط در حافظه** است و با بستن تب از بین می‌رود. Service Worker دست‌نخورده ماند.
- **رفع باگ چت:** `markRead` در هر رندر ساخته می‌شد و `read_messages` را مکرر می‌فرستاد (حالا `useCallback`)؛ `any` ها از `use-chat` و `FileMessage` حذف شد (نوع `Socket`).
- **فرم‌ها:** کامپوننت `Field` برچسب را با `htmlFor` و راهنما/خطا را با `aria-describedby`/`aria-invalid` وصل می‌کند (برچسب‌های مودال‌ها پیش‌تر به input وصل نبودند).

## ۷) Storybook (`apps/web/.storybook`)
`pnpm --filter @nobatyar/web storybook` — ۶۳ story در ۱۱ فایل: کیت UI، چت (متصل/تایپ/آفلاین/خطا)، فهرست مکالمه، ورود (۶ حالت)، پرونده، خانه، رزرو (۱۰ حالت)، مقایسه، اعلان، خانواده، `VideoTile`. نوار ابزار تم تیره/روشن؛ RTL و Vazirmatn پیش‌فرض‌اند. `tsconfig.storybook.json` stories را جدا تایپ‌چک می‌کند تا `next build` به devDependency های Storybook وابسته نشود.

## ۸) تست
| تست | کجا | چه می‌گیرد |
|---|---|---|
| واحد | `lib/{draft,otp,outbox,format}.test.ts`، `lib/query/client.test.ts` | منطق خالص |
| نگهبان معماری | `design/guardrails.test.ts` | inline style، Intl، کلاس ناموجود |
| کنتراست | `design/contrast.test.ts` | WCAG AA توکن‌ها (۴۶ بررسی) |
| دودآزمون stories | `stories/stories.test.tsx` | رندر SSR همه‌ی stories، متن خراب |
| axe روی stories | `e2e/visual/stories.a11y.spec.ts` | هر story × هر دو تم |
| axe روی برنامه | `e2e/tests/a11y.spec.ts` | `/` و `/login` × هر دو تم |
| بصری | `e2e/visual/stories.visual.spec.ts` | اسکرین‌شات هر story × تیره/روشن |
CI: job ی جدید `storybook` (در `CI gate`). **baseline های تصویری باید یک‌بار ساخته شوند:** اجرای دستی workflow (یا اولین اجرا) آرتیفکت `visual-baselines-and-report` را می‌سازد؛ محتوای `__snapshots__` را در `apps/e2e/visual/__snapshots__` commit کنید. تا آن زمان فقط گام axe گیت است.

## ۹) صحت‌سنجی انجام‌شده / نشده
✅ انجام شد (در محیط نگارش):
- ۱۱۳ تست فایل‌های web (حدود ۷۰ مورد جدید) با اجرای‌کننده‌ی ساده‌شده‌ی Node (نه خود Vitest) سبز؛ `api.test.ts` و `sse.test.ts`ی موجود با آن اجرا‌کننده اجرا/سازگار نشدند و دست‌نخورده ماندند. `stories.test.tsx` با Vitest واقعی اجرا نشد (معادلش با harness خودم اجرا شد).
- تایپ‌چک TypeScript با تایپ‌های ساختگی React/Next/TanStack: هیچ خطایی در کد جدید (غیر از ناسازگاری خود تایپ‌های ساختگی).
- رندر SSR هر ۶۳ story با React واقعی (۰ خطا، ۰ متن undefined/NaN) و بازبینی چشمی در Chromium در تم تیره و روشن (چت، رزرو، ورود، خانه، فرم‌ها).
- تولید توکن و `--check`.

❌ اجرا **نشد**: `pnpm install`، ESLint (قانون `no-restricted-syntax` فقط خوانده شده؛ تست guardrails همان را پوشش می‌دهد)، `next build`، Storybook، Playwright/axe/بصری، تایپ‌چک با تایپ‌های واقعی TanStack/Storybook. اولین اجرای `pnpm ci:local` احتمالاً چند خطای کوچک تایپ نشان می‌دهد؛ ریسک بیشتر در `useApiInfinite` (تایپ‌های ژنریک TanStack) و stories است. axe روی برنامه ممکن است نکته‌های دسترس‌پذیری تازه‌ای پیدا کند.

## ۱۰) تغییر رفتار آگاهانه
- `mw-*` جایگزین `maxWidth` های ۶۰۰/۶۸۰/۷۰۰ شد: ۶۴۰/۷۲۰ (اختلاف تا ۴۰px).
- دم حباب چت به گوشه‌ی بیرونی (منطقی/RTL) رفت؛ جدول پرونده در موبایل تک‌ستونه شد.
- نوار مقایسه از `<a>` (بارگذاری کامل) به `<Link>` رفت؛ جستجوی پزشک debounce ۳۰۰ms دارد.
- ورود: ریدایرکت فقط از یک `useEffect` انجام می‌شود (پیش‌تر هم `router.replace` در `onVerify` و هم effect).
