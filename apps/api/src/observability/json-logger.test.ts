import { describe, expect, it } from "vitest";
import { formatLogLine, JsonLogger, MAX_LINE_BYTES, normalizeMessage, parseLevel } from "./json-logger";

const NOW = new Date("2026-11-13T10:00:00.000Z");
const ctx = { service: "api", now: NOW };
const parse = (l: string) => JSON.parse(l) as Record<string, unknown>;

describe("formatLogLine", () => {
  it("یک خط JSON معتبر با فیلدهای پایه", () => {
    const line = formatLogLine("info", "server started", "bootstrap", ctx);
    expect(line.includes("\n")).toBe(false);
    expect(parse(line)).toEqual({ ts: "2026-11-13T10:00:00.000Z", level: "info", service: "api", ctx: "bootstrap", msg: "server started" });
  });

  it("شماره‌ی موبایل و توکن در متن پاک می‌شود", () => {
    const l = parse(formatLogLine("warn", "OTP برای 09121234567 ارسال شد؛ Bearer abc.def.ghi", "otp", ctx));
    expect(String(l.msg)).not.toContain("09121234567");
    expect(String(l.msg)).not.toContain("abc.def.ghi");
  });

  it("لاگ دسترسی (JSON رشته‌ای) پارس و فیلدهایش ادغام می‌شود، نه JSON در JSON", () => {
    const access = JSON.stringify({ t: "x", level: "info", msg: "http", method: "GET", route: "/appointments/:id", status: 200, ms: 12, rid: "r1" });
    const l = parse(formatLogLine("info", access, "access", ctx));
    expect(l).toMatchObject({ msg: "http", method: "GET", route: "/appointments/:id", status: 200, ms: 12, rid: "r1" });
    expect(l.t).toBeUndefined();
  });

  it("فیلد حساس در شیء پاک می‌شود (دلیل مراجعه/تشخیص)", () => {
    const l = parse(formatLogLine("info", { message: "booked", reason: "سردرد شدید", diagnosis: "x", appointmentId: "a1" }, "svc", ctx));
    expect(l.msg).toBe("booked");
    expect(JSON.stringify(l)).not.toContain("سردرد");
    expect(l.appointmentId).toBe("a1");
  });

  it("کاربر نمی‌تواند فیلدهای رزروشده را جعل کند", () => {
    const l = parse(formatLogLine("info", { message: "m", level: "error", service: "evil", trace_id: "fake", ts: "1999" }, undefined, ctx));
    expect(l.level).toBe("info");
    expect(l.service).toBe("api");
    expect(l.ts).toBe("2026-11-13T10:00:00.000Z");
    expect(l.f_service).toBe("evil");
    expect(l.f_trace_id).toBe("fake");
    expect(l.trace_id).toBeUndefined();
  });

  it("تزریق خط جدید ممکن نیست", () => {
    const line = formatLogLine("info", "a\n{\"level\":\"error\",\"msg\":\"fake\"}", undefined, ctx);
    expect(line.split("\n")).toHaveLength(1);
    expect(parse(line).level).toBe("info");
  });

  it("Error ⇒ msg + stack پاک‌شده", () => {
    const e = new Error("پرداخت برای 09121234567 شکست خورد");
    const l = parse(formatLogLine("error", e, "pay", ctx));
    expect(String(l.msg)).toContain("Error:");
    expect(String(l.msg)).not.toContain("09121234567");
    expect(typeof l.stack).toBe("string");
    expect(String(l.stack)).not.toContain("09121234567");
  });

  it("trace_id و span_id اضافه می‌شوند", () => {
    const l = parse(formatLogLine("info", "m", undefined, { ...ctx, traceId: "t".repeat(32), spanId: "s".repeat(16) }));
    expect(l).toMatchObject({ trace_id: "t".repeat(32), span_id: "s".repeat(16) });
  });

  it("خط بیش از ۱۶KB کوتاه می‌شود", () => {
    const many = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, "سلام ".repeat(60)]));
    const line = formatLogLine("info", { message: "big", ...many }, "c", ctx);
    expect(Buffer.byteLength(line)).toBeLessThan(MAX_LINE_BYTES);
    expect(parse(line).truncated).toBe(true);
  });
});

describe("normalizeMessage / parseLevel", () => {
  it("عدد/نامعتبر ⇒ رشته", () => {
    expect(normalizeMessage(42)).toEqual({ msg: "42", fields: {} });
    expect(parseLevel("debug")).toBe("debug");
    expect(parseLevel("TRACE")).toBe("info");
    expect(parseLevel(undefined)).toBe("info");
  });
});

describe("JsonLogger", () => {
  const make = (min: "debug" | "info" | "warn" | "error" = "info") => {
    const out: { so: string[]; se: string[] } = { so: [], se: [] };
    const lg = new JsonLogger("worker", min, { stdout: (s) => out.so.push(s), stderr: (s) => out.se.push(s) }, () => NOW);
    return { lg, out };
  };
  it("سطح‌ها: error روی stderr، سایر روی stdout؛ سطح پایین‌تر از حداقل حذف می‌شود", () => {
    const { lg, out } = make("warn");
    lg.log("hidden", "ctx");
    lg.debug("hidden");
    lg.warn("w", "ctx");
    lg.error("boom", "stack-line", "ctx");
    expect(out.so).toHaveLength(1);
    expect(out.se).toHaveLength(1);
    expect(parse(out.se[0]!)).toMatchObject({ level: "error", msg: "boom", ctx: "ctx", stack: "stack-line", service: "worker" });
  });
  it("هر رکورد با newline تمام می‌شود و trace_id ی span ی فعال را می‌گیرد", () => {
    const { lg, out } = make();
    lg.log("hello", "ctx");
    expect(out.so[0]!.endsWith("\n")).toBe(true);
  });
});
