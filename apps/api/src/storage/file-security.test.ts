import { describe, expect, it } from "vitest";
import {
  analyzeFile, assertServable, canServe, canTransition, crossCheckWithFileType, decisionLogContext, FileSecurityError,
  initialState, MAX_FILE_BYTES, normalizeMime, safeExtension, safeLogContext, safeObjectKey, sniffMagicBytes,
  transition, verdictToEvent, type ExternalSniffer, type SnifferLoader,
} from "./file-security";

const b = (s: string): Uint8Array => new TextEncoder().encode(s);
const concat = (...parts: Uint8Array[]): Uint8Array => Uint8Array.from(parts.flatMap((p) => Array.from(p)));

const pdf = concat(b("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"), b("%%EOF\n"));
const png = concat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), b("IHDR...."));
const jpeg = concat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), b("JFIF...."));
const gif = b("GIF89a........");
const webp = concat(b("RIFF"), new Uint8Array([0x20, 0x00, 0x00, 0x00]), b("WEBPVP8 ...."));
const tiff = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
const dicom = concat(new Uint8Array(128), b("DICM"), b("0002...."));
const docx = concat(b("PK"), new Uint8Array([0x03, 0x04]), b("...[Content_Types].xml...word/document.xml..."));
const xlsx = concat(b("PK"), new Uint8Array([0x03, 0x04]), b("...[Content_Types].xml...xl/worksheets/..."));
const docLegacy = concat(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), b("WordDocument"));
const svg = b("<?xml version='1.0'?><svg onload='alert(1)'>x</svg>");
const html = b("<!DOCTYPE html><html><body>x</body></html>");
const plain = b("مراجعه بیمار برای معاینه ثبت شد");
const binary = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe]);

describe("sniffMagicBytes", () => {
  it("انواع مجاز را از روی بایت تشخیص میدهد", () => {
    expect(sniffMagicBytes(pdf)).toEqual({ mime: "application/pdf", rule: "pdf" });
    expect(sniffMagicBytes(png)).toEqual({ mime: "image/png", rule: "png" });
    expect(sniffMagicBytes(jpeg)).toEqual({ mime: "image/jpeg", rule: "jpeg" });
    expect(sniffMagicBytes(gif)).toEqual({ mime: "image/gif", rule: "gif" });
    expect(sniffMagicBytes(webp)).toEqual({ mime: "image/webp", rule: "webp" });
    expect(sniffMagicBytes(tiff)).toEqual({ mime: "image/tiff", rule: "tiff" });
    expect(sniffMagicBytes(dicom)).toEqual({ mime: "image/dicom", rule: "dicom" });
    expect(sniffMagicBytes(docx).mime).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(sniffMagicBytes(xlsx).mime).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(sniffMagicBytes(docLegacy)).toEqual({ mime: "application/msword", rule: "doc" });
    expect(sniffMagicBytes(plain)).toEqual({ mime: "text/plain", rule: "text" });
  });
  it("محتوای فعال و ناشناخته رد میشوند", () => {
    expect(sniffMagicBytes(svg)).toMatchObject({ mime: "image/svg+xml", rule: "svg" });
    expect(sniffMagicBytes(html)).toMatchObject({ mime: "text/html", rule: "html" });
    expect(sniffMagicBytes(binary)).toEqual({ mime: "application/octet-stream", rule: "unknown" });
  });
});

describe("normalizeMime", () => {
  it("پارامترها و حروف را نرمال میکند", () => {
    expect(normalizeMime("text/plain; charset=utf-8")).toBe("text/plain");
    expect(normalizeMime("  IMAGE/PNG ")).toBe("image/png");
  });
});

describe("analyzeFile", () => {
  it("فایل معتبر پذیرفته میشود (MIME ادعایی فقط چک سازگاری)", () => {
    expect(analyzeFile({ bytes: pdf, bucket: "chat", declaredMime: "application/pdf" })).toMatchObject({ ok: true, code: "OK" });
    expect(analyzeFile({ bytes: plain, bucket: "chat", declaredMime: "text/plain; charset=utf-8" }).ok).toBe(true);
    expect(analyzeFile({ bytes: png, bucket: "chat" }).ok).toBe(true);
  });
  it("خالی / بزرگتر از سقف رد میشوند", () => {
    expect(analyzeFile({ bytes: b(""), bucket: "chat" }).code).toBe("EMPTY");
    expect(analyzeFile({ bytes: new Uint8Array(MAX_FILE_BYTES + 1), bucket: "chat" }).code).toBe("TOO_LARGE");
    expect(analyzeFile({ bytes: png, bucket: "chat", maxBytes: 2 }).code).toBe("TOO_LARGE");
    // اندازه‌ی واقعی از HEAD است، نه طول پیشوند تشخیص
    expect(analyzeFile({ bytes: png, size: MAX_FILE_BYTES + 1, bucket: "chat" }).code).toBe("TOO_LARGE");
    expect(analyzeFile({ bytes: png, size: Number.NaN, bucket: "chat" }).code).toBe("EMPTY");
  });
  it("MIME ادعای کلاینت نمیتواند مجوز بدهد و محتوای فعال رد میشود", () => {
    expect(analyzeFile({ bytes: svg, bucket: "chat", declaredMime: "image/png" }).code).toBe("ACTIVE_CONTENT");
    expect(analyzeFile({ bytes: html, bucket: "chat", declaredMime: "text/plain" }).code).toBe("ACTIVE_CONTENT");
    expect(analyzeFile({ bytes: binary, bucket: "chat", declaredMime: "image/png" }).code).toBe("MIME_NOT_ALLOWED");
  });
  it("لیست مجاز بر اساس bucket اعمال میشود", () => {
    expect(analyzeFile({ bytes: xlsx, bucket: "records" }).ok).toBe(true);
    expect(analyzeFile({ bytes: xlsx, bucket: "chat" }).code).toBe("MIME_NOT_ALLOWED");
    expect(analyzeFile({ bytes: dicom, bucket: "records" }).ok).toBe(true);
    expect(analyzeFile({ bytes: dicom, bucket: "chat" }).code).toBe("MIME_NOT_ALLOWED");
  });
  it("ادعای ناسازگار ⇒ MIME_MISMATCH", () => {
    expect(analyzeFile({ bytes: pdf, bucket: "chat", declaredMime: "image/png" })).toMatchObject({ ok: false, code: "MIME_MISMATCH" });
  });
});

