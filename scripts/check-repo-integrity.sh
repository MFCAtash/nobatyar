#!/bin/sh
# نگهبان «قابل‌تکرار بودن» ساخت و مهاجرت:
#   ۱) pnpm-lock.yaml موجود و معتبر است (Docker: --frozen-lockfile و turbo prune بدونش شکست می‌خورد)
#   ۲) apps/api/prisma/migrations واقعی است (نه مهاجرت گذرای CI با برچسب 2000…) و migration_lock.toml دارد
#   ۳) «هر» فایل SQL امنیتی (RLS، trigger، grant؛ فهرست در prisma/sql/ORDER) دقیقاً به‌صورت یک مهاجرت وجود دارد.
#      نبودنش یعنی production بدون RLS بالا می‌آید؛ تفاوت محتوا یعنی SQL پس از اعمال ویرایش شده (مهاجرت جدید بسازید).
# کد خروج ۱ = ناسالم. اجرا: sh scripts/check-repo-integrity.sh
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="$ROOT/apps/api"
MIG="$API/prisma/migrations"
ORDER="$API/prisma/sql/ORDER"
fail=0
err() { echo "::error::$1"; fail=1; }

# ۱) lockfile
if [ ! -s "$ROOT/pnpm-lock.yaml" ]; then
  err "pnpm-lock.yaml وجود ندارد یا خالی است (اجرا: sh scripts/bootstrap-baseline.sh یا pnpm install، سپس commit)"
elif ! grep -q '^lockfileVersion' "$ROOT/pnpm-lock.yaml"; then
  err "pnpm-lock.yaml معتبر نیست (خط lockfileVersion ندارد)"
fi

# ۲) migrations
if [ ! -d "$MIG" ] || [ -z "$(ls -A "$MIG" 2>/dev/null)" ]; then
  err "apps/api/prisma/migrations خالی است (اجرا: sh scripts/bootstrap-baseline.sh، سپس commit)"
else
  [ -f "$MIG/migration_lock.toml" ] || err "migration_lock.toml وجود ندارد"
  for d in "$MIG"/*/; do
    name="$(basename "$d")"
    case "$name" in
      2000*) err "مهاجرت گذرای CI ($name) commit شده؛ با bootstrap-baseline.sh مهاجرت‌های واقعی بسازید" ;;
    esac
    [ -s "$d/migration.sql" ] || err "$name/migration.sql خالی است"
  done

  # ۳) هر SQL امنیتی ⇔ یک مهاجرت با محتوای یکسان
  [ -f "$ORDER" ] || err "prisma/sql/ORDER وجود ندارد"
  if [ -f "$ORDER" ]; then
    while read -r f; do
      case "$f" in ''|'#'*) continue ;; esac
      src="$API/prisma/sql/$f.sql"
      [ -f "$src" ] || { err "prisma/sql/$f.sql در ORDER هست ولی فایل وجود ندارد"; continue; }
      found=0
      for d in "$MIG"/*_"$f"/; do
        [ -f "${d}migration.sql" ] || continue
        if cmp -s "$src" "${d}migration.sql"; then found=1; else err "محتوای $(basename "$d")/migration.sql با prisma/sql/$f.sql فرق دارد (SQL اعمال‌شده را ویرایش نکنید؛ مهاجرت جدید بسازید)"; found=2; fi
      done
      [ "$found" -ne 0 ] || err "SQL امنیتی «$f» به‌صورت مهاجرت موجود نیست — بدون آن RLS/trigger/grant اعمال نمی‌شود"
    done < "$ORDER"
  fi
fi

[ "$fail" -eq 0 ] && echo "repo integrity OK (lockfile + migrations + security SQL)"
exit "$fail"
