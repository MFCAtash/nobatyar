#!/bin/sh
# افزودن یک فایل SQL دلخواه به‌عنوان مهاجرت جدید (پس از آخرین مهاجرت) و اعمال آن.
# استفاده: sh scripts/db-add-sql.sh <نام> <فایل.sql>
set -e
cd "$(dirname "$0")/.."
NAME="$1"; FILE="$2"
[ -n "$NAME" ] && [ -f "$FILE" ] || { echo "usage: db-add-sql.sh <name> <file.sql>"; exit 1; }
sleep 1
DIR="prisma/migrations/$(date -u +%Y%m%d%H%M%S)_${NAME}"
mkdir -p "$DIR"
cp "$FILE" "$DIR/migration.sql"
pnpm exec prisma migrate dev
echo "OK — $DIR (commit it)"
