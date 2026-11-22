# چرخش کلیدها و بازیابی KMS (Vault Transit)

**هدف:** چرخش کلیدهای رمزنگاری سطح فیلد بدون اختلال و بدون ازدسترفتن بلابهای قدیمی، همراه با پشتیبان/بازیابی کلیدها و **RTO** مشخص.

> ⛔ **قوانین مطلق**
> 1. هرگز مادهٔ کلید، توکن Vault، `VAULT_SECRET_ID` یا کلید unseal را در/git/env فایل/لاگ/گزارش خطا نگذارید. کد اپ فقط متادیتا (provider، نام کلید، نسخهٔ جاری) را لاگ میکند (`describeKmsConfig`).
> 2. نسخهٔ قدیمی کلید را تا زمانی که **تمام** بلابها بازرمز (re-encrypt) نشدهاند حذف نکنید (`min_decryption_version` را بالا نبرید). حذف زودهنگام = ازدسترفتن دائمی داده.
> 3. `KMS_PROVIDER=env` (کلید محلی `FIELD_KEYS`) فقط در توسعه است؛ اپ در production با آن بالا نمیآید (**fail-closed**).

## 1. معماری کلیدها (سلسلهمراتب)

| لایه | محل | نقش |
|---|---|---|
| AWS KMS (`alias/nobatyar-vault-unseal`) | AWS | unseal کردن Vault (Seal) — مهر ریشهٔ اعتماد |
| Vault Transit `transit/keys/nobatyar-field` | Vault (Raft) | کلیدهای نسخهای (`vault:vN:`) برای AES-256-GCM فیلدها؛ `exportable=false` |
| `FIELD_KEYS` / `BLIND_INDEX_KEY` | فقط توسعه | جایگزین محلی Transit (غیر production) |

- اپ هنگام encrypt از `latest_version` Vault استفاده میکند و **شمارهٔ نسخه را داخل بلاب** میگذارد (قالب `[2][keyVersion:2][vault:vN:...]`، همخوان با `field-crypto`). بنابراین decrypt بلاب قدیمی تا زمانی که نسخه در Vault موجود است کار میکند.
- `KmsService.needsRotation(blob)` با مقایسهٔ نسخهٔ بلاب و `latest_version` تصمیم میگیرد (`KMS_ROTATION_STRICT=true` ⇒ حتی نسخهٔ «جدیدتر» هم مشکوک است).
- AAD (`aad(table,id,column)`) بلاب را به رکورد گره میزند؛ جابهجایی ردیفها ⇒ خطای decrypt.

## 2. تنظیمات production (fail-closed)

```bash
KMS_PROVIDER=vault            # یا aws-kms
VAULT_ADDR=https://vault-0.vault.internal:8200      # https اجباری
VAULT_ROLE_ID=...             # یا VAULT_TOKEN=... (هر دو باهم ممنوع)
VAULT_SECRET_ID=...           # فقط هنگام AppRole
VAULT_TRANSIT_MOUNT=transit
VAULT_TRANSIT_KEY=nobatyar-field
KMS_TIMEOUT_MS=5000
KMS_STATUS_TTL_MS=30000
KMS_ROTATION_STRICT=false
# فقط provider=aws-kms:
AWS_REGION=ir-central-1
AWS_KMS_KEY_ARN=arn:aws:kms:ir-central-1:123456789012:key/...
AWS_KMS_ROLE=arn:aws:iam::123456789012:role/nobatyar-vault
```

اپ پیش از ساخت اپ اینها را validate میکند؛ هر نقص ⇒ توقف فوری (عدم رمزنگاری با کلید اشتباه). `KMS_ALLOW_INSECURE` / `VAULT_SKIP_VERIFY` در production ممنوعاند. پیکربندی سرور: `infra/vault/vault-prod.hcl` (**TLS بدون `tls_disable`، Raft با هشدار دربارهٔ `file`**).

## 3. رویهٔ چرخش کلید Transit (بدون اختلال)

**زمانبندی: هر ۹۰ روز یا بلافاصله پس از شک به افشا.**

1. **پیشبررسی**
   ```bash
   vault read transit/keys/nobatyar-field        # latest_version, min_decryption_version
   curl -fsS https://vault-0.vault.internal:8200/v1/sys/health
   ```
   تعداد ردیفهای نیازمند بازرمز را با شمارش `needsRotation=true` برآورد کنید (job مربوطه در اپ).
2. **چرخش در Vault** ( policy `nobatyar-kms-admin` )
   ```bash
   vault write -f transit/keys/nobatyar-field/rotate
   vault read transit/keys/nobatyar-field        # latest_version باید +۱ شود
   ```
   نمونههای اپ نیاز به restart ندارند: هر encrypt بعدی از نسخهٔ جدید استفاده میکند.
3. **بازرمز تدریجی (re-encrypt)**: job/chunkها بلابها را با `KmsService.rotate(blob, aad)` میخواند و مینویسد (decrypt با نسخهٔ قدیمی ⇒ encrypt با نسخهٔ جاری). سرعت را محدود نگه دارید تا Vault/DB تحت فشار قرار نگیرند. پیشرفت = کاهش تعداد بلابهایی که `needsRotation=true` میدهند. **هیچ سطر/clob را حذف نکنید.**
4. **پس از اتمام کامل** (و فقط پس از آن):
   ```bash
   vault write transit/keys/nobatyar-field/config min_decryption_version=<N>
   ```
   قبل از این کار، بلابهای باقیمانده غیرقابل خواندن میشوند. `deletion_allowed=false` را هرگز تغییر ندهید مگر با تأیید دو نفره.
