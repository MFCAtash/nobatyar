# چک‌لیست پایان فاز ۰

## ساختار و ابزار
- [ ] `pnpm install` بدون خطا (و ثبت `pnpm-lock.yaml` در مخزن)
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` سبز
- [ ] `cp .env.example .env && pnpm infra:up` → سه سرویس healthy و bucket خصوصی ساخته شد
- [ ] `pnpm --filter @nobatyar/api dev` و `curl localhost:3000/health` → `{"status":"ok"}`

## CI
- [ ] هر ۵ job سبز: build-test، compose-smoke، gitleaks، semgrep، trivy
- [ ] Branch protection: ادغام فقط با CI سبز و یک بازبین
- [ ] فعال‌سازی Dependabot و secret scanning در تنظیمات مخزن
- [ ] (اختیاری) pre-commit: gitleaks

## مستندات (نیازمند تأیید انسانی)
- [ ] `docs/threat-model.md` بازبینی و تأیید شد
- [ ] `docs/data-classification.md` تأیید شد
- [ ] `docs/privacy-policy-draft.md` برای مشاور حقوقی ارسال شد
- [ ] `docs/er-diagram.md` و `docs/appointment-rules.md` تأیید مالک محصول (مقادیر [؟] تعیین شد)

## تصمیم‌های باز (قبل از فاز ۱)
1. محل میزبانی (داخل کشور؟)
2. رمزنگاری سطح فیلد در چت: سمت سرور یا انتها‌به‌انتها؟
3. درصد بازپرداخت و مهلت‌ها
4. مدت نگهداری داده‌ها طبق قانون
