# Security Policy / سیاست امنیتی

**فارسی:** اگر آسیبپذیریای در نوبت‌یار یافتید، لطفاً آن را بهصورت خصوصی به `mohammadatash62@gmail.com` گزارش دهید. از باز کردن Issue عمومی برای جزئیات آسیبپذیری خودداری کنید.

**English:** If you find a security vulnerability in NobatYar, please report it privately to `mohammadatash62@gmail.com`. Do not disclose exploit details in a public issue.

## Supported versions / نسخههای پشتیبانی‌شده

| Version | Supported |
|---|---|
| `main` (active development) | ✅ |
| Released tags | ✅ latest only |
| Older branches | ❌ |

## What to include / چه مواردی را ذکر کنید

- Steps to reproduce / مراحل بازتولید
- Affected endpoint or module / endpoint یا ماژول آسیبدیده
- Impact assessment / میزان تأثیر
- Proof-of-concept (safe, no real patient data) / نمونه اثباتی ایمن

## Response / پاسخ

- Acknowledgement: within **72 hours** / تأیید دریافت تا ۷۲ ساعت
- Fix or mitigation plan: within **7 days** for critical issues / رفع یا کاهش اثر بحرانی تا ۷ روز

## Security posture / وضعیت امنیتی

- All writes go through NestJS + Prisma with PostgreSQL **RLS** and explicit context.
- Field-level **AES-256-GCM** encryption with AAD; KMS/Vault fail-closed in production.
- OTP/JWT/MFA, consent enforcement, audit log, outbox, idempotency, and feature flags.
- No PHI in logs, telemetry, or analytics; analytics metadata is hashed and allow-listed.

See `docs/FINAL-DELIVERY-REPORT.md`, `docs/m6-file-security.md`, and `docs/runbooks/`.
