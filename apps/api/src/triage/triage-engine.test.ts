import { describe, expect, it } from "vitest";
import { COMPLAINTS, FLAG_BY_ID, GLOBAL_RED_FLAGS, URGENCY_RANK } from "./triage-catalog";
import { applicableFlags, mergeEnhancement, runTriage, validateTriageInput } from "./triage-engine";
import type { TriageInput } from "./triage-engine";

const base = (o: Partial<TriageInput> = {}): TriageInput => ({
  ageYears: 30, sex: "MALE", symptoms: [{ code: "cough_cold", severity: 1 }], redFlags: [], ...o,
});
const rank = (i: TriageInput) => URGENCY_RANK[runTriage(i).urgency];

describe("triage — پایه", () => {
  it("سرماخوردگی خفیف ⇒ مراقبت در منزل و بدون پیشنهاد ویزیت", () => {
    const r = runTriage(base());
    expect(r.urgency).toBe("SELF_CARE");
    expect(r.suggestedKind).toBe("NONE");
    expect(r.emergencyContacts).toHaveLength(0);
    expect(r.adviceFa.length).toBeGreaterThan(1);
    expect(r.disclaimerFa).toContain("۱۱۵");
  });

  it("درد قفسه سینه به‌تنهایی ⇒ حداقل URGENT و ویزیت حضوری", () => {
    const r = runTriage(base({ symptoms: [{ code: "chest_pain", severity: 1 }] }));
    expect(r.urgency).toBe("URGENT");
    expect(r.suggestedKind).toBe("IN_PERSON");
    expect(r.specialties[0].slug).toBe("cardiology");
  });

  it("درد قفسه سینه در سن ≥۶۵ ⇒ EMERGENCY", () => {
    expect(runTriage(base({ ageYears: 70, symptoms: [{ code: "chest_pain", severity: 1 }] })).urgency).toBe("EMERGENCY");
    expect(runTriage(base({ ageYears: 64, symptoms: [{ code: "chest_pain", severity: 1 }] })).urgency).toBe("URGENT");
  });

  it("EMERGENCY: شماره‌های اضطراری و پیام «منتظر نوبت نمانید»", () => {
    const r = runTriage(base({ redFlags: ["g_breathing"] }));
    expect(r.urgency).toBe("EMERGENCY");
    expect(r.suggestedKind).toBe("EMERGENCY");
    expect(r.emergencyContacts.map((c) => c.number)).toContain("115");
    expect(r.adviceFa.join(" ")).toContain("منتظر نوبت");
    expect(r.redFlagsHit[0].id).toBe("g_breathing");
  });

  it("تب در شیرخوار زیر ۱ سال ⇒ حداقل URGENT؛ تخصص کودکان در رتبه‌ها", () => {
    const r = runTriage(base({ ageYears: 0, symptoms: [{ code: "fever", severity: 1 }] }));
    expect(r.urgency).toBe("URGENT");
    expect(r.specialties.map((s) => s.slug)).toContain("pediatrics");
  });

  it("بارداری + درد شکم ⇒ URGENT و زنان در تخصص‌ها", () => {
    const r = runTriage(base({ sex: "FEMALE", pregnant: true, symptoms: [{ code: "abdominal_pain", severity: 1 }] }));
    expect(r.urgency).toBe("URGENT");
    expect(r.specialties.map((s) => s.slug)).toContain("gynecology");
  });

  it("شدت ۳ یک پله بالا می‌برد ولی هرگز به‌تنهایی EMERGENCY نمی‌سازد", () => {
    expect(runTriage(base({ symptoms: [{ code: "cough_cold", severity: 3 }] })).urgency).toBe("ROUTINE");
    expect(runTriage(base({ symptoms: [{ code: "headache", severity: 3 }] })).urgency).toBe("SOON");
    expect(runTriage(base({ symptoms: [{ code: "chest_pain", severity: 3 }] })).urgency).toBe("URGENT");
  });

  it("مدت > ۱۴ روز سرماخوردگی را از SELF_CARE به ROUTINE می‌برد", () => {
    expect(runTriage(base({ symptoms: [{ code: "cough_cold", severity: 1, durationDays: 20 }] })).urgency).toBe("ROUTINE");
    expect(runTriage(base({ symptoms: [{ code: "cough_cold", severity: 1, durationDays: 14 }] })).urgency).toBe("SELF_CARE");
  });

  it("سه علامت هم‌زمان ⇒ حداقل SOON", () => {
    const r = runTriage(base({ symptoms: [{ code: "cough_cold", severity: 1 }, { code: "sore_throat_ear", severity: 1 }, { code: "skin_rash", severity: 1 }] }));
    expect(URGENCY_RANK[r.urgency]).toBeGreaterThanOrEqual(URGENCY_RANK.SOON);
  });

  it("خروجی قطعی است (دو بار اجرا = یکسان)", () => {
    const i = base({ symptoms: [{ code: "headache", severity: 2 }, { code: "dizziness", severity: 2 }], redFlags: ["ha_vision"] });
    expect(runTriage(i)).toEqual(runTriage(i));
  });
});