describe("quarantine state machine", () => {
  it("انتقالهای مجاز", () => {
    expect(transition("PENDING", "START_SCAN")).toBe("SCANNING");
    expect(transition("SCANNING", "CLEAN")).toBe("APPROVED");
    expect(transition("SCANNING", "DIRTY")).toBe("REJECTED");
    expect(transition("SCANNING", "ERROR")).toBe("REJECTED");
    expect(transition("PENDING", "REJECT")).toBe("REJECTED");
  });
  it("انتقالهای غیرمجاز و حالتهای نهایی ⇒ خطا", () => {
    expect(canTransition("PENDING", "CLEAN")).toBe(false);
    expect(canTransition("APPROVED", "START_SCAN")).toBe(false);
    expect(canTransition("REJECTED", "CLEAN")).toBe(false);
    for (const [from, event] of [["PENDING", "CLEAN"], ["APPROVED", "REJECT"], ["REJECTED", "DIRTY"]] as const) {
      expect(() => transition(from, event)).toThrowError(FileSecurityError);
    }
    expect(() => transition("APPROVED", "CLEAN")).toThrow(/invalid transition/);
  });
  it("فقط APPROVED قابل ارائه است", () => {
    expect(canServe("APPROVED")).toBe(true);
    for (const state of ["PENDING", "SCANNING", "REJECTED"] as const) expect(canServe(state)).toBe(false);
    expect(() => assertServable("APPROVED")).not.toThrow();
    for (const state of ["PENDING", "SCANNING", "REJECTED"] as const) {
      expect(() => assertServable(state)).toThrowError(FileSecurityError);
    }
  });
  it("وضعیت اولیه و نگاشت verdict", () => {
    expect(initialState({ ok: true })).toBe("PENDING");
    expect(initialState({ ok: false })).toBe("REJECTED");
    expect(verdictToEvent("CLEAN")).toBe("CLEAN");
    expect(verdictToEvent("INFECTED")).toBe("DIRTY");
    expect(verdictToEvent("ERROR")).toBe("ERROR"); // fail-closed
  });
});

describe("PHI-safe logging", () => {
  const KEY = "chat/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.pdf";
  it("کلید معتبر پذیرفته و کلید نامعتبر پوشانده میشود", () => {
    expect(safeObjectKey(KEY)).toBe(KEY);
    expect(safeObjectKey("chat/ali/reza/../patient.pdf")).toBe("<invalid-key>");
    expect(safeObjectKey("records/../../etc/passwd")).toBe("<invalid-key>");
  });
  it("نام فایل بیمار هرگز وارد لاگ نمیشود — فقط پسوند", () => {
    expect(safeExtension("Ali_Reza_1380_دندانپزشکی.pdf")).toBe(".pdf");
    expect(safeExtension("NoExtension")).toBe("<none>");
    expect(safeExtension("trailing.")).toBe("<none>");
    const ctx = safeLogContext(KEY, "Ali_Reza_1380_دندانپزشکی.pdf");
    expect(ctx).toEqual({ objectKey: KEY, ext: ".pdf" });
    expect(JSON.stringify(ctx)).not.toContain("Ali_Reza");
    expect(JSON.stringify(ctx)).not.toContain("دندانپزشکی");
  });
  it("کد تصمیم و قانون هم غیر PHIاند", () => {
    const d = analyzeFile({ bytes: pdf, bucket: "chat" });
    expect(decisionLogContext(d, KEY, "patient-name.pdf")).toMatchObject({ code: "OK", rule: "pdf", ext: ".pdf" });
  });
});

describe("crossCheckWithFileType", () => {
  const loaderWith = (mime: string | null): SnifferLoader => () => (async () => ({ mime })) as ExternalSniffer;
  it("نبود بسته ⇒ بررسی نشده، بدون تناقض", async () => {
    await expect(crossCheckWithFileType(pdf, () => null)).resolves.toEqual({
      checked: false, externalMime: null, detectedMime: "application/pdf", conflict: false,
    });
  });
  it("توافق ⇒ بدون تناقض", async () => {
    expect((await crossCheckWithFileType(pdf, loaderWith("application/pdf"))).conflict).toBe(false);
  });
  it("تناقض ⇒fail-closed", async () => {
    expect(await crossCheckWithFileType(pdf, loaderWith("text/html"))).toMatchObject({ checked: true, conflict: true });
  });
  it("MIME عمومی یا خطای sniffer ⇒ تناقض محسوب نمیشود", async () => {
    expect((await crossCheckWithFileType(docx, loaderWith("application/zip"))).conflict).toBe(false);
    const throwing: SnifferLoader = () => (async () => { throw new Error("boom"); }) as ExternalSniffer;
    expect((await crossCheckWithFileType(pdf, throwing)).conflict).toBe(false);
    expect((await crossCheckWithFileType(pdf, (() => { throw new Error("boom"); }) as SnifferLoader)).conflict).toBe(false);
  });
});
