import { describe, expect, it } from "vitest";
import { loadStorageConfig } from "./storage.config";

const prod = (over: Record<string, string | undefined> = {}) => ({
  NODE_ENV: "production",
  MINIO_ENDPOINT: "http://minio:9000", MINIO_PUBLIC_ENDPOINT: "https://s3.nobatyar.ir",
  MINIO_ACCESS_KEY: "nobatyar_app", MINIO_SECRET_KEY: "a1b2c3d4e5f6a7b8c9d0e1f2", MINIO_ROOT_USER: "root_admin",
  ...over,
});

describe("loadStorageConfig", () => {
  it("production سالم ⇒ آدرس عمومی جدا از داخلی", () => {
    const c = loadStorageConfig(prod());
    expect(c.endpoint).toBe("http://minio:9000");
    expect(c.publicEndpoint).toBe("https://s3.nobatyar.ir");
    expect(c.bucket).toBe("nobatyar-private");
  });
  it("production: نبود هر متغیر الزامی ⇒ خطا", () => {
    for (const k of ["MINIO_ENDPOINT", "MINIO_PUBLIC_ENDPOINT", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY"]) {
      expect(() => loadStorageConfig(prod({ [k]: undefined }))).toThrow(new RegExp(k));
    }
  });
  it("production: آدرس عمومی غیر https ⇒ خطا؛ path/credential در آدرس ⇒ خطا", () => {
    expect(() => loadStorageConfig(prod({ MINIO_PUBLIC_ENDPOINT: "http://s3.nobatyar.ir" }))).toThrow(/https/);
    expect(() => loadStorageConfig(prod({ MINIO_PUBLIC_ENDPOINT: "https://s3.nobatyar.ir/bucket" }))).toThrow(/origin only/);
    expect(() => loadStorageConfig(prod({ MINIO_PUBLIC_ENDPOINT: "https://u:p@s3.nobatyar.ir" }))).toThrow(/origin only/);
  });
  it("production: کلید root، رمز کوتاه یا پیش‌فرض ⇒ خطا", () => {
    expect(() => loadStorageConfig(prod({ MINIO_ACCESS_KEY: "root_admin" }))).toThrow(/scoped/);
    expect(() => loadStorageConfig(prod({ MINIO_SECRET_KEY: "short" }))).toThrow(/20/);
    expect(() => loadStorageConfig(prod({ MINIO_SECRET_KEY: "minioadmin-minioadmin-minioadmin" }))).toThrow(/placeholders/);
  });
  it("production: ریشه‌ی MINIO_ROOT_* به‌عنوان جایگزین کلید پذیرفته نمی‌شود", () => {
    expect(() => loadStorageConfig(prod({ MINIO_ACCESS_KEY: undefined, MINIO_SECRET_KEY: undefined, MINIO_ROOT_PASSWORD: "x".repeat(30) }))).toThrow(/required in production/);
  });
  it("توسعه: پیش‌فرض لوکال و سازگار با MINIO_ROOT_*", () => {
    const c = loadStorageConfig({ MINIO_ROOT_USER: "dev", MINIO_ROOT_PASSWORD: "dev-pass" });
    expect(c).toMatchObject({ endpoint: "http://127.0.0.1:9000", publicEndpoint: "http://127.0.0.1:9000", accessKeyId: "dev", secretAccessKey: "dev-pass" });
  });
  it("نام bucket نامعتبر ⇒ خطا", () => {
    expect(() => loadStorageConfig(prod({ MINIO_BUCKET: "Bad_Bucket" }))).toThrow(/MINIO_BUCKET/);
  });
});
