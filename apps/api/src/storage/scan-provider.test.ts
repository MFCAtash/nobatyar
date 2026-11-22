import { describe, expect, it } from "vitest";
import { CLEAN_RESULT, ClamAvScanProvider, DEFAULT_CLAMAV_CONFIG, DenyAllScanProvider, infectedResult,
  instreamChunks, loadScanProviderFromEnv, MemoryScanProvider, NoopScanProvider, parseClamAvConfig,
  parseClamAvReply, sanitizeSignature, type ScanRequest } from "./scan-provider";

const b = (s: string): Uint8Array => new TextEncoder().encode(s);
const request = (objectKey: string): ScanRequest => ({
  objectKey, bucket: "chat", bytes: b("file-bytes"), detectedMime: "application/pdf",
});
const KEY = "chat/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.pdf";

describe("result helpers", () => {
  it("نتیجه‌ی پاک ثابت است", () => {
    expect(CLEAN_RESULT).toEqual({ verdict: "CLEAN", signature: null, detail: "ok" });
    expect(infectedResult("Eicar-Test-Signature")).toEqual({
      verdict: "INFECTED", signature: "Eicar-Test-Signature", detail: "malware_detected",
    });
  });
  it("امضای provider پاکسازی میشود (نام فایل/PHI نمیتواند نشت کند)", () => {
    expect(sanitizeSignature("Ali_Reza_1380.pdf <script>")).toBe("Ali_Reza_1380.pdfscript");
    expect(sanitizeSignature("***")).toBe("malware");
    expect(sanitizeSignature("Eicar-Test-Signature-".repeat(10)).length).toBe(64);
  });
});

describe("MemoryScanProvider / NoopScanProvider / DenyAllScanProvider", () => {
  it("پیشفرض memory پاک است و verdict هر کلید قابل تنظیم است", async () => {
    const p = new MemoryScanProvider();
    expect(await p.scan(request(KEY))).toEqual(CLEAN_RESULT);
    p.setVerdict(KEY, "INFECTED");
    expect((await p.scan(request(KEY))).verdict).toBe("INFECTED");
    expect((await p.scan(request("other"))).verdict).toBe("CLEAN");
    p.clear();
    expect((await p.scan(request(KEY))).verdict).toBe("CLEAN");
  });
  it("fallback میتواند fail-closed باشد", async () => {
    expect((await new MemoryScanProvider("ERROR").scan(request(KEY))).verdict).toBe("ERROR");
    expect((await new NoopScanProvider().scan(request(KEY))).verdict).toBe("CLEAN");
    expect((await new DenyAllScanProvider().scan(request(KEY))).verdict).toBe("ERROR");
  });
});

describe("INSTREAM / parseClamAvReply", () => {
  it("chunks ساختار INSTREAM را میسازد", () => {
    const chunks = instreamChunks(new Uint8Array([0x61, 0x62, 0x63]), 2);
    expect(chunks[0].toString("latin1")).toBe("zINSTREAM\0");
    expect(chunks[1].readUInt32BE(0)).toBe(2);
    expect(chunks[2].toString("latin1")).toBe("ab");
    expect(chunks[3].readUInt32BE(0)).toBe(1);
    expect(chunks[4].toString("latin1")).toBe("c");
    expect(chunks[5].readUInt32BE(0)).toBe(0); //end-of-stream
    expect(instreamChunks(new Uint8Array(0))).toHaveLength(2);
  });
  it("پاسخهای clamd تفسیر میشوند", () => {
    expect(parseClamAvReply("OK\n")).toEqual(CLEAN_RESULT);
    expect(parseClamAvReply("stream: Eicar-Test-Signature FOUND\n")).toMatchObject({
      verdict: "INFECTED", signature: "Eicar-Test-Signature",
    });
    expect(parseClamAvReply("ERROR\n")).toMatchObject({ verdict: "ERROR", detail: "clamav_error" });
    expect(parseClamAvReply("garbage\n")).toMatchObject({ verdict: "ERROR", detail: "clamav_unknown_reply" });
  });
});

describe("parseClamAvConfig", () => {
  it("پیشفرضها و مقادیر معتبر", () => {
    expect(parseClamAvConfig({})).toEqual(DEFAULT_CLAMAV_CONFIG);
    expect(parseClamAvConfig({ CLAMAV_HOST: "clamav", CLAMAV_PORT: "3311", CLAMAV_TIMEOUT_MS: "1500" }))
      .toMatchObject({ host: "clamav", port: 3311, timeoutMs: 1500 });
  });
  it("مقادیر نامعتبر ⇒ خطا (fail-closed)", () => {
    expect(() => parseClamAvConfig({ CLAMAV_PORT: "0" })).toThrow(/CLAMAV_PORT/);
    expect(() => parseClamAvConfig({ CLAMAV_PORT: "70000" })).toThrow(/CLAMAV_PORT/);
    expect(() => parseClamAvConfig({ CLAMAV_TIMEOUT_MS: "10" })).toThrow(/CLAMAV_TIMEOUT_MS/);
    expect(() => parseClamAvConfig({ CLAMAV_HOST: "bad host" })).toThrow(/CLAMAV_HOST/);
  });
  it("سازنده‌ی ClamAV هیچ اتصال شبکهای باز نمیکند", () => {
    expect(new ClamAvScanProvider().name).toBe("clamav");
  });
});

describe("loadScanProviderFromEnv", () => {
  it("پیشفرض توسعه = noop", () => {
    expect(loadScanProviderFromEnv({}).name).toBe("noop");
    expect(loadScanProviderFromEnv({ SCAN_PROVIDER: "memory" }).name).toBe("noop");
  });
  it(" clamav و deny-all انتخاب میشوند", () => {
    expect(loadScanProviderFromEnv({ SCAN_PROVIDER: "clamav" }).name).toBe("clamav");
    expect(loadScanProviderFromEnv({ SCAN_PROVIDER: "deny-all" }).name).toBe("deny-all");
  });
  it("production: پیشفرض clamav و مقدار memory/none ⇒ خطا (fail-closed)", () => {
    expect(loadScanProviderFromEnv({ NODE_ENV: "production" }).name).toBe("clamav");
    for (const kind of ["none", "memory", "noop"]) {
      expect(() => loadScanProviderFromEnv({ NODE_ENV: "production", SCAN_PROVIDER: kind })).toThrow(/production/);
    }
    expect(loadScanProviderFromEnv({ NODE_ENV: "production", SCAN_PROVIDER: "clamav" }).name).toBe("clamav");
  });
  it("مقدار ناشناخته ⇒ خطا", () => {
    expect(() => loadScanProviderFromEnv({ SCAN_PROVIDER: "magic" })).toThrow(/unsupported/);
  });
});
