# Canary Rollout Runbook (M11)

## تصمیمگیرنده

منطق تصمیم در `apps/api/src/observability/canary.ts` و تست آن در `canary.test.ts` قرار دارد:

- `burnRate > 5 × maxBurnRate` ⇒ **rollback**
- `burnRate > maxBurnRate` یا نمونه نامعتبر یا نسخهٔ قبل ناسالم ⇒ **hold**
- در غیر این صورت ⇒ **promote** به وزن بعدی

مراحل وزن: `1 → 5 → 10 → 25 → 50 → 100`.

## اجرای dry-run

```powershell
node scripts/canary-rollout.mjs
SIMULATED_BURN=2 node scripts/canary-rollout.mjs   # ⇒ hold
SIMULATED_BURN=8 node scripts/canary-rollout.mjs   # ⇒ rollback
```

پیشفرض **dry-run** است؛ هیچ دستور kubectl اجرا نمیشود.

## اجرای واقعی (staging/production)

```powershell
$env:KUBE_CONFIG="C:\path\to\kubeconfig"
$env:CANARY_ROLLOUT="nobatyar-api"
$env:CANARY_NAMESPACE="nobatyar"
$env:PROMETHEUS_URL="https://prometheus.internal"
$env:PROMETHEUS_TOKEN="<token>"
$env:MAX_BURN_RATE="1"
$env:CANARY_CURRENT_WEIGHT="25"
node scripts/canary-rollout.mjs --apply
```

اسکریپت:

- مقدار burn rate را از Prometheus میخواند (`BURN_QUERY` قابل تنظیم)؛
- با `execFileSync` و آرگومانهای جداگانه `kubectl argo rollouts set weight|abort` را اجرا میکند (بدون shell⇒ بدون تزریق)؛
- در نبود `KUBE_CONFIG` معتبر، نام rollout ناامن یا Prometheus در دسترس نبود ⇒ **fail-closed** و خروج ۱؛
- در حالت `hold` هیچ فرمانی اجرا نمیشود.

## بازگشت دستی

```powershell
kubectl argo rollouts abort nobatyar-api -n nobatyar --kubeconfig $env:KUBE_CONFIG
```
