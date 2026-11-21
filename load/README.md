# تست بار (k6)

`double-booking.js` — ۵۰ کاربر همزمان، یک نوبت. نتیجهٔ درست: یک ۲۰۱ و ۴۹ خطای ۴۰۹ (`slot_taken`)، صفر خطای ۵۰۰، و دقیقاً یک نوبت در تقویم پزشک.
شکست هر threshold (`booking_success==1`، `booking_conflict_409==49`، `booking_unexpected==0`، `double_booking_detected==0`) یعنی ادعای ضد double-booking برقرار نیست.

`booking-journey.js` — پروفایل بار تدریجی جستجو و رزرو (۱۰ تا ۵۰ کاربر) با آستانهٔ `p95 < 300ms` و نرخ خطای کمتر از ۱٪.

پیشنیاز API (فقط غیر production): `E2E_TEST_HOOKS=true SMS_PROVIDER=memory OTP_PER_IP_HOURLY=100000 OTP_PER_PHONE_HOURLY=100000`.

```bash
k6 run -e BASE_URL=http://localhost:3000/api/v1 load/double-booking.js
k6 run -e BASE_URL=http://localhost:3000/api/v1 load/booking-journey.js
docker run --rm -i --network host -e BASE_URL=http://localhost:3000/api/v1 \
  -v "$PWD/load:/load" grafana/k6:0.54.0 run /load/double-booking.js
# تعداد کاربران: -e USERS=100  (آستانهها خودکار تنظیم میشوند)
```
