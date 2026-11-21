# پیکربندی نمونهٔ Vault (توسعه/استیج)
# در پروداکشن از backend خوشهای (Consul/Raft) و TLS اجباری استفاده شود.
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
}

storage "file" {
  path = "/vault/file"
}

seal "awskms" {
  region     = "ir-central-1"
  kms_key_id = "alias/nobatyar-vault-unseal"
}

ui = true
disable_mlock = false

api_addr = "http://127.0.0.1:8200"
cluster_addr = "http://127.0.0.1:8201"

# مسیر رازهای برنامه
# vault kv put secret/nobatyar DATABASE_URL=... JWT_SECRET=...
# policy مربوطه فقط قابلیت read روی secret/data/nobatyar/* را دارد.
