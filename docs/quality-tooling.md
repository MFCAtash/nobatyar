# ابزارهای کیفیت M12/M15 (بدون وابستگی جدید)

چهار اسکریپت سبک کیفیت، تنها با ابزارهای ازپیشنصبشده (`vitest` در `apps/api`،
`Playwright` در `apps/e2e` و ماژولهای core موجود در Node) پیاده شدهاند. هدف، قابلاجرا
بودن ممیزیها در محیطهایی است که نصب بستهٔ جدید مجاز نیست. هیچکدام `package.json` را
تغییر نمیدهند و مستقیماً با `node` اجرا میشوند.

| اسکریپت | هدف | خروجی |
| --- | --- | --- |
| `scripts/quality-mutation.mjs` | جهشزدایی حداقلیِ سه ماژول خالص و اندازهگیری نرخ کشتن تست | JSON روی stdout + exit code |
| `scripts/quality-visual.mjs` | اسکرینشات از مسیرهای کلیدی و مقایسه بایتی با baseline | JSON + فایلهای `apps/e2e/visual-baselines/` |
| `scripts/quality-sbom.mjs` | استخراج فهرست بستهها از قفل pnpm به SBOM شبیه CycloneDX | `docs/sbom.json` + تعداد روی stdout |
| `scripts/quality-a11y.mjs` | ممیزی سبک DOM دسترسپذیری در صفحات واقعی | JSON + exit code |

## 1) جهشزدایی — `quality-mutation.mjs`

سه ماژول خالصِ تولیدی (`room-policy.ts`، `timeline.ts`، `ui-preferences.ts`) را جهش
میدهد، تست متناظرشان را با همان `vitest` موجود اجرا میکند و بررسی میکند که آیا تست
شکست خورده (جهش **کشته** شده) یا خیر. جهشها قطعیاند و تنها زمانی اعمال میشوند که
الگوی موردنظر دقیقاً یکبار در فایل وجود داشته باشد.

```bash
node scripts/quality-mutation.mjs
```

- خروجی شامل `killed`، `survived`، `killRate` و جزئیات هر جهش است.
- **exit 0** اگر نرخ کشتن ≥ ۰.۵ باشد، در غیر این صورت **exit 1**.
- فایل منبع همیشه در بلوک `finally` (و حتی هنگام خروج غیرطبیعی) بازگردانده میشود و
  صحت بازگردانی با خواندن مجدد تأیید میگردد؛ اسکریپت هیچ فایل تولیدی را تغییرشده باقی
  نمیگذارد.
- فقط `node:fs` و `node:child_process` استفاده شده است (جایگزین حداقلیِ Stryker).

## 2) بصری — `quality-visual.mjs`

مسیرهای `/`، `/login`، `/security`، `/settings/preferences`، `/triage/ruleset` و
`/health/record` را باز و اسکرینشات میگیرد. مقایسه با baselineها صرفاً برابری
`SHA-256` بایتهای تصویر است (بدون pixelmatch و بدون آستانهٔ پیکسل).

```bash
# پیشنیاز: وب روی آدرس پیشفرض http://localhost:3001 در حال اجرا باشد
node scripts/quality-visual.mjs
E2E_BASE_URL=http://localhost:3000 node scripts/quality-visual.mjs
E2E_ROUTES=/,/login node scripts/quality-visual.mjs   # محدود کردن مسیرها
E2E_CHANNEL=chrome node scripts/quality-visual.mjs    # در صورت نیاز
```

- نخستین اجرا که baseline وجود ندارد، تصویر را در `apps/e2e/visual-baselines/` مینویسد
  و وضعیت `baseline created` را گزارش میکند (**شکست نمیدهد**).
- اجراهای بعدی وضعیت `match` یا `diff` را گزارش میکنند. خروج ۱ فقط در صورت `diff` یا
  خطای بارگذاری است.
- baselineها باید روی همان تصویر (همان مرورگر/سیستم CI) ساخته شوند تا هشها پایدار باشند.

## 3) SBOM — `quality-sbom.mjs`

بخش `packages:` فایل `pnpm-lock.yaml` را با regex میخواند، نام/نسخهها را استخراج و
یک سند CycloneDX-like (با `bomFormat`، `metadata.component`، `purl` و `components`)
در `docs/sbom.json` مینویسد. نام وابستگیهای مستقیم از `package.json` خوانده و با
`pnpm:direct` علامتگذاری میشوند.

```bash
node scripts/quality-sbom.mjs
# {"tool":"quality-sbom",...,"count":N,"direct":M}
```

هیچ تماس شبکهای صورت نمیگیرد؛ leavesها و نسخهها دقیقاً از قفل محلی میآیند (جایگزین
ابزارهایی مانند `cyclonedx-*`/`@anchore` بدون نصب بسته).

## 4) دسترسپذیری — `quality-a11y.mjs`

همان مسیرها را با Playwright باز میکند و درون صفحه پنج قانون ساده را میسنجد:

- `html` دارای `lang`؛
- هر `button`/`a` دارای نام قابلدسترس (متن، `aria-label` یا `aria-labelledby`)؛
- هر `input` (غیر hidden) دارای `label`/`aria-label`؛
- هر `img` دارای ویژگی `alt`؛
- هیچ عنصری `tabindex` مثبت نداشته باشد.

```bash
node scripts/quality-a11y.mjs
E2E_BASE_URL=http://localhost:3000 node scripts/quality-a11y.mjs
```

خروجی JSON حاوی `criticalViolations` و نمونههایی از تخلفهاست. **exit 1 فقط زمانی است
که تعداد تخلفات بحرانی (>۰) باشد.** خطای بارگذاری صفحه نیز بهعنوان تخلف بحرانی ثبت
میشود تا پنهان نماند.

همین ممیز بهصورت inline و بدون وابستگی در `apps/e2e/tests/a11y.spec.ts` گنجانده شده
و صفر تخلف بحرانی را در `/` و `/login` (در هر دو تم)_assert_ میکند:

```bash
pnpm --filter @nobatyar/e2e e2e tests/a11y.spec.ts
```

## چرا بدون وابستگی؟

نسخههای استاندارد این ممیزیها (`@axe-core/playwright`، Stryker و ابزارهای CycloneDX)
معمولاً نصب بسته، پیکربندی جداگانه و بهروزرسانی مداوم میطلبند. در اینجا **به عمد**
پیادههای حداقلی و dependency-free انتخاب شد تا:

- نصب بستهٔ جدیدی لازم نباشد (`package.json` دستنخورده بماند)؛
- اجرا در CIهای آفلاین و محیطهای قفلشده ممکن باشد؛
- خروجی ماشینخواندن (JSON) و رفتار exit code قابلپیشبینی باشد.

در صورت نیاز به پوشش کامل WCAG یا جهشزدایی حرفهای، میتوان الگوی استاندارد را بدون
تغییر رابط خروجی این اسکریپتها جایگزین کرد. اسکریپتهای بصری/دسترسپذیری نیازمند سرور
در حال اجرا و مرورگر نصبشدهٔ Playwright
(`pnpm --filter @nobatyar/e2e e2e:install`) هستند.
