export const PUSH_CONFIG = Symbol("PUSH_CONFIG");

export interface PushConfig {
  enabled: boolean;
  publicKey?: string;
  privateKey?: string;
  subject?: string;
  maxPerUser: number;
}

const B64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Web Push (VAPID). یا هیچ‌کدام (قابلیت خاموش؛ یادآوری فقط درون‌برنامه‌ای) یا هر سه متغیر.
 * نیمه‌کاره = خطای راه‌اندازی (جلوگیری از «فکر می‌کنیم پوش روشن است ولی نیست»).
 */
export function loadPushConfig(env: NodeJS.ProcessEnv = process.env): PushConfig {
  const pub = env.VAPID_PUBLIC_KEY?.trim(), priv = env.VAPID_PRIVATE_KEY?.trim(), subject = env.VAPID_SUBJECT?.trim();
  const maxPerUser = env.PUSH_MAX_PER_USER ? Number(env.PUSH_MAX_PER_USER) : 10;
  if (!Number.isInteger(maxPerUser) || maxPerUser < 1 || maxPerUser > 50) throw new Error("PUSH_MAX_PER_USER must be an integer in [1, 50]");
  if (!pub && !priv && !subject) return { enabled: false, maxPerUser };
  if (!pub || !priv || !subject) throw new Error("VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must all be set (or none)");
  // کلید عمومی P-256 نشده = ۶۵ بایت ⇒ ۸۷ نویسه base64url؛ کلید خصوصی ۳۲ بایت ⇒ ۴۳ نویسه
  if (!B64URL.test(pub) || pub.length !== 87) throw new Error("VAPID_PUBLIC_KEY must be a 87-char base64url P-256 public key (scripts/gen-vapid.mjs)");
  if (!B64URL.test(priv) || priv.length !== 43) throw new Error("VAPID_PRIVATE_KEY must be a 43-char base64url P-256 private key");
  if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(subject)) throw new Error("VAPID_SUBJECT must be mailto:you@example.ir or an https URL");
  return { enabled: true, publicKey: pub, privateKey: priv, subject, maxPerUser };
}
