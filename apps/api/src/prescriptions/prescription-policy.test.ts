import { describe, expect, it } from "vitest";
import { checkAllergies, DEFAULT_RX_CONFIG as cfg, planCancel, planIssue, rxNumberFromBytes, RX_NUMBER_RE, rxView } from "./prescription-policy";
import type { IssueFacts, RxItem } from "./prescription-policy";

const ends = new Date("2026-10-20T10:20:00Z");
const day = (d: number) => new Date(ends.getTime() + d * 86_400_000);
const item = (o: Partial<RxItem> = {}): RxItem => ({ drugName: "Amoxicillin 500", dose: "یک کپسول", frequency: "هر ۸ ساعت", durationDays: 7, quantity: 21, ...o });
const facts = (o: Partial<IssueFacts> = {}): IssueFacts => ({
  appointmentStatus: "IN_PROGRESS", endsAt: ends, userId: "d", doctorId: "d", items: [item({ drugName: "Acetaminophen" })], allergies: [], acknowledgedWarnings: false, ...o,
});

describe("checkAllergies", () => {
  it("تطابق مستقیم نام، با تفاوت نگارشی فارسی/لاتین", () => {
    expect(checkAllergies([{ drugName: "Aspirin 80mg" }], ["aspirin"])).toHaveLength(1);
    expect(checkAllergies([{ drugName: "آموکسی‌سیلین ۵۰۰" }], ["آموكسي سيلين"])).toHaveLength(1);
  });
  it("حساسیت متقاطع هم‌گروه: پنی‌سیلین ⇒ آموکسی‌سیلین، آسپرین ⇒ ایبوپروفن، سولفا ⇒ کوتریموکسازول", () => {
    expect(checkAllergies([{ drugName: "Amoxicillin" }], ["پنی‌سیلین"])[0].reasonFa).toContain("پنی‌سیلین");
    expect(checkAllergies([{ drugName: "Ibuprofen 400" }], ["آسپرین"])).toHaveLength(1);
    expect(checkAllergies([{ drugName: "Co-trimoxazole" }], ["sulfa"])).toHaveLength(1);
  });
  it("بدون هشدار: غیرمرتبط، خیلی کوتاه، گروه متفاوت", () => {
    expect(checkAllergies([{ drugName: "Amoxicillin" }], ["گردو", "غبار"])).toHaveLength(0);
    expect(checkAllergies([{ drugName: "Amoxicillin" }], ["a", "ab"])).toHaveLength(0);
    expect(checkAllergies([{ drugName: "Azithromycin" }], ["پنی‌سیلین"])).toHaveLength(0);
    expect(checkAllergies([{ drugName: "Paracetamol" }], [])).toHaveLength(0);
  });
});

describe("planIssue", () => {
  it("صدور معتبر: ۳۰ روز پیش‌فرض", () => {
    const p = planIssue(facts(), ends, cfg);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.validUntil.toISOString()).toBe(day(30).toISOString());
  });
  it("فقط پزشک همان نوبت؛ وضعیت و پنجره‌ی زمانی", () => {
    expect(planIssue(facts({ userId: "p" }), ends)).toMatchObject({ ok: false, error: "not_participant" });
    expect(planIssue(facts({ appointmentStatus: "CONFIRMED" }), ends)).toMatchObject({ ok: false, error: "invalid_state" });
    expect(planIssue(facts({ appointmentStatus: "COMPLETED" }), day(7), cfg).ok).toBe(true);
    expect(planIssue(facts({ appointmentStatus: "COMPLETED" }), new Date(day(7).getTime() + 1), cfg)).toMatchObject({ ok: false, error: "window_closed" });
  });
  it("اقلام نامعتبر: خالی، بیش از ۱۰، تکراری، مدت/تعداد/دوز", () => {
    const bad = (items: RxItem[]) => planIssue(facts({ items }), ends);
    expect(bad([])).toMatchObject({ error: "invalid_items", details: ["no_items"] });
    expect(bad(Array.from({ length: 11 }, (_, i) => item({ drugName: `d${i}` })))).toMatchObject({ error: "invalid_items" });
    expect(bad([item(), item({ drugName: "amoxicillin  500" })]).ok).toBe(false);
    expect(bad([item({ durationDays: 0 })]).ok).toBe(false);
    expect(bad([item({ quantity: 1000 })]).ok).toBe(false);
    expect(bad([item({ dose: " " })]).ok).toBe(false);
    expect(bad([item({ drugName: " " })]).ok).toBe(false);
  });
  it("اعتبار نسخه: ۱..۹۰ روز", () => {
    expect(planIssue(facts({ validDays: 90 }), ends, cfg).ok).toBe(true);
    expect(planIssue(facts({ validDays: 91 }), ends, cfg)).toMatchObject({ error: "invalid_validity" });
    expect(planIssue(facts({ validDays: 0 }), ends, cfg)).toMatchObject({ error: "invalid_validity" });
  });
  it("هشدار حساسیت: بدون تأیید ⇒ 409؛ با تأیید صریح ⇒ ثبت همراه هشدار", () => {
    const f = facts({ items: [item()], allergies: ["پنی‌سیلین"] });
    const blocked = planIssue(f, ends, cfg);
    expect(blocked).toMatchObject({ ok: false, error: "allergy_warning" });
    if (!blocked.ok) expect(blocked.warnings).toHaveLength(1);
    const ack = planIssue({ ...f, acknowledgedWarnings: true }, ends, cfg);
    expect(ack.ok).toBe(true);
    if (ack.ok) expect(ack.warnings).toHaveLength(1);
  });
});

