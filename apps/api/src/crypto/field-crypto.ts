import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * رمزنگاری سطح فیلد — AES-256-GCM.
 *
 * قالب بلاب: [نسخه:1][keyId:2 (big-endian)][iv:12][tag:16][ciphertext]
 *  - keyId داخل بلاب است ⇒ چرخش کلید بدون ستون جدا (کلید قدیمی در keyring می‌ماند تا re-encrypt کامل شود).
 *  - AAD (مثلاً "appointments:<id>:reason") رمزنگاری را به رکورد/ستون گره می‌زند؛
 *    جابه‌جایی بلاب بین ردیف‌ها در دیتابیس هنگام رمزگشایی خطا می‌دهد.
 */
const FORMAT_VERSION = 1;
const HEADER_LEN = 1 + 2 + 12 + 16;

export interface FieldCryptoConfig {
  /** قالب: "1:<base64-32B>,2:<base64-32B>" */
  keys: string;
  activeKeyId: number;
  /** کلید جدا برای blind index (HMAC) — base64 با حداقل ۳۲ بایت */
  blindIndexKey: string;
}

export class FieldCrypto {
  private readonly keys = new Map<number, Buffer>();
  private readonly activeKeyId: number;
  private readonly blindKey: Buffer;

  constructor(cfg: FieldCryptoConfig) {
    for (const part of cfg.keys.split(",").map((p) => p.trim()).filter(Boolean)) {
      const idx = part.indexOf(":");
      if (idx < 1) throw new Error("FIELD_KEYS: invalid format, expected '<id>:<base64>'");
      const id = Number(part.slice(0, idx));
      if (!Number.isInteger(id) || id < 1 || id > 65535) throw new Error(`FIELD_KEYS: invalid key id '${part.slice(0, idx)}'`);
      const key = Buffer.from(part.slice(idx + 1), "base64");
      if (key.length !== 32) throw new Error(`FIELD_KEYS: key ${id} must be 32 bytes (base64)`);
      if (this.keys.has(id)) throw new Error(`FIELD_KEYS: duplicate key id ${id}`);
      this.keys.set(id, key);
    }
    if (!this.keys.has(cfg.activeKeyId)) throw new Error(`FIELD_KEY_ACTIVE=${cfg.activeKeyId} not found in FIELD_KEYS`);
    this.activeKeyId = cfg.activeKeyId;

    const blind = Buffer.from(cfg.blindIndexKey, "base64");
    if (blind.length < 32) throw new Error("BLIND_INDEX_KEY must be at least 32 bytes (base64)");
    this.blindKey = blind;
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): FieldCrypto {
    const keys = env.FIELD_KEYS;
    const active = env.FIELD_KEY_ACTIVE;
    const blind = env.BLIND_INDEX_KEY;
    if (!keys || !active || !blind) {
      throw new Error("FIELD_KEYS, FIELD_KEY_ACTIVE and BLIND_INDEX_KEY must be set (see scripts/gen-keys.mjs)");
    }
    return new FieldCrypto({ keys, activeKeyId: Number(active), blindIndexKey: blind });
  }

  encrypt(plaintext: string | Buffer, aad: string): Buffer {
    const key = this.keys.get(this.activeKeyId)!;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const data = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
    const ct = Buffer.concat([cipher.update(data), cipher.final()]);
    const header = Buffer.alloc(3);
    header.writeUInt8(FORMAT_VERSION, 0);
    header.writeUInt16BE(this.activeKeyId, 1);
    return Buffer.concat([header, iv, cipher.getAuthTag(), ct]);
  }

  decrypt(blob: Uint8Array, aad: string): Buffer {
    const buf = Buffer.from(blob);
    if (buf.length < HEADER_LEN) throw new Error("ciphertext too short");
    if (buf.readUInt8(0) !== FORMAT_VERSION) throw new Error("unsupported ciphertext version");
    const keyId = buf.readUInt16BE(1);
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`unknown key id ${keyId}`);
    const iv = buf.subarray(3, 15);
    const tag = buf.subarray(15, 31);
    const ct = buf.subarray(31);
    const decipher = createDecipheriv("aes-256-gcm", key, iv, 16);
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(ct), decipher.final()]);
    } catch {
      // پیام عمومی؛ جزئیات (کلید/AAD) در خطا نشت نکند
      throw new Error("decryption failed");
    }
  }

  decryptString(blob: Uint8Array, aad: string): string {
    return this.decrypt(blob, aad).toString("utf8");
  }

  /** آیا بلاب با کلید غیرفعال رمز شده و باید re-encrypt شود؟ */
  needsRotation(blob: Uint8Array): boolean {
    return Buffer.from(blob).readUInt16BE(1) !== this.activeKeyId;
  }

  /** رمزگشایی با کلید قدیمی و رمزنگاری مجدد با کلید فعال. */
  rotate(blob: Uint8Array, aad: string): Buffer {
    return this.encrypt(this.decrypt(blob, aad), aad);
  }

  /** شاخص کور (HMAC) برای جستجو/یکتایی بدون ذخیره‌ی مقدار خام. purpose جداسازی دامنه‌ها است. */
  blindIndex(value: string, purpose: string): string {
    return createHmac("sha256", this.blindKey).update(`${purpose}\0${value}`).digest("hex");
  }
}

/** ساخت AAD استاندارد: جدول + شناسه‌ی رکورد + ستون */
export const aad = (table: string, id: string, column: string): string => `${table}:${id}:${column}`;
