export const KMS_CONFIG = Symbol("KMS_CONFIG");

export type KmsProvider = "vault" | "aws-kms" | "env";
export type KmsMode = "vault-transit" | "env-fallback";

/**
 * تنظیمات KMS: token/secret_id تنها در حافظه نگه داشته میشوند و هرگز لاگ/سریالیزه نمیشوند.
 * `describeKmsConfig` تنها نسخهٔ بیخطر برای لاگ بوت است.
 */
export interface KmsConfig {
  isProduction: boolean;
  /** در production فقط vault یا aws-kms مجاز است (env ⇒ fail-closed). */
  provider: KmsProvider;
  mode: KmsMode;
  /** آدرس Vault بدون اسلش انتهایی (production: فقط https). */
  address: string;
  /** مسیر mount ترانزیت (پیشفرض: transit). */
  transitMount: string;
  /** نام کلید ترانزیت — شناسه است، مادهٔ کلید نیست. */
  transitKey: string;
  /** احراز هویت Vault: توکن یا AppRole (role). */
  auth:
    | { kind: "token"; token: string }
    | { kind: "approle"; roleId: string; secretId: string };
  /** namespace اختیاری Vault Enterprise. */
  namespace?: string;
  /** فقط provider=aws-kms: مشخصات key/roleای که مهر(unseal) و بکاپ Vault را تأمین میکند. */
  aws?: { region: string; keyArn: string; role: string };
  /** فقط provider=env: شناسهٔ کلید فعال (خود کلیدها در FIELD_KEYS میماند). */
  envKeys?: { activeKeyId: number };
  timeoutMs: number;
  /** کش status (0 = بدون کش). */
  statusTtlMs: number;
  /** true ⇒ هر بلاب با نسخهای غیر از نسخهٔ جاری نیاز به چرخش دارد (پس از revoke). */
  strictRotation: boolean;
  /** هشدارهای راهاندازی (مثلاً fallback محلی در توسعه) — بدون راز. */
  warnings: string[];
}

const PLACEHOLDER = new Set([
  "changeme", "change-me", "change_me", "replace-me", "replaceme", "placeholder",
  "your-token", "your_token", "example", "sample", "xxxx", "xxxxx", "todo", "none", "dev", "test",
]);

const clean = (v: string | undefined): string => v?.trim() ?? "";

