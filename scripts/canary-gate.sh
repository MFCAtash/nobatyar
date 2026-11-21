#!/bin/sh
# دروازهٔ استقرار Canary: بررسی بودجهٔ خطا قبل از پیشروی به مرحلهٔ بعد.
# استفاده: PROMETHEUS_URL=http://... sh scripts/canary-gate.sh <burn-rate-query>
set -eu

QUERY="${1:-max(slo_burn_rate_30d)}"
URL="${PROMETHEUS_URL:-http://localhost:9090}"
MAX_BURN="${MAX_BURN_RATE:-1}"

json=$(curl -fsS --get "$URL/api/v1/query" --data-urlencode "query=$QUERY") || {
  echo "::error:: Prometheus query failed"; exit 2;
}
value=$(printf '%s' "$json" | node -e '
  let s = ""; process.stdin.on("data", (d) => s += d).on("end", () => {
    const j = JSON.parse(s);
    const r = j.data && j.data.result && j.data.result[0];
    if (!r) { console.log("0"); return; }
    console.log(Number(r.value[1]));
  });
')
ok=$(node -e "console.log(Number('$value') <= Number('$MAX_BURN') ? 'yes' : 'no')")
if [ "$ok" != "yes" ]; then
  echo "::error::error budget burn rate $value exceeds $MAX_BURN — aborting canary"
  exit 1
fi
echo "canary gate OK: burn rate $value <= $MAX_BURN"
