import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { FieldCrypto } from "../field-crypto";
import { KMS_CONFIG, KmsConfig, KmsProvider } from "./kms.config";

export const KMS = Symbol("KMS");

/**
 * قالب بلاب KMS (نسخهٔ ۲)، همخوان با قالب field-crypto:
 *   [نسخه:1 = 2][keyVersion:2 big-endian][ciphertext رشتهٔ Vault به utf8]
 * keyVersion همان شمارهٔ نسخهٔ کلید Transit است (vault:vN:...) و داخل بلاب میماند ⇒
 * چرخش کلید بدون ستون جدا و بدون ازدسترفتن بلابهای قدیمی (تا زمانی که حذف نشدهاند).
 */
const KMS_BLOB_VERSION = 2;
const KMS_HEADER_LEN = 1 + 2;

export class KmsError extends Error {}
export class KmsConfigError extends KmsError {}
export class KmsUnavailableError extends KmsError {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export interface VaultHttpRequest {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
}
export interface VaultHttpResponse {
  status: number;
  json: unknown;
}
export type VaultHttp = (req: VaultHttpRequest) => Promise<VaultHttpResponse>;

/** حمل و نقل پیشفرض: fetch + timeout. خطاها فقط کد وضعیت دارند و بدنهٔ پاسخ لاگ نمیشود. */
export const fetchVaultHttp: VaultHttp = async ({ method, url, headers, body, timeoutMs }) => {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  let json: unknown = null;
  try { json = await res.json(); } catch { /* rotate پاسخ 204 بدون بدنه دارد */ }
  return { status: res.status, json };
};

/** شمارهٔ نسخه را از قالب استاندارد Vault Transit (vault:vN:...) استخراج میکند. */
export function keyVersionFromCiphertext(ciphertext: string): number {
  const m = /^vault:v(\d+):[A-Za-z0-9+/=]+$/.exec(ciphertext);
  if (!m) throw new KmsUnavailableError("vault: unexpected ciphertext format");
  const v = Number(m[1]);
  if (!Number.isInteger(v) || v < 1 || v > 65535) throw new KmsUnavailableError("vault: unsupported key version");
  return v;
}

export function encodeVaultBlob(ciphertext: string): Buffer {
  const keyVersion = keyVersionFromCiphertext(ciphertext);
  const payload = Buffer.from(ciphertext, "utf8");
  const out = Buffer.allocUnsafe(KMS_HEADER_LEN + payload.length);
  out.writeUInt8(KMS_BLOB_VERSION, 0);
  out.writeUInt16BE(keyVersion, 1);
  payload.copy(out, KMS_HEADER_LEN);
  return out;
}

export function decodeVaultBlob(blob: Uint8Array): { keyVersion: number; ciphertext: string } {
  const buf = Buffer.from(blob);
  if (buf.length <= KMS_HEADER_LEN) throw new Error("ciphertext too short");
  if (buf.readUInt8(0) !== KMS_BLOB_VERSION) throw new Error("unsupported ciphertext version");
  const keyVersion = buf.readUInt16BE(1);
  if (keyVersion < 1) throw new Error("invalid key version");
  return { keyVersion, ciphertext: buf.subarray(KMS_HEADER_LEN).toString("utf8") };
}

/**
 * تصمیم چرخش: بلاب با نسخهٔ قدیمیتر از نسخهٔ جاری باید بازرمز شود.
 * strict=true (مثلاً پس از revoke) ⇒ هر نسخهٔ متفاوتی نیاز به چرخش دارد.
 * نسخهٔ «جدیدتر» در حالت عادی نیاز به چرخش ندارد (نباید to-version کاهش دهیم).
 */
export function shouldRotateVersion(keyVersion: number, latestVersion: number, strict = false): boolean {
  if (!Number.isInteger(keyVersion) || keyVersion < 1) throw new Error("keyVersion must be a positive integer");
  if (!Number.isInteger(latestVersion) || latestVersion < 1) throw new Error("latestVersion must be a positive integer");
  return strict ? keyVersion !== latestVersion : keyVersion < latestVersion;
}

export interface KmsStatus {
  provider: KmsProvider;
  mode: "vault-transit" | "env-fallback";
  available: boolean;
  /** شناسهٔ کلید (نام کلید Transit) — مادهٔ کلید نیست. */
  keyId: string;
  currentVersion: number;
  minDecryptionVersion: number;
  checkedAt: string;
}

export interface KmsBackend {
  encrypt(plaintext: string | Buffer, aad: string): Promise<Buffer>;
  decrypt(blob: Uint8Array, aad: string): Promise<Buffer>;
  needsRotation(blob: Uint8Array): Promise<boolean>;
  status(): Promise<KmsStatus>;
  rotateKey(): Promise<number>;
}

/** بکاند واقعی: Vault Transit (TLS از طریق VAULT_ADDR=https الزامی است). */
export class VaultTransitBackend implements KmsBackend {
  private cachedToken?: { value: string; expiresAt: number };
  private cachedStatus?: { at: number; value: KmsStatus };

