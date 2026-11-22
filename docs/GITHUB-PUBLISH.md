# انتشار پروژه در گیت هاب / Publishing to GitHub

## ۱) حقوق و سیاست کپی

پروژه **پابلیک** است ولی **`LICENSE` = All rights reserved** و `LEGAL.md` صریحاً کپی، فورک، تغییر و بازتوزیع را ممنوع میکند.

> ⚠️ حقیقت فنی: GitHub در ریپو پابلیک، دکمهٔ Clone و Download ZIP را نمیشود خاموش کرد. بنابراین جلوگیری **فنی** از کپی تنها با خصوصی کردن مخزن و دعوت افراد با نقش `Read` ممکن است. در حالت پابلیک، بازدارندگی ** حقوقی** است.

## ۲) ساخت ریپو و push

```powershell
# در github.com一个新 repository بسازید (بدون README/LICENSE اولیه)
git remote add origin https://github.com/YOUR_USERNAME/nobatyar.git
git branch -M main
git push -u origin main
```

سپس `YOUR_USERNAME` را در `package.json`، `CHANGELOG.md` و `docs/GITHUB-PUBLISH.md` با نام کاربری واقعی جایگزین کنید.

## ۳) Social Preview (کاور گیت هاب)

GitHub برای Social Preview فقط PNG/JPG میپذیرد (SVG نه). فایلهای آماده:

- `docs/assets/github/cover-dark-teal.png` ← **پیشنهادی**
- `docs/assets/github/cover-isometric.png`
- `docs/assets/github/cover-persian-pattern.png`

مسیر: `Repository → Settings → General → Social preview → Upload image`

همچنین سه نسخهٔ SVG در همان پوشه برای README و ویرایش آسان موجوداند. کاورهایlargeتر 2560×1280 نیزموجوداند: `cover-neon-glass`, `cover-aurora-3d`, `cover-amber-vitality`, `cover-quantum-mesh`.

## ۴.۱) فیلم دمو در README

فایل `docs/assets/video/video_2026-11-22_19-39-31.mp4` (حدود ۲۰ مگابایت) همراه با پوستر `demo-poster.png` در README قرار داده شده است. چون کمتر از ۱۰۰ مگابایت است نیازی به Git LFS نیست و GitHub آنرا با پخشکنندهٔ داخلی نمایش میدهد.

## ۴) تنظیمات پیشنهادی ریپو

| تنظیم | مقدار |
|---|---|
| Visibility | Public (طبق درخواست) |
| Issues | ✅ فعال (برای گزارش باگ/پیشنهاد) |
| Pull Requests | ❌ غیرفعال (View-only) |
| Wiki | ❌ غیرفعال (مستندات در `docs/`) |
| Branch protection `main` | ✅ require CI + 1 review |
| Dependabot | ✅ فعال (از قبل تنظیم شده) |
| Actions | ✅ CI / Security / Canary موجوداند |

## ۵) چک لیست نهایی

- [x] `README.md` دوزبانه و کاورگالری
- [x] `LICENSE` + `LEGAL.md` (ALL RIGHTS RESERVED)
- [x] `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`
- [x] Issue templates + CODEOWNERS
- [x] `.gitignore` (بدون `.env`) و `.gitattributes`
- [x] Social preview PNG + SVG
- [x] تمام تستها و CI سبز
- [ ] جایگزینی `YOUR_USERNAME` و push نهایی (توسط شما)

## ۶) محافظت بیشتر (اختیاری)

اگر کپی شدن现实意义 دارد، ریپو را `Private` کنید و تنها حسابهای مورد اعتماد را با نقش **Read** اضافه نمایید. در آن حالت GitHub عملاً جلوی clone توسط افراد دیگر را میگیرد، ولی پروژه其他 ها نمایش داده نخواهد شد.
