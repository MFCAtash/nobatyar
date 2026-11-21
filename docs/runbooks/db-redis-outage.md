# قطعی Postgres / Redis

## Redis (`redis:false`)
اثر: چت و SSE اعلان محدود می‌شود، rate-limit/OTP (KV) خطا می‌دهد ⇒ **ورود ممکن نیست**.
۱. `docker compose logs redis`؛ پر شدن حافظه؟ `docker compose exec redis redis-cli -a $REDIS_PASSWORD info memory`.
۲. `docker compose restart redis`؛ API خودش دوباره وصل می‌شود. داده‌ی Redis گذراست (کد OTP، شمارنده‌ها)؛ از دست رفتنش بی‌خطر است (کاربر دوباره کد می‌گیرد).

## Postgres (`db:false`)
۱. `docker compose logs postgres | tail -50`؛ دیسک پر؟ (`df -h`، `docker system df`).
۲. restart: `docker compose restart postgres` (WAL بازیابی می‌شود). API پس از برگشت خودکار وصل می‌شود.
۳. خرابی دیسک/داده: [backup-restore.md](backup-restore.md). **قبل از هر بازیابی، حجم خراب را کپی کنید** (تحلیل بعدی).
۴. پس از بازگشت: `/admin/payments?attention` را ببینید (پرداخت‌های در جریان هنگام قطعی توسط reconcile تسویه می‌شوند).