  constructor(
    private readonly cfg: KmsConfig,
    private readonly http: VaultHttp = fetchVaultHttp,
  ) {
    if (cfg.provider === "env") throw new KmsConfigError("VaultTransitBackend requires KMS_PROVIDER=vault|aws-kms");
  }

  private get mount(): string { return this.cfg.transitMount; }
  private get key(): string { return this.cfg.transitKey; }

  private headers(token?: string): Record<string, string> {
    const h: Record<string, string> = {};
    if (token) h["X-Vault-Token"] = token;
    if (this.cfg.namespace) h["X-Vault-Namespace"] = this.cfg.namespace;
    return h;
  }

  private async raw(method: "GET" | "POST", path: string, body?: unknown, token?: string): Promise<unknown> {
    let res: VaultHttpResponse;
    try {
      res = await this.http({
        method,
        url: `${this.cfg.address}/v1/${path}`,
        headers: this.headers(token),
        body,
        timeoutMs: this.cfg.timeoutMs,
      });
    } catch {
      // خطای شبکه/timeout: جزئیات (آدرس، توکن) نباید نشت کند ⇒ خطای عمومی KMS.
      throw new KmsUnavailableError("vault transport unavailable");
    }
    // بدنهٔ خطا هرگز لاگ/بازگردانده نمیشود — فقط کد وضعیت.
    if (res.status < 200 || res.status >= 300) {
      throw new KmsUnavailableError(`vault request failed (status=${res.status})`, res.status);
    }
    return res.json;
  }

  private async token(): Promise<string> {
    if (this.cfg.auth.kind === "token") return this.cfg.auth.token;
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 1000) return this.cachedToken.value;
    const json = await this.raw("POST", "auth/approle/login", {
      role_id: this.cfg.auth.roleId,
      secret_id: this.cfg.auth.secretId,
    });
    const auth = (json as { auth?: { client_token?: unknown; lease_duration?: unknown } } | null)?.auth;
    const value = auth?.client_token;
    if (typeof value !== "string" || !value) throw new KmsUnavailableError("vault approle login: missing client_token");
    const lease = Number(auth?.lease_duration ?? 0);
    this.cachedToken = { value, expiresAt: now + (Number.isFinite(lease) && lease > 0 ? lease * 1000 : 5 * 60_000) };
    return value;
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const token = await this.token();
    return await this.raw(method, path, body, token) as T;
  }

  async encrypt(plaintext: string | Buffer, aad: string): Promise<Buffer> {
    const res = await this.call<{ data?: { ciphertext?: unknown } }>("POST", `${this.mount}/encrypt/${this.key}`, {
      plaintext: Buffer.from(plaintext).toString("base64"),
      aad: Buffer.from(aad, "utf8").toString("base64"),
    });
    const ciphertext = res?.data?.ciphertext;
    if (typeof ciphertext !== "string") throw new KmsUnavailableError("vault encrypt: missing ciphertext");
    return encodeVaultBlob(ciphertext);
  }

  async decrypt(blob: Uint8Array, aad: string): Promise<Buffer> {
    const { ciphertext } = decodeVaultBlob(blob);
    try {
      const res = await this.call<{ data?: { plaintext?: unknown } }>("POST", `${this.mount}/decrypt/${this.key}`, {
        ciphertext,
        aad: Buffer.from(aad, "utf8").toString("base64"),
      });
      if (typeof res?.data?.plaintext !== "string") throw new KmsUnavailableError("vault decrypt: missing plaintext");
      return Buffer.from(res.data.plaintext, "base64");
    } catch (e) {
      // 400 = AAD/کاپچر اشتباه ⇒ پیام عمومی (مانند field-crypto)، بدون نشت جزئیات.
      if (e instanceof KmsUnavailableError && e.status === 400) throw new Error("decryption failed");
      throw e; // شبکه/5xx ⇒ در دسترس نبودن KMS (fail-closed توسط فراخواننده)
    }
  }

  async needsRotation(blob: Uint8Array): Promise<boolean> {
    const { keyVersion } = decodeVaultBlob(blob);
    const s = await this.status();
    return shouldRotateVersion(keyVersion, s.currentVersion, this.cfg.strictRotation);
  }