5. **تأیید**: نمونهگرفتن از رکوردها + `decryptString` + بررسی `/admin/payments?attention` و no-op سلامت. مدت و تعداد را در لاگ تغییرات ثبت کنید.

> **چرخش `FIELD_KEYS` (توسعه):** کلید جدید با `id` بعدی **اضافه** کنید (قدیمی بماند)، `FIELD_KEY_ACTIVE` را عوض و restart، سپس همانند بالا `rotate()` بزنید. `BLIND_INDEX_KEY` را بدون بازساخت تمام `*_hash` نچرخانید (ر.ک. `secrets-rotation.md`).

## 4. پشتیبانگیری از کلیدها

- کلیدها `exportable=false`اند ⇒ **پشتیبان به معنای snapshot Raft است، نه خروجی کلید**.
  ```bash
  VAULT_ADDR=https://vault-0.vault.internal:8200 \
  vault operator raft snapshot save /backup/vault-$(date +%F).snap
  age -R "$BACKUP_AGE_RECIPIENT" -o /backup/vault-$(date +%F).snap.age /backup/vault-$(date +%F).snap
  ```
  فایل `.snap` سپس حذف شود؛ فقط نسخهٔ ageشده نگه دارید.
- کپی **خارج از همان میزبان** (مانند BACKUP_UPLOAD_CMD در `backup-restore.md`) و نگهَداری ۱۴–۳۰ روزه. dead-man's switch پینگ بدهد.
- AWS KMS (seal) خودش توسط AWS management است، ولی policy/alias و نقش IRSA مربوطه را در IaC نگه دارید؛ حذف alias = عدم unseal.
- توکن/secret_id AppRole را در Secret Manager نگه دارید؛ چرخش `secret_id` جداگانه و بدون downtime (دو نسخه همزمان معتبر بمانند).
- **RPO:** ≤ ۶ ساعت (همراه RPO دیتابیس) — snapshotها را حداقل هر ۶ ساعت بگیرید.

## 5. بازیابی (Disaster Recovery)

**سناریو: ازدسترفتن خوشهٔ Vault ولی وجود دیتابیس رمزنگاریشده.**

1. API/worker را متوقف کنید (جلوگیری از encrypt با کلید اشتباه).
2. خوشهٔ جدید Raft را بالا بیاورید (`vault operator raft join`)؛ unseal=self توسط AWS KMS (نقش IRSA و alias مربوطه جاری باشند).
3. آخرین snapshot معتبر را بارگذاری کنید:
   ```bash
   age -d -i age-key.txt -o /tmp/vault.snap /backup/vault-YYYY-MM-DD.snap.age
   vault operator raft snapshot restore /tmp/vault.snap
   ```
4. Transit mount و policyها را تأیید کنید؛ `latest_version` و `min_decryption_version` با قبل مطابقت داشته باشند.
5. اپ را مجدداً بالا بیاورید؛ `KmsService.status()` و decrypt نمونهها را چک کنید؛ سپس ترافیک را برگردانید.

**RTO:** ≤ ۱ ساعت (زمان unseal + restore snapshot + تأیید). **RPO:** ≤ ۶ ساعت (آخرین snapshot). تمرین بازیابی **ماهانه و پس از هر چرخش** الزامی است؛ مدت واقعی را ثبت کنید.

### چه چیزی پوشش داده نمیشود
- اگر snapshot و کلید KMS seal هر دو از بین بروند ⇒ کلیدها غیرقابل بازیابی ⇒ دادهها از دست رفته. بههمین دلیل کپی بیرونی + age اجباری است.
- حذف نسخهٔ کلید قبل از اتمام re-encrypt ⇒ غیرقابل بازیابی (غیر قابل جبران با backup دیتابیس).

## 6. هشدارها و fail-closed

- توقف اپ با پیام `KMS_PROVIDER...fail-closed` ⇒ تنظیمات ناقص/ناایمن است (نه bug اپ).
- `KmsUnavailableError` / `vault request failed (status=...)` ⇒ Vault در دسترس نیست: اپ **پیش از آن** اطلاعات را رمزنگاری نمیکند (fail-closed)؛ آلارم بدهید و از fallback محلی در production استفاده نکنید.
- مانیتور کنید: `/v1/sys/health`, `latest_version`، تعداد بلابهای `needsRotation=true`، و کسر خطاهای decrypt (پیام عمومی `decryption failed` ⇒ AAD/دادهٔ اشتباه).
- لاگها را اسکن کنید که مبادا راز/کدی وارد شده باشد — policy scrub سمت لاگ (JsonLogger/Sentry) فعال است.

## 7. ارجاعات

- `infra/vault/vault-prod.hcl` — پیکربندی production (TLS/Raft/seal/policies).
- `apps/api/src/crypto/kms/` — `kms.config.ts`, `kms.service.ts`, `kms.module.ts`, تستها.
- `docs/runbooks/secrets-rotation.md` و `docs/runbooks/backup-restore.md`.
