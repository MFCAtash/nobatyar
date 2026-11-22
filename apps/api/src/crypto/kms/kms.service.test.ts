import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { describeKmsConfig, KmsConfig, loadKmsConfig } from "./kms.config";
import {
  decodeVaultBlob,
  encodeVaultBlob,
  KmsConfigError,
  KmsService,
  KmsStatus,
  KmsUnavailableError,
  KmsBackend,
  shouldRotateVersion,
  VaultHttp,
  VaultHttpRequest,
  VaultTransitBackend,
} from "./kms.service";

const TOKEN = "hvs.CAESIJre4l-real-token-9f8a7b";
const KEY = "nobatyar-field";
const AAD = "appointments:id-1:reason";
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

const prodEnv = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: "production",
  KMS_PROVIDER: "vault",
  VAULT_ADDR: "https://vault.internal:8200",
  VAULT_TOKEN: TOKEN,
  VAULT_TRANSIT_KEY: KEY,
  ...overrides,
});

/** Vault Transit جعلی: فقط رفتار پروتکل را شبیهسازی میکند. */
function fakeVault(initialVersion = 1) {
  const calls: VaultHttpRequest[] = [];
  let latest = initialVersion;
  const http: VaultHttp = async (req) => {
    calls.push(req);
    const p = req.url;
    if (p.includes(`/keys/${KEY}/rotate`)) {
      latest += 1;
      return { status: 204, json: null };
    }
    if (p.endsWith(`/keys/${KEY}`) && req.method === "GET") {
      return { status: 200, json: { data: { name: KEY, latest_version: latest, min_decryption_version: 1 } } };
    }
    if (p.includes(`/encrypt/${KEY}`)) {
      const body = req.body as { plaintext: string; aad: string };
      const plaintext = Buffer.from(body.plaintext, "base64").toString("utf8");
      return { status: 200, json: { data: { ciphertext: `vault:v${latest}:${b64("ct:" + plaintext)}` } } };
    }
    if (p.includes(`/decrypt/${KEY}`)) {
      const body = req.body as { ciphertext: string; aad: string };
      if (body.aad !== b64(AAD)) return { status: 400, json: { errors: [] } };
      const m = /^vault:v\d+:(.*)$/.exec(body.ciphertext);
      const plaintext = m ? Buffer.from(m[1], "base64").toString("utf8").slice(3) : "";
      return { status: 200, json: { data: { plaintext: b64(plaintext) } } };
    }
    return { status: 404, json: {} };
  };
  return { http, calls, setLatest: (v: number) => { latest = v; } };
}

const makeService = (http: VaultHttp, cfg = loadKmsConfig(prodEnv({ KMS_STATUS_TTL_MS: "0" })), logger?: Pick<Console, "warn" | "error">) =>
  new KmsService(cfg, { http, logger });

describe("shouldRotateVersion (تصمیم چرخش)", () => {
  it("نسخهٔ قدیمیتر نیاز به چرخش دارد و نسخهٔ جاری نه", () => {
    expect(shouldRotateVersion(1, 2)).toBe(true);
    expect(shouldRotateVersion(2, 2)).toBe(false);
  });
  it("نسخهٔ جدیدتر در حالت عادی بازنویسی نمیشود ولی در strict چرخش میخواهد", () => {
    expect(shouldRotateVersion(3, 2)).toBe(false);
    expect(shouldRotateVersion(3, 2, true)).toBe(true);
    expect(shouldRotateVersion(1, 2, true)).toBe(true);
  });
  it.each([[0, 2], [1, 0], [1.5, 2], [1, NaN]])("ورودی نامعتبر %s/%s رد میشود", (v, latest) => {
    expect(() => shouldRotateVersion(v, latest)).toThrow(/positive integer/);
  });
});

