import { describe, expect, it } from "vitest";
import { buildFhirBundle } from "./fhir-export";

const now = new Date("2026-01-01T00:00:00.000Z");
const input = {
  patient: { id: "p1", fullName: "علی احمدی", phone: "09123456789", birthDate: "1990-05-01", gender: "male", bloodType: "A+" },
  vitals: [
    { id: "v1", type: "BLOOD_PRESSURE" as const, valuePrimary: 120, valueSecondary: 80, unit: "mmHg", measuredAt: now },
    { id: "v2", type: "BLOOD_GLUCOSE" as const, valuePrimary: 95, valueSecondary: null, unit: "mg/dL", measuredAt: now },
  ],
  diagnoses: [{ code: "R51", text: "سردرد" }],
  records: [{ id: "r1", title: "آزمایش خون", category: "LAB_RESULT" as const, visitDate: now, createdAt: now }],
  medications: [{ name: "استامینوفن" }],
  allergies: [{ name: "پنی سیلین" }],
  now,
};

describe("buildFhirBundle", () => {
  const bundle = buildFhirBundle(input) as { resourceType: string; type: string; entry: { resource: Record<string, unknown> }[] };

  it("Bundle ی FHIR R4 معتبر با Patient و Composition", () => {
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("collection");
    const resources = bundle.entry.map((e) => e.resource.resourceType);
    expect(resources).toContain("Patient");
    expect(resources).toContain("Composition");
  });

  it("Observation فشار خون دارای component سیستولیک/دیاستولیک LOINC است", () => {
    const obs = bundle.entry.find((e) => e.resource.id === "v1")!.resource as { component: { code: { coding: { code: string }[] } }[] };
    expect(obs.component.map((c) => c.code.coding[0]!.code)).toEqual(["8480-6", "8462-4"]);
  });

  it("Conditions، MedicationStatement، AllergyIntolerance و DocumentReference موجوداند", () => {
    const types = bundle.entry.map((e) => e.resource.resourceType);
    expect(types).toContain("Condition");
    expect(types).toContain("MedicationStatement");
    expect(types).toContain("AllergyIntolerance");
    expect(types).toContain("DocumentReference");
  });

  it("Subjectها به Patient ارجاع میدهند", () => {
    const cond = bundle.entry.find((e) => e.resource.resourceType === "Condition")!.resource as { subject: { reference: string } };
    expect(cond.subject.reference).toBe("Patient/p1");
  });

  it("خروجی قابل JSON شدن و فاقد undefined است", () => {
    const s = JSON.stringify(bundle);
    expect(s).not.toContain("undefined");
    expect(JSON.parse(s)).toBeTruthy();
  });
});
