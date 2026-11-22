import { describe, expect, it } from "vitest";
import {
  containsAscii, hasPdfEof, hasZipEntry, isSafePlainText, isUtf8, latin1, looksLikeActiveText, startsWith,
} from "./file-analysis";

const b = (s: string): Uint8Array => new TextEncoder().encode(s);
const concat = (...parts: Uint8Array[]): Uint8Array => Uint8Array.from(parts.flatMap((p) => Array.from(p)));

describe("startsWith", () => {
  it("رشته و آرایه بایت و آفست را پشتیبانی میکند", () => {
    expect(startsWith(b("hello world"), "hello")).toBe(true);
    expect(startsWith(b("hello world"), "world", 6)).toBe(true);
    expect(startsWith(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), [0x89, 0x50, 0x4e, 0x47])).toBe(true);
  });
  it("آفست منفی یا خارج از محدوده ⇒ false", () => {
    expect(startsWith(b("abc"), "a", -1)).toBe(false);
    expect(startsWith(b("abc"), "abcd")).toBe(false);
    expect(startsWith(b("abc"), "bc", 2)).toBe(false);
  });
});

describe("containsAscii", () => {
  it("جستجوی حساس و غیرحساس به حروف", () => {
    expect(containsAscii(b("WordDocument stream"), "WordDocument")).toBe(true);
    expect(containsAscii(b("WORDDOCUMENT stream"), "worddocument", true)).toBe(true);
    expect(containsAscii(b("WORDDOCUMENT stream"), "worddocument", false)).toBe(false);
    expect(containsAscii(b("abc"), "")).toBe(false);
    expect(containsAscii(b("abc"), "abcd")).toBe(false);
  });
});

describe("latin1 / isUtf8", () => {
  it("نمایش Latin-1 پنجره‌ی بایت", () => {
    expect(latin1(new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0x3e]))).toBe("<svg>");
    expect(latin1(b("abcdef"), 2, 4)).toBe("cd");
  });
  it("UTF-8 معتبر از نامعتبر تشخیص داده میشود", () => {
    expect(isUtf8(b("سلام دنیا"))).toBe(true);
    expect(isUtf8(new Uint8Array([0xff, 0xfe, 0xfd]))).toBe(false);
    expect(isUtf8(new Uint8Array([0xe2, 0x82]))).toBe(false); // توالی ناقص
  });
});

describe("isSafePlainText", () => {
  it("متن ساده‌ی معمولی پذیرفته میشود", () => {
    expect(isSafePlainText(b("Hello\nworld\t123"))).toBe(true);
    expect(isSafePlainText(b("گزارش ویزیت بیمار"))).toBe(true);
  });
  it("خالی، نول، کنترل کاراکتر و UTF-8 نامعتبر رد میشوند", () => {
    expect(isSafePlainText(b(""))).toBe(false);
    expect(isSafePlainText(new Uint8Array([0x61, 0x00, 0x62]))).toBe(false);
    expect(isSafePlainText(new Uint8Array([0x61, 0x01, 0x62]))).toBe(false);
    expect(isSafePlainText(new Uint8Array([0xff, 0xfe]))).toBe(false);
  });
  it("محتوای فعال (SVG/HTML/Script) حتی با ظاهر متن رد میشود", () => {
    expect(isSafePlainText(b("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBe(false);
    expect(isSafePlainText(b("<!DOCTYPE html><html></html>"))).toBe(false);
    expect(isSafePlainText(b("plain <script>alert(1)</script> text"))).toBe(false);
    expect(looksLikeActiveText(b("<IMG SRC=x ONERROR=alert(1)>"))).toBe(true);
  });
});

describe("per-format helpers", () => {
  it("ورودی ZIP و نشاننده‌ی EOF/pdf", () => {
    const docx = concat(b("PK"), new Uint8Array([0x03, 0x04]), b("...[Content_Types].xml...word/document.xml..."));
    expect(hasZipEntry(docx, "[Content_Types].xml")).toBe(true);
    expect(hasZipEntry(docx, "word/")).toBe(true);
    expect(hasZipEntry(docx, "xl/")).toBe(false);
    expect(hasPdfEof(b("%PDF-1.7\n...\n%%EOF\n"))).toBe(true);
    expect(hasPdfEof(b("%PDF-1.7\nno trailer"))).toBe(false);
  });
});
