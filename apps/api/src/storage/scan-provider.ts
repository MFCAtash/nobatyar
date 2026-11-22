/**
 * M6 — ارائهدهنده‌ی اسکن آنتیویروس.
 *
 * رابط واحد + چهار پیادهسازی:
 *   - MemoryScanProvider / NoopScanProvider  → توسعه و تست (قطعی)
 *   - ClamAvScanProvider                     → clamd از طریق INSTREAM (اختیاری، production)
 *   - DenyAllScanProvider                    → fail-closed صریح
 *
 * هیچ پیادهای نباید نام فایل یا داده‌ی بیمار را لاگ کند؛ تنها objectKey
 * (server-generated) و امضای malware پاکسازیشده در ScanResult مجاز است.
 */

import net from "node:net";
import type { FileBucket, ScanVerdict } from "./file-security";

export interface ScanRequest {
  /** کلید شیء server-generated (PHI-safe؛ ادعای کاربر در آن دخیل نیست). */
  objectKey: string;
  bucket: FileBucket;
  bytes: Uint8Array;
  detectedMime: string;
}

export interface ScanResult {
  verdict: ScanVerdict;
  /** امضای malware پاکسازیشده یا null — هرگز رشته‌ی خام provider را منتشر نکن. */
  signature: string | null;
  /** کد ثابت و غیر PHI (مثلاً clamav_timeout). */
  detail: string;
}

export interface ScanProvider {
  readonly name: string;
  scan(request: ScanRequest): Promise<ScanResult>;
}

type Env = Record<string, string | undefined>;
const envValue = (env: Env, key: string): string | undefined => (env[key] === undefined || env[key] === "" ? undefined : env[key]);

/** حذف هر کاراکتر غیرمجاز تا provider نتواند نام فایل/داده‌ی بیمار را منعکس کند. */
export function sanitizeSignature(raw: string): string {
  const clean = raw.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 64);
  return clean || "malware";
}

export const CLEAN_RESULT: ScanResult = { verdict: "CLEAN", signature: null, detail: "ok" };

export function infectedResult(signature: string): ScanResult {
  return { verdict: "INFECTED", signature: sanitizeSignature(signature), detail: "malware_detected" };
}

export function errorResult(detail: string): ScanResult {
  return { verdict: "ERROR", signature: null, detail: sanitizeSignature(detail).toLowerCase() };
}

// ---------------------------------------------------------------------------
// پیادهسازی حافظهای /noop
// ---------------------------------------------------------------------------

/** اسکنر قابل برنامه ریزی برای تست: verdict هر objectKey را میشود تنظیم کرد. */
export class MemoryScanProvider implements ScanProvider {
  readonly name: string = "memory";
  private readonly verdicts = new Map<string, ScanVerdict>();

  constructor(private readonly fallback: ScanVerdict = "CLEAN") {}

  setVerdict(objectKey: string, verdict: ScanVerdict): void {
    this.verdicts.set(objectKey, verdict);
  }

  clear(): void {
    this.verdicts.clear();
  }

  async scan(request: ScanRequest): Promise<ScanResult> {
    const verdict = this.verdicts.get(request.objectKey) ?? this.fallback;
    if (verdict === "CLEAN") return CLEAN_RESULT;
    if (verdict === "INFECTED") return infectedResult("test-signature");
    return errorResult("scan_unavailable");
  }
}

/** no-op از پیش تنظیمشده: از نظر امنیتی معادل memory با fallback پاک است. */
export class NoopScanProvider extends MemoryScanProvider {
  override readonly name = "noop";

  constructor() {
    super("CLEAN");
  }
}

/** fail-closed صریح: هر اسکنی ناموفق/رد میشود. */
export class DenyAllScanProvider implements ScanProvider {
  readonly name = "deny-all";

  async scan(): Promise<ScanResult> {
    return errorResult("no_scanner_configured");
  }
}

// ---------------------------------------------------------------------------
// ClamAV (INSTREAM)
// ---------------------------------------------------------------------------

export interface ClamAvConfig {
  host: string;
  port: number;
  timeoutMs: number;
  chunkSize: number;
}

export const DEFAULT_CLAMAV_CONFIG: ClamAvConfig = {
  host: "127.0.0.1",
  port: 3310,
  timeoutMs: 5000,
  chunkSize: 8192,
};