  async status(): Promise<KmsStatus> {
    const ttl = this.cfg.statusTtlMs;
    if (ttl > 0 && this.cachedStatus && this.cachedStatus.at + ttl > Date.now()) return this.cachedStatus.value;
    const res = await this.call<{ data?: Record<string, unknown> }>("GET", `${this.mount}/keys/${this.key}`);
    const latest = Number(res?.data?.latest_version);
    if (!Number.isInteger(latest) || latest < 1) throw new KmsUnavailableError("vault status: invalid latest_version");
    const min = Number(res?.data?.min_decryption_version ?? 1);
    const value: KmsStatus = {
      provider: this.cfg.provider,
      mode: "vault-transit",
      available: true,
      keyId: this.key,
      currentVersion: latest,
      minDecryptionVersion: Number.isInteger(min) && min >= 1 ? min : 1,
      checkedAt: new Date().toISOString(),
    };
    if (ttl > 0) this.cachedStatus = { at: Date.now(), value };
    return value;
  }

  /** چرخش کلید در Vault (latest_version را زیاد میکند). post-rewrite توسط rotate()/job انجام میشود. */
  async rotateKey(): Promise<number> {
    await this.call("POST", `${this.mount}/keys/${this.key}/rotate`);
    this.cachedStatus = undefined;
    return (await this.status()).currentVersion;
  }
}

/** fallback فقط برای توسعه: همان قرارداد field-crypto را محلی نگه میدارد. */
export class EnvFallbackBackend implements KmsBackend {
  private readonly crypto: FieldCrypto;

  constructor(private readonly cfg: KmsConfig) {
    if (cfg.provider !== "env" || cfg.isProduction) {
      throw new KmsConfigError("EnvFallbackBackend is only available for non-production KMS_PROVIDER=env");
    }
    this.crypto = FieldCrypto.fromEnv();
  }

  async encrypt(plaintext: string | Buffer, aad: string): Promise<Buffer> {
    return this.crypto.encrypt(plaintext, aad);
  }
  async decrypt(blob: Uint8Array, aad: string): Promise<Buffer> {
    return this.crypto.decrypt(blob, aad);
  }
  async needsRotation(blob: Uint8Array): Promise<boolean> {
    return this.crypto.needsRotation(blob);
  }
  async status(): Promise<KmsStatus> {
    return {
      provider: "env",
      mode: "env-fallback",
      available: true,
      keyId: `field-key#${this.cfg.envKeys?.activeKeyId ?? "?"}`,
      currentVersion: this.cfg.envKeys?.activeKeyId ?? 0,
      minDecryptionVersion: 1,
      checkedAt: new Date().toISOString(),
    };
  }
  async rotateKey(): Promise<number> {
    throw new KmsUnavailableError("rotateKey() needs KMS_PROVIDER=vault; در حالت env از FIELD_KEYS/FIELD_KEY_ACTIVE استفاده کنید");
  }
}

export interface KmsServiceOptions {
  /** تزریق بکاند/حملونقل/logger فقط برای تست است؛ در DI از مقادیر پیشفرض استفاده میشود. */
  backend?: KmsBackend;
  http?: VaultHttp;
  logger?: Pick<Logger, "warn" | "error">;
}

@Injectable()
export class KmsService {
  private readonly backend: KmsBackend;
  private readonly logger?: Pick<Logger, "warn" | "error">;

  constructor(
    @Inject(KMS_CONFIG) private readonly config: KmsConfig,
    @Optional() options: KmsServiceOptions = {},
  ) {
    if (config.isProduction && config.provider === "env") {
      throw new KmsConfigError("KMS_PROVIDER=env is not allowed in production (fail-closed)");
    }
    this.backend = options.backend ?? (
      config.provider === "env" ? new EnvFallbackBackend(config) : new VaultTransitBackend(config, options.http)
    );
    if (config.isProduction && this.backend instanceof EnvFallbackBackend) {
      throw new KmsConfigError("env crypto backend is not allowed in production (fail-closed)");
    }
    this.logger = options.logger;
    for (const w of config.warnings) this.logger?.warn(w); // هشدارها بیخطر (بدون راز)اند
  }

  encrypt(plaintext: string | Buffer, aad: string): Promise<Buffer> {
    return this.backend.encrypt(plaintext, aad);
  }

  decrypt(blob: Uint8Array, aad: string): Promise<Buffer> {
    return this.backend.decrypt(blob, aad);
  }

  async decryptString(blob: Uint8Array, aad: string): Promise<string> {
    return (await this.decrypt(blob, aad)).toString("utf8");
  }

  /** رمزگشایی با نسخهٔ قدیمی + رمزنگاری مجدد با نسخهٔ جاری (همان الگوی FieldCrypto.rotate). */
  async rotate(blob: Uint8Array, aad: string): Promise<Buffer> {
    const plaintext = await this.decrypt(blob, aad);
    return this.encrypt(plaintext, aad);
  }

  needsRotation(blob: Uint8Array): Promise<boolean> {
    return this.backend.needsRotation(blob);
  }

  status(): Promise<KmsStatus> {
    return this.backend.status();
  }

  /** اجرای چرخش کلید سمت KMS (فقط Vault؛ در env fallback خطا میدهد). */
  rotateKey(): Promise<number> {
    return this.backend.rotateKey();
  }
}