describe("triage — قراردادهای ایمنی (ویژگی‌محور)", () => {
  const complaintCodes = COMPLAINTS.map((c) => c.code);

  it("هر پرچم EMERGENCY (عمومی یا اختصاصی) با هر علامتی ⇒ EMERGENCY", () => {
    const emergency = [...FLAG_BY_ID.values()].filter((f) => f.level === "EMERGENCY");
    expect(emergency.length).toBeGreaterThan(10);
    for (const f of emergency) for (const code of complaintCodes) {
      for (const severity of [1, 2, 3] as const) {
        expect(runTriage(base({ symptoms: [{ code, severity }], redFlags: [f.id] })).urgency).toBe("EMERGENCY");
      }
    }
  });

  it("یکنواختی: افزودن هر پرچم/علامت/شدت هرگز فوریت را کم نمی‌کند", () => {
    for (const c of COMPLAINTS) for (const age of [0, 8, 30, 70]) {
      const b = base({ ageYears: age, symptoms: [{ code: c.code, severity: 1 }] });
      const r0 = rank(b);
      for (const f of FLAG_BY_ID.keys()) expect(rank({ ...b, redFlags: [f] })).toBeGreaterThanOrEqual(r0);
      expect(rank({ ...b, symptoms: [{ code: c.code, severity: 3 }] })).toBeGreaterThanOrEqual(r0);
      expect(rank({ ...b, symptoms: [{ code: c.code, severity: 1, durationDays: 30 }] })).toBeGreaterThanOrEqual(r0);
      for (const other of complaintCodes.filter((x) => x !== c.code)) {
        expect(rank({ ...b, symptoms: [...b.symptoms, { code: other, severity: 1 }] })).toBeGreaterThanOrEqual(r0);
      }
    }
  });

  it("سطح فوریت هر پرچم در نتیجه کمتر از سطح خود پرچم نیست", () => {
    for (const f of FLAG_BY_ID.values()) {
      expect(rank(base({ redFlags: [f.id] }))).toBeGreaterThanOrEqual(URGENCY_RANK[f.level]);
    }
  });

  it("کاتالوگ سالم: شناسه‌ها یکتا، هر شکایت حداقل یک تخصص، پرچم‌ها متن دارند", () => {
    const ids = [...GLOBAL_RED_FLAGS, ...COMPLAINTS.flatMap((c) => c.redFlags)].map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of COMPLAINTS) { expect(c.specialties.length).toBeGreaterThan(0); expect(c.labelFa.length).toBeGreaterThanOrEqual(2); }
    for (const f of FLAG_BY_ID.values()) expect(f.textFa.length).toBeGreaterThan(5);
    expect(new Set(COMPLAINTS.map((c) => c.code)).size).toBe(COMPLAINTS.length);
  });
});

describe("triage — اعتبارسنجی ورودی", () => {
  it("ورودی نامعتبر خطا می‌دهد", () => {
    expect(validateTriageInput(base({ ageYears: -1 }))).toContain("age_invalid");
    expect(validateTriageInput(base({ ageYears: 20.5 }))).toContain("age_invalid");
    expect(validateTriageInput(base({ symptoms: [] }))).toContain("symptoms_required");
    expect(validateTriageInput(base({ symptoms: [{ code: "nope", severity: 1 }] }))[0]).toContain("unknown_symptom");
    expect(validateTriageInput(base({ redFlags: ["x"] }))[0]).toContain("unknown_flag");
    expect(validateTriageInput(base({ pregnant: true, sex: "MALE" }))).toContain("pregnancy_requires_female");
    expect(validateTriageInput(base({ symptoms: [{ code: "cough_cold", severity: 1 }, { code: "cough_cold", severity: 2 }] })).join()).toContain("duplicate_symptom");
    expect(validateTriageInput(base({ symptoms: ["cough_cold", "skin_rash", "headache", "fever"].map((code) => ({ code, severity: 1 as const })) }))).toContain("too_many_symptoms");
    expect(() => runTriage(base({ ageYears: 999 }))).toThrow(/invalid triage input/);
  });

  it("applicableFlags: پرچم کودک فقط برای ≤۱۴ سال", () => {
    const kid = applicableFlags({ ageYears: 5, symptoms: [{ code: "fever", severity: 1 }] });
    const adult = applicableFlags({ ageYears: 30, symptoms: [{ code: "fever", severity: 1 }] });
    expect(kid.global.map((f) => f.id)).toContain("g_child_lethargy");
    expect(adult.global.map((f) => f.id)).not.toContain("g_child_lethargy");
    expect(adult.specific.map((f) => f.id)).toContain("fv_purpura");
  });
});

describe("mergeEnhancement — افزونه هرگز فوریت را کم نمی‌کند", () => {
  const known = new Set(["general", "cardiology", "neurology"]);
  const low = () => runTriage(base());
  const high = () => runTriage(base({ redFlags: ["g_breathing"] }));

  it("بالا بردن مجاز است و توصیه‌ها هم‌خوان می‌شوند", () => {
    const r = mergeEnhancement(low(), { urgency: "URGENT" }, known);
    expect(r.urgency).toBe("URGENT");
    expect(r.suggestedKind).toBe("IN_PERSON");
    expect(r.adviceFa.join(" ")).not.toContain("احتمالاً با مراقبت");
  });

  it("پایین آوردن نادیده گرفته می‌شود", () => {
    const r = mergeEnhancement(high(), { urgency: "SELF_CARE" }, known);
    expect(r.urgency).toBe("EMERGENCY");
    expect(r.emergencyContacts.length).toBeGreaterThan(0);
  });

  it("مقدار نامعتبر، یادداشت بلند و تخصص ناشناس مهار می‌شوند", () => {
    const r = mergeEnhancement(low(), { urgency: "BOGUS" as never, notesFa: ["x".repeat(1000), "  ", "ok"], specialties: ["evil", "neurology"] }, known);
    expect(r.urgency).toBe("SELF_CARE");
    expect(r.reasonsFa.some((n) => n.length === 300)).toBe(true);
    expect(r.specialties.map((s) => s.slug)).toContain("neurology");
    expect(r.specialties.map((s) => s.slug)).not.toContain("evil");
  });

  it("null/undefined ⇒ بدون تغییر", () => {
    const b = low();
    expect(mergeEnhancement(b, null, known)).toBe(b);
  });
});
