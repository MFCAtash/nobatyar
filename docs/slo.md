# SLO و بودجه‌ی خطا

| شاخص (SLI) | هدف (SLO) | منبع | هشدار |
|---|---|---|---|
| دسترس‌پذیری API (نسبت پاسخ غیر-۵xx) | ۹۹٫۵٪ ماهانه (~۳٫۶ ساعت اختلال) | `nobatyar_http_requests_total` | `HighErrorRate` (۲٪ برای ۵ دقیقه) |
| تأخیر p95 (به‌جز SSE) | < ۵۰۰ms؛ هشدار از ۱s | `nobatyar_http_request_duration_seconds` | `HighLatencyP95` |
| «پرداخت‌کرده، نوبت تأییدنشده» | ۰ مورد بیش از ۱۵ دقیقه | `nobatyar_payments_attention{kind="paid_unsynced"}` | `PaidButNotConfirmed` (critical) |
| استرداد مبهم | ۰ مورد بیش از ۱۵ دقیقه | `nobatyar_refunds{status="REVIEW"}` | `RefundNeedsReview` |
| استرداد اجرانشده | هیچ‌کدام بیش از ۲۴ ساعت | `nobatyar_refunds{status=~"PENDING\|MANUAL\|FAILED"}` | `RefundBacklog` |
| double-booking | ۰ (همیشه) | تست k6 در CI + قید EXCLUDE | شکست CI |
| پشتیبان | حداقل یک پشتیبان موفق هر ۶ ساعت (RPO ≤ ۶ساعت) | dead-man's switch (`BACKUP_PING_URL`) | قطع پینگ |
| بازیابی | RTO ≤ ۱ ساعت (اندازه‌گیری با `restore-drill.sh`) | تمرین ماهانه | — |

**بودجه‌ی خطا:** اگر بیش از ۵۰٪ بودجه‌ی ماه تا نیمه‌ی ماه مصرف شد، انتشار قابلیت جدید متوقف و فقط اصلاح پایداری انجام می‌شود.
**حد صادقانه:** یک VPS/یک پایگاه‌داده‌ی تک‌نقطه‌ای SLO ی ۹۹٫۹٪ نمی‌دهد؛ ۹۹٫۵٪ هدفی واقع‌بینانه برای بتاست. برای بالاتر: replica و failover ی Postgres، دو میزبان.
