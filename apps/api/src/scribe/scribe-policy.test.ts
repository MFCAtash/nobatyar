import { describe, expect, it } from "vitest";
import { DRAFT_BANNER, draftFromTranscript, redactPii } from "./scribe-policy";

describe("redactPii", () => {
  it("شماره موبایل، کد ملی و ایمیل حذف میشوند", () => {
    const out = redactPii("بیمار 09123456789 با کد ملی 1234567890 و ایمیل a@b.com مراجعه کرد");
    expect(out).not.toContain("09123456789");
    expect(out).not.toContain("1234567890");
    expect(out).not.toContain("a@b.com");
    expect(out).toContain("[phone]");
    expect(out).toContain("[id-number]");
    expect(out).toContain("[email]");
  });
  it("تاریخ تولد و شماره پرونده پاک میشود", () => {
    expect(redactPii("تاریخ تولد 1370/01/01") ).toContain("[حذفشده]");
    expect(redactPii("شماره پرونده AB-12345") ).toContain("[حذفشده]");
  });
});

describe("draftFromTranscript", () => {
  it("دستهای SOAP را بر اساس کلمات کلیدی پر میکند و همیشه بنر بازبینی دارد", () => {
    const text = "بیمار میگوید سردرد و سرگیجه دارد از دیروز. فشار خون 120/80 و نبض 80 ثبت شد. به نظر میرسد میگرن باشد. توصیه میشود دارو مصرف و پیگیری شود.";
    const d = draftFromTranscript(text);
    expect(d.subjective).toContain(DRAFT_BANNER);
    expect(d.subjective).toContain("سردرد");
    expect(d.objective).toContain("فشار خون");
    expect(d.assessment).toContain("میگرن");
    expect(d.plan).toContain("پیگیری");
    expect(d.patientSummary.length).toBeGreaterThan(0);
  });
  it("ورودی خام در خروجی باقی نمیماند", () => {
    expect(JSON.stringify(draftFromTranscript("09123456789"))).not.toContain("09123456789");
  });
  it("متن خالی خروجی خالی میدهد", () => {
    expect(draftFromTranscript("   ")).toEqual({ subjective: "", objective: "", assessment: "", plan: "", patientSummary: "" });
  });
});
