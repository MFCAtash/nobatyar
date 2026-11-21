// تولید کلیدها برای .env — خروجی را در Vault/Secret Manager نگه دارید، نه در git.
import { randomBytes } from "node:crypto";

const b64 = () => randomBytes(32).toString("base64");
console.log(`FIELD_KEYS=1:${b64()}`);
console.log("FIELD_KEY_ACTIVE=1");
console.log(`BLIND_INDEX_KEY=${b64()}`);
console.log(`JWT_ACCESS_SECRET=${b64()}`);
console.log(`OTP_SECRET=${b64()}`);
console.log("\n# هر کلید باید مستقل باشد (از یکی برای چند کار استفاده نکنید).");
console.log("# چرخش کلید فیلد: کلید جدید را با id بعدی به FIELD_KEYS اضافه کنید (قدیمی بماند)،");
console.log("# FIELD_KEY_ACTIVE را عوض کنید، سپس بلاب‌ها را با rotate() بازرمز کنید.");
