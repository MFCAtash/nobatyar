#!/bin/sh
# پشتیبان‌گیری رمزنگاری‌شده‌ی Postgres (pg_dump فرمت custom ⇒ age). اجرا: دستی، cron، یا سرویس `backup` در compose (profile ops).
# رمزنگاری سمت مبدأ: فقط «کلید عمومی» age روی سرور است؛ کلید خصوصی (برای بازیابی) جای دیگری و آفلاین نگه‌داری می‌شود.
# متغیرها: PGHOST PGUSER PGPASSWORD PGDATABASE | BACKUP_AGE_RECIPIENT (الزامی) | BACKUP_DIR (/backups) | BACKUP_KEEP_DAYS (14)
#          BACKUP_UPLOAD_CMD (اختیاری، مثلاً "rclone copy \"$1\" remote:nobatyar/")، BACKUP_PING_URL (اختیاری، dead-man's switch)
set -eu

: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT (age public key) is required}"
: "${PGDATABASE:?PGDATABASE is required}"
DIR="${BACKUP_DIR:-/backups}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DIR/nobatyar-$TS.dump.age"
mkdir -p "$DIR"
umask 077

fail() {
  echo "✗ backup failed: $1" >&2
  rm -f "$OUT.partial"
  [ -n "${BACKUP_FAIL_WEBHOOK:-}" ] && curl -fsS -m 10 -X POST -d "nobatyar backup FAILED: $1" "$BACKUP_FAIL_WEBHOOK" >/dev/null 2>&1 || true
  exit 1
}

# set -o pipefail در sh همیشه نیست ⇒ مرحله‌ها جدا و با فایل موقت
pg_dump --format=custom --no-owner --no-privileges --compress=6 > "$OUT.raw" || { rm -f "$OUT.raw"; fail "pg_dump"; }
[ -s "$OUT.raw" ] || { rm -f "$OUT.raw"; fail "empty dump"; }
age -r "$BACKUP_AGE_RECIPIENT" -o "$OUT.partial" "$OUT.raw" || { rm -f "$OUT.raw"; fail "age encryption"; }
rm -f "$OUT.raw"                       # فایل خام (رمزنگاری‌نشده) هرگز باقی نمی‌ماند
[ -s "$OUT.partial" ] || fail "empty encrypted file"
mv "$OUT.partial" "$OUT"
( cd "$DIR" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256" )

if [ -n "${BACKUP_UPLOAD_CMD:-}" ]; then
  sh -c "$BACKUP_UPLOAD_CMD" _ "$OUT" || fail "upload"
fi

# نگهداری: قدیمی‌تر از KEEP روز حذف (فقط فایل‌های همین الگو)
find "$DIR" -maxdepth 1 -type f \( -name 'nobatyar-*.dump.age' -o -name 'nobatyar-*.dump.age.sha256' \) -mtime +"$KEEP" -delete

echo "✓ backup ok: $(basename "$OUT") ($(wc -c < "$OUT") bytes)"
[ -n "${BACKUP_PING_URL:-}" ] && curl -fsS -m 10 "$BACKUP_PING_URL" >/dev/null 2>&1 || true