describe("وضعیت، ابطال، شماره‌ی نسخه", () => {
  it("rxView", () => {
    const until = day(30);
    expect(rxView("ISSUED", until, day(1))).toBe("ACTIVE");
    expect(rxView("ISSUED", until, until)).toBe("EXPIRED");
    expect(rxView("CANCELLED", until, day(1))).toBe("CANCELLED");
  });
  it("planCancel", () => {
    expect(planCancel({ status: "ISSUED", userId: "d", doctorId: "d", reason: "اشتباه در دوز" })).toEqual({ ok: true });
    expect(planCancel({ status: "ISSUED", userId: "p", doctorId: "d", reason: "اشتباه در دوز" })).toEqual({ ok: false, error: "not_participant" });
    expect(planCancel({ status: "CANCELLED", userId: "d", doctorId: "d", reason: "اشتباه در دوز" })).toEqual({ ok: false, error: "already_cancelled" });
    expect(planCancel({ status: "ISSUED", userId: "d", doctorId: "d", reason: "ab" })).toEqual({ ok: false, error: "reason_required" });
  });
  it("rxNumberFromBytes: قالب ثابت و بدون حروف مبهم", () => {
    const n = rxNumberFromBytes(Uint8Array.from([0, 1, 2, 3, 250, 251, 252, 253]));
    expect(RX_NUMBER_RE.test(n)).toBe(true);
    for (let i = 0; i < 200; i++) {
      const b = Uint8Array.from({ length: 8 }, () => Math.floor(Math.random() * 256));
      const s = rxNumberFromBytes(b);
      expect(RX_NUMBER_RE.test(s)).toBe(true);
      expect(/[ILO01U]/.test(s.slice(3))).toBe(false);
    }
    expect(() => rxNumberFromBytes(new Uint8Array(4))).toThrow();
  });
});

describe("checkAllergies: نام تجاری و گروه‌های تازه", () => {
  const w = (d: string, a: string) => checkAllergies([{ drugName: d }], [a]).length;
  it("نام تجاری هم‌گروه", () => {
    expect(w("Brufen 400", "ایبوپروفن")).toBe(1);
    expect(w("بروفن", "ibuprofen")).toBe(1);
    expect(w("Amoxil", "پنی‌سیلین")).toBe(1);
  });
  it("اپیوئیدها و سولفای غیرآنتی‌بیوتیک", () => {
    expect(w("Tramadol", "morphine")).toBe(1);
    expect(w("Furosemide", "sulfa")).toBe(1);
  });
  it("واکنش متقاطع پنی‌سیلین ↔ سفالوسپورین هشدار می‌دهد", () => {
    expect(w("Cefixime", "پنی‌سیلین")).toBe(1);
    expect(w("Amoxicillin", "cephalexin")).toBe(1);
  });
  it("بدون ارتباط ⇒ بدون هشدار", () => {
    expect(w("Acetaminophen", "ibuprofen")).toBe(0);
  });
});
