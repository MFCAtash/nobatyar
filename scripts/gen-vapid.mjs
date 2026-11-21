#!/usr/bin/env node
// تولید جفت‌کلید VAPID (P-256) برای Web Push — بدون وابستگی خارجی. خروجی را در .env.production بگذارید.
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pub = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });
const b64u = (b) => Buffer.from(b).toString("base64url");
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]); // نقطه‌ی نشده‌ی ۶۵ بایتی

console.log(`VAPID_PUBLIC_KEY=${b64u(raw)}`);
console.log(`VAPID_PRIVATE_KEY=${priv.d}`);
console.log("VAPID_SUBJECT=mailto:ops@your-domain.ir");
console.error("\n⚠️ VAPID_PRIVATE_KEY راز است؛ در مخزن commit نکنید. با تغییر کلید، همه‌ی اشتراک‌های قبلی نامعتبر می‌شوند.");
