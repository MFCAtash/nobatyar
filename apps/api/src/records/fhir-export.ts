import type { RecordCategory, VitalType } from "@prisma/client";

/**
 * خروجی FHIR R4 (International Patient Summary-scoped Bundle).
 * تابع خالص است: تمام رمزگشاییها در لایه سرویس انجام شده و فقط دادههای مجاز به اینجا میرسند.
 * هیچ فراخوانی خارجی وجود ندارد؛ خروجی کاملاً در حاکمیت داده تولید میشود.
 */
export interface FhirPatientInput {
  id: string;
  fullName: string;
  phone?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  bloodType?: string | null;
}
export interface FhirVitalInput {
  id: string; type: VitalType; valuePrimary: number; valueSecondary: number | null; unit: string; measuredAt: Date;
}
export interface FhirDiagnosisInput { code?: string | null; text: string; resolved?: boolean }
export interface FhirRecordInput { id: string; title: string; category: RecordCategory; visitDate: Date | null; createdAt: Date; contentText?: string }
export interface FhirMedicationInput { name: string }
export interface FhirAllergyInput { name: string }
export interface FhirBundleInput {
  patient: FhirPatientInput;
  vitals: FhirVitalInput[];
  diagnoses: FhirDiagnosisInput[];
  records: FhirRecordInput[];
  medications: FhirMedicationInput[];
  allergies: FhirAllergyInput[];
  now: Date;
}

const LOINC: Partial<Record<VitalType, { code: string; display: string }>> = {
  BLOOD_PRESSURE: { code: "85354-9", display: "Blood pressure panel" },
  BLOOD_GLUCOSE: { code: "2339-0", display: "Glucose [Mass/volume] in Blood" },
  WEIGHT: { code: "29463-7", display: "Body weight" },
  HEART_RATE: { code: "8867-4", display: "Heart rate" },
  BODY_TEMPERATURE: { code: "8310-5", display: "Body temperature" },
  OXYGEN_SATURATION: { code: "2708-6", display: "Oxygen saturation in Arterial blood" },
};

type Fhir = Record<string, unknown>;

const ucum = (unit: string): string => ({ mmHg: "mm[Hg]", "mg/dL": "mg/dL", kg: "kg", bpm: "/min", "°C": "Cel", "%": "%" })[unit] ?? unit;

function observation(v: FhirVitalInput, patientId: string): Fhir {
  const coding = LOINC[v.type] ?? { code: "loinc-unknown", display: v.type };
  const base: Fhir = {
    resourceType: "Observation",
    id: v.id,
    status: "final",
    category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs", display: "Vital Signs" }] }],
    code: { coding: [{ system: "http://loinc.org", code: coding.code, display: coding.display }] },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: v.measuredAt.toISOString(),
  };
  if (v.type === "BLOOD_PRESSURE") {
    base.component = [
      { code: { coding: [{ system: "http://loinc.org", code: "8480-6", display: "Systolic blood pressure" }] }, valueQuantity: { value: v.valuePrimary, unit: v.unit, system: "http://unitsofmeasure.org", code: "mm[Hg]" } },
      { code: { coding: [{ system: "http://loinc.org", code: "8462-4", display: "Diastolic blood pressure" }] }, valueQuantity: { value: v.valueSecondary, unit: v.unit, system: "http://unitsofmeasure.org", code: "mm[Hg]" } },
    ];
  } else {
    base.valueQuantity = { value: v.valuePrimary, unit: v.unit, system: "http://unitsofmeasure.org", code: ucum(v.unit) };
  }
  return base;
}

