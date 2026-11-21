# چرخش رازها

| راز | روش | اثر |
|---|---|---|
| `JWT_ACCESS_SECRET` | مقدار جدید + restart | همه‌ی access token ها نامعتبر (≤۱۵ دقیقه)، کاربر با refresh ادامه می‌دهد |
| `OTP_SECRET` | مقدار جدید + restart | کدهای OTP در جریان نامعتبر |
| `FIELD_KEYS` | کلید جدید با id بعدی **اضافه** کنید (قدیمی بماند)، `FIELD_KEY_ACTIVE` را عوض و restart، سپس بازرمز (`rotate()`) | بدون اختلال |
| **`BLIND_INDEX_KEY`** | ⛔ **بدون بازساخت همه‌ی `*_hash` ها نچرخانید** | جستجوی تلفن/ورود از کار می‌افتد؛ فقط با اسکریپت بازنمایه‌سازی برنامه‌ریزی‌شده |
| `ZARINPAL_*` / `ZARINPAL_ACCESS_TOKEN` | در پنل درگاه بسازید، env را عوض، restart | token قدیمی را فوراً باطل کنید |
| `METRICS_TOKEN` | env + `infra/monitoring/metrics_token` + restart prometheus | — |
| `POSTGRES_PASSWORD` / `APP_DB_PASSWORD` | `ALTER ROLE` + env + restart | رمز URL-safe |
| کلید age پشتیبان | کلید جدید بسازید، `BACKUP_AGE_RECIPIENT` عوض | پشتیبان‌های قدیمی با کلید قدیمی خوانده می‌شوند ⇒ آن را نگه دارید |
فایل env را فقط روی سرور و در گاوصندوق راز نگه دارید؛ پس از هر چرخش `node dist/preflight.cli.js .env.production`.