export function parseClamAvConfig(env: Env): ClamAvConfig {
  const host = envValue(env, "CLAMAV_HOST") ?? DEFAULT_CLAMAV_CONFIG.host;
  if (!host || /[\s/]/.test(host)) throw new Error("CLAMAV_HOST is invalid");
  const rawPort = envValue(env, "CLAMAV_PORT") ?? String(DEFAULT_CLAMAV_CONFIG.port);
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("CLAMAV_PORT must be 1-65535");
  const rawTimeout = envValue(env, "CLAMAV_TIMEOUT_MS") ?? String(DEFAULT_CLAMAV_CONFIG.timeoutMs);
  const timeoutMs = Number(rawTimeout);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60000) throw new Error("CLAMAV_TIMEOUT_MS must be 100-60000");
  return { host, port, timeoutMs, chunkSize: DEFAULT_CLAMAV_CONFIG.chunkSize };
}

/** بستههای پروتکل INSTREAM: دستور zINSTREAM، سپس طول ۴بایتی big-endian + داده، سپس طول صفر. */
export function instreamChunks(bytes: Uint8Array, chunkSize = DEFAULT_CLAMAV_CONFIG.chunkSize): Buffer[] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error("chunkSize must be positive");
  const chunks: Buffer[] = [Buffer.from("zINSTREAM\0", "latin1")];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    const header = Buffer.alloc(4);
    header.writeUInt32BE(slice.length, 0);
    chunks.push(header, Buffer.from(slice));
  }
  chunks.push(Buffer.alloc(4)); //end-of-stream
  return chunks;
}

/** تفسیر پاسخ clamd. الگوی شناختهشده: "OK"، "stream: Sig FOUND"، "ERROR". */
export function parseClamAvReply(reply: string): ScanResult {
  const text = reply.replace(/\0/g, " ").trim();
  if (/^ok$/i.test(text)) return CLEAN_RESULT;
  const found = text.match(/^(.*?):\s*(.+?)\s+FOUND$/i) ?? text.match(/^(.+?)\s+FOUND$/i);
  if (found) return infectedResult(found[2] ?? found[1] ?? "malware");
  if (/error/i.test(text)) return errorResult("clamav_error");
  return errorResult("clamav_unknown_reply");
}

export class ClamAvScanProvider implements ScanProvider {
  readonly name = "clamav";

  constructor(private readonly config: ClamAvConfig = DEFAULT_CLAMAV_CONFIG) {}

  async scan(request: ScanRequest): Promise<ScanResult> {
    return new Promise<ScanResult>((resolve) => {
      let socket: net.Socket;
      try {
        socket = net.createConnection({ host: this.config.host, port: this.config.port });
      } catch {
        resolve(errorResult("clamav_connect_failed"));
        return;
      }
      let settled = false;
      let buffer = "";
      const finish = (result: ScanResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(result);
      };
      const timer = setTimeout(() => finish(errorResult("clamav_timeout")), this.config.timeoutMs);

      socket.setEncoding("latin1");
      socket.on("connect", () => {
        for (const chunk of instreamChunks(request.bytes, this.config.chunkSize)) socket.write(chunk);
      });
      socket.on("data", (data: string) => {
        buffer += data;
        if (/[\r\n\0]/.test(buffer)) finish(parseClamAvReply(buffer));
      });
      socket.on("error", () => finish(errorResult("clamav_io_error")));
      socket.on("close", () => {
        if (buffer.trim()) finish(parseClamAvReply(buffer));
        else finish(errorResult("clamav_closed"));
      });
    });
  }
}

// ---------------------------------------------------------------------------
// انتخاب provider از env — fail-closed
// ---------------------------------------------------------------------------

/**
 * توسعه: preconfigured پیشفرض memory. مشخصهنگام production: پیشفرض clamav.
 * SCAN_PROVIDER=none|memory در production ⇒ خطا (هیچ فایلی نباید بدون اسکنر واقعی تأیید شود).
 * مقدار ناشناخته ⇒ خطا (fail-closed).
 */
export function loadScanProviderFromEnv(env: Env = process.env): ScanProvider {
  const configured = envValue(env, "SCAN_PROVIDER");
  const prod = env.NODE_ENV === "production";
  const kind = configured ?? (prod ? "clamav" : "memory");

  switch (kind.toLowerCase()) {
    case "memory":
    case "noop":
    case "none":
      if (prod) throw new Error("SCAN_PROVIDER=memory/none is not allowed in production (fail-closed)");
      return new NoopScanProvider();
    case "clamav":
      return new ClamAvScanProvider(parseClamAvConfig(env));
    case "deny-all":
      return new DenyAllScanProvider();
    default:
      throw new Error(`SCAN_PROVIDER is unsupported: ${kind}`);
  }
}