describe("blob و fail-closed تنظیمات", () => {
  it("نسخهٔ کلید را در هدر بلاب نگه میدارد", () => {
    const blob = encodeVaultBlob("vault:v7:Y3Q=");
    expect(blob.readUInt8(0)).toBe(2);
    expect(decodeVaultBlob(blob)).toEqual({ keyVersion: 7, ciphertext: "vault:v7:Y3Q=" });
  });

  it("production بدون KMS_PROVIDER متوقف میشود", () => {
    expect(() => loadKmsConfig({ NODE_ENV: "production" })).toThrow(/KMS_PROVIDER/);
  });

  it("KMS_PROVIDER=env در production ممنوع است (fail-closed)", () => {
    expect(() => loadKmsConfig(prodEnv({ KMS_PROVIDER: "env", FIELD_KEYS: "1:AAAA", FIELD_KEY_ACTIVE: "1" })))
      .toThrow(/KMS_PROVIDER/);
  });

  it("آدرس http و توکن placeholder در production رد میشود", () => {
    expect(() => loadKmsConfig(prodEnv({ VAULT_ADDR: "http://vault.internal:8200" }))).toThrow(/https/);
    expect(() => loadKmsConfig(prodEnv({ VAULT_TOKEN: "changeme" }))).toThrow(/placeholder/);
  });

  it("احراز هویت واقعی و کلید صریح الزامی است", () => {
    expect(() => loadKmsConfig(prodEnv({ VAULT_TOKEN: "" }))).toThrow(/VAULT_TOKEN/);
    expect(() => loadKmsConfig(prodEnv({ VAULT_ROLE_ID: "role" }))).toThrow(/VAULT_SECRET_ID/);
    expect(() => loadKmsConfig(prodEnv({ VAULT_TOKEN: TOKEN, VAULT_ROLE_ID: "role", VAULT_SECRET_ID: "s" }))).toThrow(/either/);
    expect(() => loadKmsConfig(prodEnv({ VAULT_TRANSIT_KEY: "" }))).toThrow(/VAULT_TRANSIT_KEY/);
  });

  it("aws-kms بدون region/ARN/role کامل متوقف میشود", () => {
    const base = prodEnv({ KMS_PROVIDER: "aws-kms" });
    expect(() => loadKmsConfig(base)).toThrow(/AWS_REGION/);
    expect(() => loadKmsConfig({ ...base, AWS_REGION: "ir-central-1" })).toThrow(/AWS_KMS_KEY_ARN/);
    expect(() => loadKmsConfig({ ...base, AWS_REGION: "ir-central-1", AWS_KMS_KEY_ARN: "arn:aws:kms:ir-central-1:123456789012:key/abc" }))
      .toThrow(/AWS_KMS_ROLE/);
    const cfg = loadKmsConfig({
      ...base,
      AWS_REGION: "ir-central-1",
      AWS_KMS_KEY_ARN: "arn:aws:kms:ir-central-1:123456789012:key/abc-123",
      AWS_KMS_ROLE: "arn:aws:iam::123456789012:role/nobatyar-vault",
    });
    expect(cfg.provider).toBe("aws-kms");
    expect(cfg.mode).toBe("vault-transit");
  });

  it("پرچمهای ناایمن در production رد میشوند", () => {
    expect(() => loadKmsConfig(prodEnv({ KMS_ALLOW_INSECURE: "true" }))).toThrow(/insecure/i);
    expect(() => loadKmsConfig(prodEnv({ VAULT_SKIP_VERIFY: "true" }))).toThrow(/SKIP_VERIFY/);
  });

  it("توسعه بدون تنظیمات ⇒ fallback محلی همراه هشدار صریح", () => {
    const cfg = loadKmsConfig({ FIELD_KEYS: "1:AAAA", FIELD_KEY_ACTIVE: "1" });
    expect(cfg.provider).toBe("env");
    expect(cfg.mode).toBe("env-fallback");
    expect(cfg.warnings.join(" ")).toMatch(/مناسب توسعه/);
    expect(cfg.warnings.join(" ")).toMatch(/production/);
  });
});

