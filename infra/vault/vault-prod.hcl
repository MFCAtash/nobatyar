# =============================================================================
# پیکربندی نمونهٔ PRODUCTION برای Vault (منبع کلیدهای Transit)
# =============================================================================
# قواعد حیاتی:
#  ۱) TLS اجباری است. با ذکر tls_cert_file / tls_key_file، شنوده به صورت پیشفرض TLS
#     دارد. هرگز گزینهٔ tls_disable را اضافه نکنید (مقدار true ⇒ ارسال توکن و
#     متن رمزنگاریشده روی سیم به صورت آشکار). KMS_ALLOW_INSECURE / VAULT_SKIP_VERIFY
#     در اپ نیز ممنوع است (fail-closed).
#  ۲) storage "file" فقط تکگرهای / آزمایشی است و اگرچه ساده است، تحملخطا ندارد:
#     در production از raft (حداقل ۳ گره) استفاده کنید — هشدار زیر را بخوانید.
#  ۳) unseal توسط AWS KMS (seal "awskms")؛ کلید root unseal را در git/دیسک نگه ندارید.
#  ۴) mount/policyها بخشی از تنظیمات سرور نیستند؛ پس از بالا آمدن با vault CLI اعمال میشوند
#     (بخش «Transit mount و policyها» در انتهای همین فایل).
# =============================================================================

ui = true

# mlock را خاموش نکنید، گرچه در کانتینر به capability IPC_LOCK نیاز است.
disable_mlock = false

api_addr     = "https://vault-0.vault.internal:8200"
cluster_addr = "https://vault-0.vault.internal:8201"

default_lease_ttl = "1h"
max_lease_ttl     = "24h"

# -----------------------------------------------------------------------------
# TLS — گواهی را از Secret Manager / PV مخصوص شامل شوید، نه از image.
# -----------------------------------------------------------------------------
listener "tcp" {
  address       = "0.0.0.0:8200"
  tls_cert_file = "/vault/tls/tls.crt"
  tls_key_file  = "/vault/tls/tls.key"

  # اختیاری: احراز هویت متقابل TLS برای مشتریان (در کنار توکن/AppRole).
  # tls_client_ca_file = "/vault/tls/ca.crt"
  # tls_require_and_verify_client_cert = true
}

# -----------------------------------------------------------------------------
# ذخیرهسازی — ⚠️ هشدار: گزینهٔ file تنها برای تکگره/تست است.
#   storage "file" { path = "/vault/file" }   # ⛔ در production استفاده نکنید
# دلیل: بدون تکرار و snapshot قابل اعتماد، خرابی دیسک = ازدسترفتن کلیدها ⇒
# تمامی دادههای رمزنگاریشده غیرقابل بازیابی. از Integrated Storage (Raft) با
# حداقل ۳ گره و اسنapshots منظم استفاده کنید (راهنمای key-rotation.md).
# -----------------------------------------------------------------------------
storage "raft" {
  path    = "/vault/raft"
  node_id = "vault-0"

  retry_join {
    leader_api_addr = "https://vault-1.vault.internal:8200"
    leader_ca_cert_file = "/vault/tls/ca.crt"
  }
  retry_join {
    leader_api_addr = "https://vault-2.vault.internal:8200"
    leader_ca_cert_file = "/vault/tls/ca.crt"
  }
}

# Unseal خودکار با AWS KMS. اعتبارها از IRSA / نقش IAM محیط میآیند، نه از فایل.
# region و key_id باید همانهای باشند که KMS_PROVIDER=aws-kms در اپ validate میکند.
seal "awskms" {
  region     = "ir-central-1"
  kms_key_id = "alias/nobatyar-vault-unseal"
  # endpoint = "https://kms.ir-central-1.amazonaws.com"   # اختیاری (VPC endpoint)
}

# ثبت ممیزی (audit) اجباری؛ مسیرها را به SIEM/Loki ارسال کنید. لاگها نباید راز داشته باشند.
audit "file" {
  path   = "/vault/logs/audit.log"
  format = "json"
}

telemetry {
  prometheus_retention_time = "24h"
  disable_hostname          = true
}

# =============================================================================
# Transit mount و policyها — بخشی از server config نیستند. پس از راهاندازی:
# =============================================================================
#   export VAULT_ADDR=https://vault-0.vault.internal:8200
#   export VAULT_CACERT=/vault/tls/ca.crt
#
#   # ۱) فعالسازی موتور Transit (حداکثر نسخه نگهداریشده را مشخص میکند)
#   vault secrets enable -path=transit -description="field encryption" transit
#   vault write transit/keys/nobatyar-field type=aes256-gcm96 exportable=false deletion_allowed=false
#
#   # ۲) policy فقطخواندنی/رمزنگاری برای اپلیکیشن (بدون rotate و بدون خواندن کلید)
#   vault policy write nobatyar-api - <<'POLICY'
#   path "transit/encrypt/nobatyar-field"  { capabilities = ["update"] }
#   path "transit/decrypt/nobatyar-field"  { capabilities = ["update"] }
#   path "transit/keys/nobatyar-field"     { capabilities = ["read"] }
#   POLICY
#
#   # ۳) policy جداگانهٔ چرخش (فقط ادمین/جاب چرخش)
#   vault policy write nobatyar-kms-admin - <<'POLICY'
#   path "transit/keys/nobatyar-field/rotate" { capabilities = ["update"] }
#   path "transit/keys/nobatyar-field"        { capabilities = ["read", "update"] }
#   POLICY
#
#   # ۴) احراز هویت AppRole برای اپ (VAULT_ROLE_ID / VAULT_SECRET_ID) — بدون توکن بلندمدت
#   vault auth enable approle
#   vault write auth/approle/role/nobatyar-api \
#     token_policies="nobatyar-api" token_ttl="1h" token_max_ttl="4h" \
#     secret_id_ttl="720h" secret_id_num_uses=0
#   # secret_id را فقط یکبار به Secret Manager تحویل دهید و در git نگذارید.
#
# نکته: exportable=false ⇒ کلیدها از Vault خارج نمیشوند؛ بکاپ از طریق snapshot
# Raft + AWS KMS seal است (نه از طریق خروجی کلید). جزئیات: docs/runbooks/key-rotation.md
