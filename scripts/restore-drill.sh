#!/bin/sh
# تمرین بازیابی: آخرین پشتیبان را در یک پایگاه «موقت» بازیابی و سلامتش را می‌سنجد؛ زمان کل = RTO ی واقعی.
# اجرا ماهانه (و پس از هر تغییر بزرگ طرح‌واره):
#   BACKUP_AGE_IDENTITY=/secure/age-key.txt PGHOST=... PGUSER=<owner> PGPASSWORD=... sh scripts/restore-drill.sh [/backups/nobatyar-....dump.age]
# هرگز روی پایگاه production اجرا نمی‌شود: فقط پایگاه nobatyar_restore_drill را می‌سازد و حذف می‌کند.
set -eu
: "${BACKUP_AGE_IDENTITY:?BACKUP_AGE_IDENTITY (age private key file) is required}"
DIR="${BACKUP_DIR:-/backups}"
FILE="${1:-$(ls -1t "$DIR"/nobatyar-*.dump.age 2>/dev/null | head -n1)}"
[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "✗ no backup file found" >&2; exit 1; }
SCRATCH="nobatyar_restore_drill"
T0="$(date +%s)"
umask 077
TMP="$(mktemp)"; trap 'rm -f "$TMP"; psql -d postgres -qc "DROP DATABASE IF EXISTS $SCRATCH" >/dev/null 2>&1 || true' EXIT

if [ -f "$FILE.sha256" ]; then ( cd "$(dirname "$FILE")" && sha256sum -c "$(basename "$FILE").sha256" ) || { echo "✗ checksum mismatch" >&2; exit 1; }; fi
age -d -i "$BACKUP_AGE_IDENTITY" -o "$TMP" "$FILE"

psql -d postgres -qc "DROP DATABASE IF EXISTS $SCRATCH" -c "CREATE DATABASE $SCRATCH"
pg_restore --no-owner --dbname="$SCRATCH" --exit-on-error "$TMP"

q() { psql -d "$SCRATCH" -tAc "$1"; }
FAILS=0
check() { # check "توضیح" "SQL که باید true بدهد"
  if [ "$(q "$2")" = "t" ]; then echo "  ✓ $1"; else echo "  ✗ $1" >&2; FAILS=$((FAILS+1)); fi
}
echo "→ sanity checks on restored copy ($(basename "$FILE"))"
check "migrations applied" "SELECT count(*) > 0 FROM _prisma_migrations WHERE finished_at IS NOT NULL"
check "no failed migrations" "SELECT count(*) = 0 FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL"
for t in users appointments payments refunds health_records messages push_subscriptions; do
  check "RLS enabled+forced on $t" "SELECT COALESCE((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE relname='$t' AND relkind='r'), false)"
done
check "refunds guard trigger present" "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='refunds_guard_trg')"
check "exclusion constraint (double-booking) present" "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE contype='x' AND conrelid='appointments'::regclass)"
echo "  ℹ rows: users=$(q 'SELECT count(*) FROM users') appointments=$(q 'SELECT count(*) FROM appointments') payments=$(q 'SELECT count(*) FROM payments')"

T1="$(date +%s)"
echo "→ restore time (RTO sample): $((T1 - T0))s"
[ "$FAILS" -eq 0 ] && echo "✓ restore drill passed" || { echo "✗ restore drill FAILED ($FAILS checks)" >&2; exit 1; }