describe("KmsService ← Vault Transit", () => {
  it("encrypt/decrypt را به Vault Transit محول میکند و AAD را میبندد", async () => {
    const { http, calls } = fakeVault();
    const svc = makeService(http);
    const blob = await svc.encrypt("سردرد شدید", AAD);

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`https://vault.internal:8200/v1/transit/encrypt/${KEY}`);
    expect(calls[0].headers["X-Vault-Token"]).toBe(TOKEN);
    expect((calls[0].body as { plaintext: string }).plaintext).toBe(b64("سردرد شدید"));
    expect((calls[0].body as { aad: string }).aad).toBe(b64(AAD));
    expect(decodeVaultBlob(blob).keyVersion).toBe(1);

    expect(await svc.decryptString(blob, AAD)).toBe("سردرد شدید");
    expect(calls[1].url).toBe(`https://vault.internal:8200/v1/transit/decrypt/${KEY}`);
    expect((calls[1].body as { ciphertext: string }).ciphertext).toBe(decodeVaultBlob(blob).ciphertext);
  });

  it("status متادیتای بیخطر برمیگرداند", async () => {
    const { http, calls } = fakeVault(3);
    const svc = makeService(http);
    const status: KmsStatus = await svc.status();
    expect(status).toMatchObject({ provider: "vault", mode: "vault-transit", available: true, currentVersion: 3, keyId: KEY });
    expect(calls[0].url).toBe(`https://vault.internal:8200/v1/transit/keys/${KEY}`);
    expect(JSON.stringify(status)).not.toContain(TOKEN);
  });

  it("چرخش: نسخهٔ جدید را تشخیص داده و بلاب قدیمی را بازرمز میکند", async () => {
    const v = fakeVault(1);
    const svc = makeService(v.http);
    const oldBlob = await svc.encrypt("secret", AAD);
    expect(await svc.needsRotation(oldBlob)).toBe(false);

    expect(await svc.rotateKey()).toBe(2); // POST .../rotate ⇒ latest_version=2
    expect(await svc.needsRotation(oldBlob)).toBe(true);

    const newBlob = await svc.rotate(oldBlob, AAD);
    expect(decodeVaultBlob(newBlob).keyVersion).toBe(2);
    expect(await svc.needsRotation(newBlob)).toBe(false);
    expect(await svc.decryptString(newBlob, AAD)).toBe("secret");
  });

  it("AAD نادرست ⇒ decryption failed عمومی، بدون نشت جزئیات", async () => {
    const { http } = fakeVault();
    const svc = makeService(http);
    const blob = await svc.encrypt("secret", AAD);
    await expect(svc.decrypt(blob, "appointments:id-2:reason")).rejects.toThrow("decryption failed");
  });

  it("AppRole login یکبار انجام میشود و توکن ذخیرهشده در درخواستها استفاده میشود", async () => {
    const cfg = loadKmsConfig(prodEnv({ VAULT_TOKEN: "", VAULT_ROLE_ID: "role-id-123", VAULT_SECRET_ID: "secret-id-456", KMS_STATUS_TTL_MS: "0" }));
    let logins = 0;
    const http: VaultHttp = async (req) => {
      if (req.url.endsWith("/auth/approle/login")) {
        logins += 1;
        const body = req.body as { role_id: string; secret_id: string };
        expect(body).toEqual({ role_id: "role-id-123", secret_id: "secret-id-456" });
        return { status: 200, json: { auth: { client_token: "hvs.approle-token", lease_duration: 3600 } } };
      }
      expect(req.headers["X-Vault-Token"]).toBe("hvs.approle-token");
      if (req.method === "GET") return { status: 200, json: { data: { latest_version: 1, min_decryption_version: 1 } } };
      return { status: 200, json: { data: { ciphertext: "vault:v1:Y3Q=" } } };
    };
    const svc = new KmsService(cfg, { http });
    await svc.status();
    await svc.encrypt("x", AAD);
    expect(logins).toBe(1);
  });

  it("هیچ رازی (توکن/متن/ciphertext) لاگ نمیشود", async () => {
    const { http } = fakeVault();
    const cfg = loadKmsConfig(prodEnv({ KMS_STATUS_TTL_MS: "0" }));
    const warn = vi.fn();
    const error = vi.fn();
    const svc = new KmsService(cfg, { http, logger: { warn, error } });
    const blob = await svc.encrypt("super-secret-value", AAD);
    await svc.decrypt(blob, AAD);
    await svc.status();
    const logged = JSON.stringify([warn.mock.calls, error.mock.calls, describeKmsConfig(cfg)]);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain("super-secret-value");
    expect(logged).not.toContain(decodeVaultBlob(blob).ciphertext);
  });

  it("سرویس production بکاند env را حتی با تزریق رد میکند", () => {
    const cfg: KmsConfig = { ...loadKmsConfig(prodEnv()), provider: "env", mode: "env-fallback" };
    const stub: KmsBackend = {
      encrypt: async () => Buffer.alloc(0),
      decrypt: async () => Buffer.alloc(0),
      needsRotation: async () => false,
      status: async () => ({}) as KmsStatus,
      rotateKey: async () => 1,
    };
    expect(() => new KmsService(cfg, { backend: stub })).toThrow(KmsConfigError);
  });
});

describe("fallback محلی (توسعه)", () => {
  const k1 = randomBytes(32).toString("base64");
  const k2 = randomBytes(32).toString("base64");
  const blind = randomBytes(32).toString("base64");
  const original = { ...process.env };

  const setEnv = (keys: string, active: string) => {
    process.env.FIELD_KEYS = keys;
    process.env.FIELD_KEY_ACTIVE = active;
    process.env.BLIND_INDEX_KEY = blind;
  };

  it("چرخش و هشدار با همان قرارداد field-crypto کار میکند", async () => {
    try {
      setEnv(`1:${k1}`, "1");
      const first = loadKmsConfig({ FIELD_KEYS: `1:${k1}`, FIELD_KEY_ACTIVE: "1" });
      const s1 = new KmsService(first);
      const blob = await s1.encrypt("record", AAD);
      expect(await s1.needsRotation(blob)).toBe(false);
      expect((await s1.status()).mode).toBe("env-fallback");

      setEnv(`1:${k1},2:${k2}`, "2");
      const second = loadKmsConfig({ FIELD_KEYS: `1:${k1},2:${k2}`, FIELD_KEY_ACTIVE: "2" });
      const warn = vi.fn();
      const s2 = new KmsService(second, { logger: { warn, error: vi.fn() } });
      expect(warn.mock.calls.flat().join(" ")).toMatch(/مناسب توسعه/);
      expect(await s2.needsRotation(blob)).toBe(true);
      const rotated = await s2.rotate(blob, AAD);
      expect(await s2.needsRotation(rotated)).toBe(false);
      expect(await s2.decryptString(rotated, AAD)).toBe("record");
      await expect(s2.rotateKey()).rejects.toBeInstanceOf(KmsUnavailableError);
    } finally {
      process.env = original;
    }
  });
});

describe("VaultTransitBackend مستقیم", () => {
  it("Timeout/خطای شبکه را به KmsUnavailableError تبدیل میکند", async () => {
    const cfg = loadKmsConfig(prodEnv());
    const http: VaultHttp = async () => { throw new Error("ECONNREFUSED"); };
    const backend = new VaultTransitBackend(cfg, http);
    await expect(backend.encrypt("x", AAD)).rejects.toThrow(KmsUnavailableError);
  });
});