const int = (v: string | undefined, d: number, name: string, min: number, max: number): number => {
  if (v === undefined || v === "") return d;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer in [${min}, ${max}]`);
  return n;
};

/** مقدار «واقعی» (نه placeholder) — فقط در production اعمال میشود تا Vault dev با توکن root کار کند. */
function real(value: string, name: string, isProduction: boolean): string {
  if (!value) throw new Error(`${name} is required (fail-closed)`);
  if (isProduction && PLACEHOLDER.has(value.toLowerCase())) {
    throw new Error(`${name} is a placeholder value — a real secret is required in production (fail-closed)`);
  }
  return value;
}

const SAFE_MOUNT = /^[A-Za-z0-9][A-Za-z0-9_/-]{0,127}$/;
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function safeName(value: string, name: string, allowSlash: boolean): string {
  const ok = allowSlash ? SAFE_MOUNT : SAFE_KEY;
  if (!ok.test(value) || value.includes("..") || value.includes("//") || value.endsWith("/")) {
    throw new Error(`${name} has an invalid format`);
  }
  return value;
}

function parseAddress(raw: string, isProduction: boolean, warnings: string[]): string {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("VAULT_ADDR must be a valid URL (e.g. https://vault.internal:8200)"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("VAULT_ADDR must use http or https");
  if (u.username || u.password || u.search || u.hash) throw new Error("VAULT_ADDR must not contain credentials, query or fragment");
  if (isProduction && u.protocol !== "https:") throw new Error("VAULT_ADDR must be https:// in production (fail-closed)");
  if (!isProduction && u.protocol === "http:" && !["127.0.0.1", "localhost", "[::1]", "::1"].includes(u.hostname)) {
    warnings.push("KMS: VAULT_ADDR از http:// غیر لوکال استفاده میکند؛ ترافیک رمزنگاری نشده است (برای production ممنوع).");
  }
  const path = u.pathname.replace(/\/+$/, "");
  return `${u.origin}${path}`;
}

const KMS_ARN = /^arn:aws(?:-[a-z]+)?:kms:[a-z0-9-]+:\d{12}:(?:key|alias)\/[A-Za-z0-9_.:/-]+$/;
const IAM_ROLE_ARN = /^arn:aws(?:-[a-z]+)?:iam::\d{12}:role\/[A-Za-z0-9+=,.@_/-]+$/;
const AWS_REGION = /^[a-z]{2}(?:-[a-z]+)+-\d+$/;

/**
 * بارگذاری fail-closed: هر ناسازگاری ⇒ throw ⇒ اپ بالا نمیآید (main.ts پیش از ساخت اپ و KmsModule هنگام DI).
 *
 * production:
 *  ۱) KMS_PROVIDER دقیقاً vault یا aws-kms (env/none/خالی ⇒ توقف).
 *  ۲) VAULT_ADDR معتبر و https (جلوگیری از ارسالplaintext روی سیم).
 *  ۳) احراز هویت واقعی: VAULT_TOKEN یا VAULT_ROLE_ID+VAULT_SECRET_ID (همزمان ممنوع).
 *  ۴) VAULT_TRANSIT_KEY صریحاً تعیینشده.
 *  ۵) provider=aws-kms ⇒ AWS_REGION + AWS_KMS_KEY_ARN (ARN کامل) + AWS_KMS_ROLE (ARN/نام نقش).
 *
 * توسعه: نبود تنظیمات ⇒ fallback به FIELD_KEYS محلی همراه هشدار صریح (هرگز در production).
 */
export function loadKmsConfig(env: NodeJS.ProcessEnv = process.env): KmsConfig {
  const isProduction = env.NODE_ENV === "production";
  const warnings: string[] = [];

  if (isProduction && env.KMS_ALLOW_INSECURE === "true") {
    throw new Error("KMS_ALLOW_INSECURE=true is not allowed in production (fail-closed)");
  }
  if (isProduction && env.VAULT_SKIP_VERIFY === "true") {
    throw new Error("VAULT_SKIP_VERIFY=true is not allowed in production (fail-closed)");
  }

  const rawProvider = clean(env.KMS_PROVIDER).toLowerCase();
  if (isProduction && rawProvider !== "vault" && rawProvider !== "aws-kms") {
    throw new Error("KMS_PROVIDER must be 'vault' or 'aws-kms' in production (fail-closed)");
  }
  if (!isProduction && rawProvider && rawProvider !== "vault" && rawProvider !== "aws-kms" && rawProvider !== "env") {
    throw new Error("KMS_PROVIDER must be one of: vault, aws-kms, env");
  }
  const provider = (rawProvider || "env") as KmsProvider;

  const timeoutMs = int(env.KMS_TIMEOUT_MS, 5000, "KMS_TIMEOUT_MS", 500, 30_000);
  const statusTtlMs = int(env.KMS_STATUS_TTL_MS, 30_000, "KMS_STATUS_TTL_MS", 0, 300_000);
  const strictRaw = clean(env.KMS_ROTATION_STRICT);
  if (strictRaw && strictRaw !== "true" && strictRaw !== "false") {
    throw new Error('KMS_ROTATION_STRICT must be exactly "true" or "false"');
  }
  const strictRotation = strictRaw === "true";

  if (provider === "env") {
    const active = clean(env.FIELD_KEY_ACTIVE);
    if (!clean(env.FIELD_KEYS) || !active) {
      throw new Error("KMS_PROVIDER=env requires FIELD_KEYS and FIELD_KEY_ACTIVE (see scripts/gen-keys.mjs)");
    }
    const activeKeyId = Number(active);
    if (!Number.isInteger(activeKeyId) || activeKeyId < 1 || activeKeyId > 65535) {
      throw new Error("FIELD_KEY_ACTIVE must be an integer in [1, 65535]");
    }
    warnings.push("KMS_PROVIDER=env: رمزنگاری با کلیدهای محلی FIELD_KEYS انجام میشود — مناسب توسعه/تست است و در production ممنوع است (fail-closed).");
    return {
      isProduction, provider, mode: "env-fallback", address: "", transitMount: "", transitKey: "",
      auth: { kind: "token", token: "" }, envKeys: { activeKeyId },
      timeoutMs, statusTtlMs, strictRotation, warnings,
    };
  }

  const address = parseAddress(clean(env.VAULT_ADDR), isProduction, warnings);
  if (!address) throw new Error("VAULT_ADDR is required when KMS_PROVIDER=vault|aws-kms (fail-closed)");

  const token = clean(env.VAULT_TOKEN);
  const roleId = clean(env.VAULT_ROLE_ID);
  const secretId = clean(env.VAULT_SECRET_ID);
  let auth: KmsConfig["auth"];
  if (token && (roleId || secretId)) {
    throw new Error("use either VAULT_TOKEN or VAULT_ROLE_ID+VAULT_SECRET_ID, not both");
  }
  if (token) auth = { kind: "token", token: real(token, "VAULT_TOKEN", isProduction) };
  else if (roleId || secretId) {
    if (!roleId || !secretId) throw new Error("VAULT_ROLE_ID and VAULT_SECRET_ID must be set together");
    auth = { kind: "approle", roleId: real(roleId, "VAULT_ROLE_ID", isProduction), secretId: real(secretId, "VAULT_SECRET_ID", isProduction) };
  } else {
    throw new Error("VAULT_TOKEN or VAULT_ROLE_ID+VAULT_SECRET_ID is required when KMS_PROVIDER=vault|aws-kms (fail-closed)");
  }

  const transitMount = safeName(clean(env.VAULT_TRANSIT_MOUNT) || "transit", "VAULT_TRANSIT_MOUNT", true);
  let transitKeyRaw = clean(env.VAULT_TRANSIT_KEY);
  if (!transitKeyRaw) {
    if (isProduction) throw new Error("VAULT_TRANSIT_KEY is required in production (fail-closed)");
    transitKeyRaw = "nobatyar-field";
    warnings.push("KMS: VAULT_TRANSIT_KEY تنظیم نشده؛ از نام پیشفرض 'nobatyar-field' استفاده میشود.");
  }
  const transitKey = safeName(transitKeyRaw, "VAULT_TRANSIT_KEY", false);
  const namespace = clean(env.VAULT_NAMESPACE) || undefined;
  if (namespace && (namespace.includes("\n") || namespace.includes("\r"))) throw new Error("VAULT_NAMESPACE has an invalid format");

  let aws: KmsConfig["aws"];
  if (provider === "aws-kms") {
    const region = clean(env.AWS_REGION);
    const keyArn = clean(env.AWS_KMS_KEY_ARN);
    const role = clean(env.AWS_KMS_ROLE);
    if (!region || !keyArn || !role) {
      throw new Error("KMS_PROVIDER=aws-kms requires AWS_REGION, AWS_KMS_KEY_ARN and AWS_KMS_ROLE (fail-closed)");
    }
    if (!AWS_REGION.test(region)) throw new Error("AWS_REGION has an invalid format");
    if (!KMS_ARN.test(keyArn)) throw new Error("AWS_KMS_KEY_ARN must be a full KMS key/alias ARN");
    if (!IAM_ROLE_ARN.test(role) && !/^[A-Za-z0-9+=,.@_-]{1,64}$/.test(role)) throw new Error("AWS_KMS_ROLE must be an IAM role ARN or role name");
    if (isProduction && PLACEHOLDER.has(role.toLowerCase())) {
      throw new Error("AWS_KMS_ROLE is a placeholder value — a real role is required in production (fail-closed)");
    }
    aws = { region, keyArn, role };
  }

  return {
    isProduction, provider, mode: "vault-transit", address, transitMount, transitKey, auth,
    namespace, aws, timeoutMs, statusTtlMs, strictRotation, warnings,
  };
}

/** خلاصهٔ بیخطر برای لاگ بوت — فاقد توکن، secret_id، ARN و هر مادهٔ کلیدی. */
export function describeKmsConfig(c: KmsConfig): string {
  const tls = c.address.startsWith("https://");
  return `kms: provider=${c.provider} mode=${c.mode} auth=${c.auth.kind} key=${c.transitKey || "field-keys"} tls=${tls} awsSeal=${c.aws ? "set" : "none"} strictRotation=${c.strictRotation} warnings=${c.warnings.length}`;
}
