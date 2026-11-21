import { describe, expect, it } from "vitest";
import { normalizeIranMobile } from "../crypto/phone";
import {
  CLINIC_SPECIALTY, DEMO_APPOINTMENTS, DEMO_CLINICS, DEMO_DOCTORS, DEMO_PATIENTS,
  FALLBACK_DOCTOR_NAMES, FALLBACK_PATIENT_NAMES, JUNK_NAME_RE, PERSIAN_NAME_RE, SPECIALTIES,
} from "./demo-data";

const doctorNames = DEMO_DOCTORS.map((d) => d.fullName);
const patientNames = DEMO_PATIENTS.map((p) => p.fullName);
const specialtySlugs = new Set(SPECIALTIES.map(([slug]) => slug));

describe("داده‌های نمایشی", () => {
  it("نام پزشکان فارسی، یکتا و با پیشوند «دکتر» است", () => {
    expect(new Set(doctorNames).size).toBe(doctorNames.length);
    for (const n of doctorNames) {
      expect(n.startsWith("دکتر ")).toBe(true);
      expect(PERSIAN_NAME_RE.test(n.replace(/^دکتر /, ""))).toBe(true);
      expect(JUNK_NAME_RE.test(n)).toBe(false);
    }
  });

  it("نام بیماران فارسی و یکتا است", () => {
    expect(new Set(patientNames).size).toBe(patientNames.length);
    for (const n of patientNames) {
      expect(PERSIAN_NAME_RE.test(n)).toBe(true);
      expect(JUNK_NAME_RE.test(n)).toBe(false);
    }
  });

  it("نام‌های جایگزین با roster تداخل ندارند", () => {
    expect(FALLBACK_DOCTOR_NAMES.filter((n) => doctorNames.includes(`دکتر ${n}`))).toEqual([]);
    expect(FALLBACK_PATIENT_NAMES.filter((n) => patientNames.includes(n))).toEqual([]);
    expect(new Set(FALLBACK_DOCTOR_NAMES).size).toBe(FALLBACK_DOCTOR_NAMES.length);
    expect(new Set(FALLBACK_PATIENT_NAMES).size).toBe(FALLBACK_PATIENT_NAMES.length);
  });

  it("شماره‌ها معتبر و یکتا هستند", () => {
    const phones = [...DEMO_DOCTORS.map((d) => d.phone), ...DEMO_PATIENTS.map((p) => p.phone)];
    expect(new Set(phones).size).toBe(phones.length);
    for (const p of phones) expect(normalizeIranMobile(p)).toBeTruthy();
  });

  it("تخصص و درمانگاه هر پزشک معتبر و هم‌خوان است", () => {
    expect(CLINIC_SPECIALTY).toHaveLength(DEMO_CLINICS.length);
    for (const slug of CLINIC_SPECIALTY) expect(specialtySlugs.has(slug)).toBe(true);

    for (const d of DEMO_DOCTORS) {
      expect(specialtySlugs.has(d.specialty)).toBe(true);
      expect(DEMO_CLINICS[d.clinic]).toBeTruthy();
      expect(d.windows.length).toBeGreaterThan(0);
      for (const [s, e] of d.windows) expect(s < e).toBe(true);
      for (const wd of d.days) {
        expect(wd).toBeGreaterThanOrEqual(0);
        expect(wd).toBeLessThanOrEqual(6);
      }
    }

    // هر درمانگاه باید دست‌کم یک پزشک با تخصص پیش‌فرض خود داشته باشد؛
    // درمانگاه‌های چندتخصصی (مثل درمانگاه شبانه‌روزی) می‌توانند پزشک دیگری هم داشته باشند.
    for (const [index, slug] of CLINIC_SPECIALTY.entries()) {
      expect(DEMO_DOCTORS.some((d) => d.clinic === index && d.specialty === slug)).toBe(true);
    }
  });

  it("هر نوبت به پزشک/بیمار موجود اشاره می‌کند و کلیدها یکتا هستند", () => {
    const phones = new Set([...DEMO_DOCTORS.map((d) => d.phone), ...DEMO_PATIENTS.map((p) => p.phone)]);
    const keys = new Set<string>();
    for (const a of DEMO_APPOINTMENTS) {
      expect(phones.has(a.doctorPhone)).toBe(true);
      expect(phones.has(a.patientPhone)).toBe(true);
      expect(keys.has(a.key)).toBe(false);
      keys.add(a.key);
      expect(a.durationMin).toBeGreaterThan(0);
      expect(/^([01]\d|2[0-3]):[0-5]\d$/.test(a.time)).toBe(true);
    }
  });
});
