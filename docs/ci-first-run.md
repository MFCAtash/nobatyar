# اولین اجرای CI — نقاط شکست محتمل و راه رفع

این مستند حاصل «بازبینی ایستا» است (CI واقعی در محیط ساخت اجرا نشد). به ترتیب احتمال:

| # | علامت | علت | رفع |
|---|---|---|---|
| ۱ | `pnpm-lock.yaml missing` در گام Setup | lockfile هیچ‌وقت commit نشده؛ وابستگی‌های جدید (`@sentry/*`, `web-push`, `@playwright/test`) هم اضافه شده‌اند | یک‌بار `pnpm install` و commit ی `pnpm-lock.yaml` |
| ۲ | `prisma migrate` در `integration`/`e2e-load` | `ci-db-setup.sh` مهاجرت موقت را از `schema.prisma` + `prisma/sql/*.sql` می‌سازد؛ `phase12` و `phase13-refunds` جدیدند | خطای SQL را در لاگ ببینید؛ معمول‌ترین: نام جدول/ستون در SQL با `@@map` ی schema فرق دارد (جدول‌های مرجع: `payments`, `payment_attempts`, `refunds`, `push_subscriptions`, `conversations`) |
| ۳ | `typecheck` | کد جدید بدون `prisma generate` تایپ‌چک نشده (فیلدهای جدید `Refund`/`PushSubscription`) | `pnpm --filter @nobatyar/api exec prisma generate` سپس خطاهای باقی‌مانده را رفع کنید (غالباً `as never` ها را می‌شود برداشت) |
| ۴ | `quality` (ESLint) | قاعده‌ی `no-unused-vars` برای متغیرهای `_x` | از destructuring ی «نادیده‌گرفته» پرهیز شده؛ اگر مورد جدیدی بود حذف کنید |
| ۵ | `e2e-load` — Playwright | انتخابگرها از روی سورس UI نوشته و **تک‌تک با متن‌های UI تطبیق داده شدند**؛ ولی اجرا نشده‌اند | `apps/e2e/playwright-report` و trace را از artifact باز کنید؛ معمولاً یک `getByRole` باید `exact` یا فیلتر شود |
| ۶ | `e2e-load` — k6 | سقف نرخ OTP/verify (باید با env های CI بالا برود) یا فرمت پاسخ `/slots` | لاگ k6: `unexpected 429` ⇒ env ی rate limit؛ `no slots` ⇒ پاسخ `/doctors/:id/slots` را با `curl` ببینید |
| ۷ | `e2e-load` — pwa | `next start` با `output: standalone` هشدار می‌دهد؛ SW فقط در build ی production ثبت می‌شود | تست‌های pwa در نبود SW `skip` می‌شوند (نه fail) |
| ۸ | `ops-lint` | `shellcheck -S warning`، `promtool check rules`، `compose config` | پیام‌ها صریح‌اند؛ `compose config` به همه‌ی متغیرهای `:?` نیاز دارد (مثال: `BACKUP_AGE_RECIPIENT`) |
| ۹ | `unit` | تست‌ها با runner ی مقلد من اجرا شدند، نه vitest واقعی | تفاوت‌های ظریف (مثلاً `toEqual` با `undefined`) ممکن است ۱–۲ تست را بشکند؛ منطق محصول نیست |

**روش پیشنهادی:** job ها را یکی‌یکی سبز کنید: `quality` ← `unit` ← `build` ← `integration` ← `ops-lint` ← `e2e-load`. خروجی شکست (لاگ یا artifact) را بفرستید تا دقیق رفع شود.