export function buildFhirBundle(input: FhirBundleInput): Fhir {
  const p = input.patient;
  const patient: Fhir = {
    resourceType: "Patient",
    id: p.id,
    identifier: [{ system: "urn:nobatyar:patient-id", value: p.id }],
    name: [{ text: p.fullName, family: p.fullName.split(/\s+/).slice(-1)[0], given: p.fullName.split(/\s+/).slice(0, -1) }],
    ...(p.phone ? { telecom: [{ system: "phone", value: p.phone, use: "mobile" }] } : {}),
    ...(p.birthDate ? { birthDate: p.birthDate } : {}),
    ...(p.gender ? { gender: ["male", "female", "other", "unknown"].includes(p.gender.toLowerCase()) ? p.gender.toLowerCase() : "unknown" } : {}),
    ...(p.bloodType ? { extension: [{ url: "http://hl7.org/fhir/StructureDefinition/patient-bloodType", valueCodeableConcept: { text: p.bloodType } }] } : {}),
  };
  const ref = { reference: `Patient/${p.id}` };
  const entries: Fhir[] = [
    { fullUrl: `urn:uuid:${p.id}`, resource: patient },
  ];

  for (const v of input.vitals) entries.push({ fullUrl: `urn:uuid:${v.id}`, resource: observation(v, p.id) });

  for (const [i, d] of input.diagnoses.entries()) {
    entries.push({
      fullUrl: `urn:uuid:condition-${i}`,
      resource: {
        resourceType: "Condition",
        clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: d.resolved ? "resolved" : "active" }] },
        verificationStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: "confirmed" }] },
        ...(d.code ? { code: { coding: [{ system: "http://hl7.org/fhir/sid/icd-10", code: d.code }], text: d.text } } : { code: { text: d.text } }),
        subject: ref,
        recordedDate: input.now.toISOString(),
      },
    });
  }

  for (const [i, m] of input.medications.entries()) {
    entries.push({
      fullUrl: `urn:uuid:medication-${i}`,
      resource: { resourceType: "MedicationStatement", status: "active", medicationCodeableConcept: { text: m.name }, subject: ref, effectiveDateTime: input.now.toISOString() },
    });
  }

  for (const [i, a] of input.allergies.entries()) {
    entries.push({
      fullUrl: `urn:uuid:allergy-${i}`,
      resource: { resourceType: "AllergyIntolerance", clinicalStatus: { coding: [{ code: "active" }] }, verificationStatus: { coding: [{ code: "confirmed" }] }, code: { text: a.name }, patient: ref },
    });
  }

  for (const r of input.records) {
    entries.push({
      fullUrl: `urn:uuid:${r.id}`,
      resource: {
        resourceType: "DocumentReference",
        id: r.id,
        status: "current",
        type: { text: r.category },
        subject: ref,
        date: (r.visitDate ?? r.createdAt).toISOString(),
        content: [{
          attachment: {
            title: r.title, contentType: "text/plain",
            ...(r.contentText ? { data: Buffer.from(r.contentText, "utf8").toString("base64") } : {}),
          },
        }],
        context: { period: { start: r.createdAt.toISOString() } },
      },
    });
  }

  entries.push({
    fullUrl: `urn:uuid:composition-${p.id}`,
    resource: {
      resourceType: "Composition",
      status: "final",
      type: { coding: [{ system: "http://loinc.org", code: "60593-1", display: "Medication summary Document" }] },
      subject: ref,
      date: input.now.toISOString(),
      author: [{ display: "Nobatyar" }],
      title: "خلاصه پرونده سلامت نوبتیار",
      section: [
        { title: "تشخیصها", entry: input.diagnoses.map((_, i) => ({ reference: `Condition/${i}` })) },
        { title: "اندازهگیریها", entry: input.vitals.map((v) => ({ reference: `Observation/${v.id}` })) },
        { title: "مدارک", entry: input.records.map((r) => ({ reference: `DocumentReference/${r.id}` })) },
      ],
    },
  });

  return {
    resourceType: "Bundle",
    id: `nby-${p.id}`,
    type: "collection",
    timestamp: input.now.toISOString(),
    identifier: { system: "urn:nobatyar:fhir", value: p.id },
    meta: {
      profile: ["http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips"],
      security: [{ system: "http://terminology.hl7.org/CodeSystem/v3-Confidentiality", code: "R", display: "restricted" }],
    },
    entry: entries,
  };
}
