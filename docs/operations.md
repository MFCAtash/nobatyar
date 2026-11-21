# عملیات — فهرست

| موضوع | سند |
|---|---|
| هدف‌های سرویس (SLO) و هشدارها | [slo.md](slo.md)، `infra/monitoring/alerts.yml` |
| پاسخ به حادثه | [runbooks/incident-response.md](runbooks/incident-response.md) |
| پرداخت/استرداد | [runbooks/payment-incident.md](runbooks/payment-incident.md)، [refunds-admin.md](refunds-admin.md) |
| قطعی DB/Redis | [runbooks/db-redis-outage.md](runbooks/db-redis-outage.md) |
| پشتیبان و بازیابی | [runbooks/backup-restore.md](runbooks/backup-restore.md) |
| چرخش رازها | [runbooks/secrets-rotation.md](runbooks/secrets-rotation.md) |
| استقرار و بازگشت | [runbooks/deploy-rollback.md](runbooks/deploy-rollback.md) |
| چک‌لیست راه‌اندازی / برنامه‌ی بتا | [go-live-checklist.md](go-live-checklist.md)، [beta-plan.md](beta-plan.md) |

## نقاط پایش در کد
- `GET /api/v1/health` زنده‌بودن؛ `GET /api/v1/health/ready` آمادگی (DB+Redis، فقط بولین).
- `GET /api/v1/metrics` (Bearer `METRICS_TOKEN`؛ بدون توکن ۴۰۴؛ از اینترنت توسط Caddy ۴۰۴): متریک HTTP (فقط الگوی route)، صف استرداد، پرداخت‌های نیازمند توجه، رویدادهای ساعت اخیر.
- لاگ دسترسی JSON (`ACCESS_LOG=true`) با `X-Request-Id`؛ بدون query/IP/بدنه/هدر.
- `preflight`: `node dist/preflight.cli.js .env.production` پیش از هر استقرار.
