#!/bin/sh
# job ی مهاجرت (one-shot) — جدا از start ی API.
#   deploy (پیش‌فرض)  prisma migrate deploy  — فقط مهاجرت‌های commit شده را اعمال می‌کند
#   status            وضعیت مهاجرت‌ها
#   seed              تخصص‌ها (idempotent). در production هرگز کاربر نمونه نمی‌سازد (و اگر باشد شکست می‌خورد)
#   create-admin      ساخت ادمین اولیه‌ی واقعی: ADMIN_PHONE + ADMIN_PHONE_CONFIRM (+ کلیدهای رمزنگاری) — docs/deployment.md
# چرا جدا؟ وقتی چند نمونه‌ی API هم‌زمان بالا بیایند، مهاجرت هم‌زمان خطرناک است. این job یک‌بار و پیش از
# همه‌ی نمونه‌ها اجرا می‌شود (compose: depends_on ... service_completed_successfully). prisma هم خودش
# با advisory lock ی Postgres از اجرای هم‌زمان دو migrate deploy جلوگیری می‌کند.
set -eu
cd "$(dirname "$0")/.."
PATH="$PWD/node_modules/.bin:$PATH"

: "${DATABASE_URL:?DATABASE_URL (کاربر مالک، نه نقش app) لازم است}"

case "${1:-deploy}" in
  deploy)
    if [ ! -d prisma/migrations ] || [ -z "$(ls -A prisma/migrations 2>/dev/null)" ]; then
      echo "ERROR: prisma/migrations خالی است. مهاجرت‌ها باید commit شده باشند (یک‌بار: pnpm --filter @nobatyar/api db:init؛ docs/phase-1.md)." >&2
      exit 1
    fi
    prisma migrate deploy
    ;;
  status) prisma migrate status ;;
  seed)   prisma db seed ;;
  create-admin) exec tsx prisma/create-admin.ts ;;
  *) echo "usage: migrate-deploy.sh [deploy|status|seed|create-admin]" >&2; exit 2 ;;
esac
