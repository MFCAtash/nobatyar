#!/bin/sh
# یک‌بار در فاز ۱: ساخت مهاجرت init از schema.prisma + مهاجرت سخت‌سازی (EXCLUDE، Audit، RLS) و اعمال آن‌ها.
# پس از اجرا پوشه‌ی prisma/migrations را commit کنید.
set -e
cd "$(dirname "$0")/.."

if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "prisma/migrations already exists — aborting (db:init is a one-time step)"; exit 1
fi

pnpm exec prisma migrate dev --name init --create-only
sleep 1  # timestamp مهاجرت بعدی باید بزرگ‌تر باشد
STAMP=$(date -u +%Y%m%d%H%M%S)
DIR="prisma/migrations/${STAMP}_security_hardening"
mkdir -p "$DIR"
cp prisma/sql/hardening.sql "$DIR/migration.sql"
pnpm exec prisma migrate dev
echo "OK — now run: pnpm db:seed   (and commit prisma/migrations)"
