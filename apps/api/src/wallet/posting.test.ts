import { describe, expect, it } from "vitest";
import { validatePosting } from "./posting";

describe("validatePosting", () => {
  it("دو قلم متوازن را میپذیرد", () => {
    expect(validatePosting({ lines: [
      { direction: "DEBIT", amountRial: 10n },
      { direction: "CREDIT", amountRial: 10n },
    ] })).toEqual({ ok: true });
  });

  it("عدم تعادل رد میشود", () => {
    expect(validatePosting({ lines: [
      { direction: "DEBIT", amountRial: 10n },
      { direction: "CREDIT", amountRial: 9n },
    ] })).toEqual({ ok: false, error: "unbalanced_posting" });
  });

  it("مبلغ صفر رد میشود", () => {
    expect(validatePosting({ lines: [
      { direction: "DEBIT", amountRial: 0n },
      { direction: "CREDIT", amountRial: 0n },
    ] })).toEqual({ ok: false, error: "invalid_amount" });
  });

  it("چند قلم بدهکار و بستانکار collect میشود", () => {
    expect(validatePosting({ lines: [
      { direction: "DEBIT", amountRial: 3n },
      { direction: "DEBIT", amountRial: 4n },
      { direction: "CREDIT", amountRial: 7n },
    ] })).toEqual({ ok: true });
  });
});
