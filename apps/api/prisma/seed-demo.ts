/**
 * ساخت دادهٔ نمایشی کامل: درمانگاه‌ها، پزشکان متخصص، بیماران و نوبت‌های پیش‌فرض.
 *
 * اصول:
 *  - فقط در غیر production اجرا می‌شود (seed.ts این را تضمین می‌کند).
 *  - idempotent: اجرای چندبارهٔ seed نوبت/پروفایل تکراری نمی‌سازد.
 *  - پروفایل‌های باقی‌مانده از تست‌های خودکار (نام‌هایی مثل «دکتر x7k2p1») به نام فارسی
 *    معمولی تغییر می‌کنند تا دمو همیشه تمیز بماند.
 *  - تاریخ نوبت‌ها نسبی است؛ دمو با گذشت زمان کهنه نمی‌شود.
 */
import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { aad, type FieldCrypto } from "../src/crypto/field-crypto";
import { normalizeIranMobile } from "../src/crypto/phone";
import {
  CLINIC_SPECIALTY, DEMO_APPOINTMENTS, DEMO_CLINICS, DEMO_DOCTORS, DEMO_PATIENTS,
  FALLBACK_DOCTOR_NAMES, FALLBACK_PATIENT_NAMES, JUNK_NAME_RE, PERSIAN_NAME_RE,
} from "../src/admin/demo-data";
import { parseHHmm, tehranDateOf, tehranLocalToUtc } from "../src/scheduling/slots";

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** UUID پایدار از یک کلید ثابت (برای idempotency و AAD ثابت). */
export function uuidFrom(key: string): string {
  const hex = createHash("sha256").update(key).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

function localInstant(dayOffset: number, hhmm: string): Date {
  const today = tehranDateOf(new Date());
  const base = new Date(Date.UTC(today.y, today.m - 1, today.d + dayOffset));
  return tehranLocalToUtc(
    { y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate() },
    parseHHmm(hhmm),
  );
}

function isJunkName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  if (!n) return true;
  if (JUNK_NAME_RE.test(n)) return true;
  return !PERSIAN_NAME_RE.test(n);
}

async function upsertUser(tx: Tx, crypto: FieldCrypto, phone: string, role: "PATIENT" | "DOCTOR"): Promise<string> {
  const norm = normalizeIranMobile(phone)!;
  const phoneHash = crypto.blindIndex(norm, "phone");
  const existing = await tx.user.findUnique({ where: { phoneHash }, select: { id: true, role: true, status: true } });
  if (existing) {
    if (existing.role !== role || existing.status !== "ACTIVE") {
      await tx.user.update({ where: { id: existing.id }, data: { role, status: "ACTIVE" } });
    }
    return existing.id;
  }
  const id = randomUUID();
  await tx.user.create({
    data: { id, role, phoneHash, phoneEnc: crypto.encrypt(norm, aad("users", id, "phone")) },
  });
  return id;
}

export async function seedDemoRoster(tx: Tx, crypto: FieldCrypto): Promise<void> {
  await tx.$queryRaw`SELECT set_config('app.role', 'SYSTEM', true)`;

  const specialtyRows = await tx.specialty.findMany({ select: { id: true, slug: true } });
  const specialtyBySlug = new Map(specialtyRows.map((s) => [s.slug, s.id]));

  // ── پزشکان ────────────────────────────────────────────────────────────────
  const doctorIds = new Map<string, string>();
  for (const d of DEMO_DOCTORS) {
    const userId = await upsertUser(tx, crypto, d.phone, "DOCTOR");
    doctorIds.set(d.phone, userId);
    const clinic = DEMO_CLINICS[d.clinic];

    await tx.doctorProfile.upsert({
      where: { userId },
      create: {
        userId,
        fullName: d.fullName,
        bio: d.bio,
        consultationFeeRial: BigInt(d.feeRial),
        slotMinutes: d.slotMinutes,
        autoConfirm: d.autoConfirm ?? false,
        acceptsSecondOpinions: d.acceptsSecondOpinions ?? false,
        isListed: true,
        clinicName: clinic.name,
        clinicAddress: clinic.address,
        clinicPhone: clinic.phone,
      },
      update: {
        fullName: d.fullName,
        bio: d.bio,
        consultationFeeRial: BigInt(d.feeRial),
        slotMinutes: d.slotMinutes,
        autoConfirm: d.autoConfirm ?? false,
        acceptsSecondOpinions: d.acceptsSecondOpinions ?? false,
        isListed: true,
        clinicName: clinic.name,
        clinicAddress: clinic.address,
        clinicPhone: clinic.phone,
      },
    });

    const specialtyId = specialtyBySlug.get(d.specialty);
    await tx.doctorSpecialty.deleteMany({ where: { doctorId: userId } });
    if (specialtyId) await tx.doctorSpecialty.create({ data: { doctorId: userId, specialtyId } });

    await tx.availabilityRule.deleteMany({ where: { doctorId: userId } });
    await tx.availabilityRule.createMany({
      data: d.days.flatMap((weekday) =>
        d.windows.map(([startTime, endTime]) => ({ doctorId: userId, weekday, startTime, endTime })),
      ),
    });

    const approved = await tx.doctorVerification.count({ where: { doctorId: userId, status: "APPROVED" } });
    if (approved === 0) {
      await tx.doctorVerification.create({
        data: {
          doctorId: userId,
          status: "APPROVED",
          documentKey: `verification/demo/${userId}.pdf`,
          reviewedAt: new Date(),
          note: "تأیید خودکار دادهٔ نمایشی (غیر production)",
        },
      });
    }
  }

  // ── بیماران ───────────────────────────────────────────────────────────────
  const patientIds = new Map<string, string>();
  for (const p of DEMO_PATIENTS) {
    const userId = await upsertUser(tx, crypto, p.phone, "PATIENT");
    patientIds.set(p.phone, userId);
    await tx.patientProfile.upsert({
      where: { userId },
      create: { userId, fullName: p.fullName, gender: p.gender },
      update: { fullName: p.fullName, gender: p.gender },
    });
  }

  // ── تمیزکاری پروفایل‌های باقی‌مانده از تست‌ها ────────────────────────────
  await normalizeLeftovers(tx, new Set(doctorIds.values()), new Set(patientIds.values()), specialtyBySlug);

  // ── نوبت‌ها ───────────────────────────────────────────────────────────────
  const feeByDoctor = new Map<string, number>(DEMO_DOCTORS.map((d) => [d.phone, d.feeRial]));
  for (const a of DEMO_APPOINTMENTS) {
    const doctorId = doctorIds.get(a.doctorPhone);
    const patientId = patientIds.get(a.patientPhone);
    if (!doctorId || !patientId) continue;

    const id = uuidFrom(`appointment:${a.key}`);
    const startsAt = localInstant(a.dayOffset, a.time);
    const endsAt = new Date(startsAt.getTime() + a.durationMin * 60_000);
    const reasonEnc = crypto.encrypt(a.reason, aad("appointments", id, "reason"));
    const holdExpiresAt = a.status === "PENDING_PAYMENT" ? new Date(Date.now() + 30 * 60_000) : null;
    const data = {
      doctorId,
      patientId,
      startsAt,
      endsAt,
      status: a.status,
      kind: a.kind,
      priceRial: BigInt(feeByDoctor.get(a.doctorPhone) ?? 0),
      reasonEnc,
      holdExpiresAt,
    } as const;

    await tx.appointment.upsert({ where: { id }, create: { id, ...data }, update: data });

    await tx.appointmentStatusHistory.deleteMany({ where: { appointmentId: id } });
    await tx.appointmentStatusHistory.create({
      data: { appointmentId: id, fromStatus: null, toStatus: a.status, actorId: patientId, at: startsAt },
    });

    if (a.paid) {
      const existing = await tx.payment.findUnique({ where: { appointmentId: id }, select: { id: true } });
      if (!existing) {
        const paymentId = uuidFrom(`payment:${a.key}`);
        const paidAt = new Date(Math.min(Date.now() - 3_600_000, startsAt.getTime() - 3_600_000));
        await tx.payment.create({
          data: {
            id: paymentId,
            appointmentId: id,
            gatewayRef: `SEED-${a.key}`,
            gateway: "SANDBOX",
            idempotencyKey: `seed:${a.key}`,
            amountRial: BigInt(feeByDoctor.get(a.doctorPhone) ?? 0),
            status: "PAID",
            paidAt,
            appointmentSyncedAt: paidAt,
          },
        });
        await tx.paymentAttempt.create({
          data: {
            id: uuidFrom(`attempt:${a.key}`),
            paymentId,
            gateway: "SANDBOX",
            authority: `seed-${a.key}`,
            amountRial: BigInt(feeByDoctor.get(a.doctorPhone) ?? 0),
            status: "VERIFIED",
            refId: `SEED-${a.key}`,
            verifiedAt: paidAt,
            cardPanMasked: "****1234",
          },
        });
      }
    }

    if (a.status === "CONFIRMED" || a.status === "IN_PROGRESS" || a.status === "COMPLETED") {
      await tx.conversation.upsert({
        where: { appointmentId: id },
        create: { appointmentId: id, patientId, doctorId },
        update: {},
      });
    }
  }

  console.log(
    `demo roster: ${DEMO_DOCTORS.length} پزشک، ${DEMO_PATIENTS.length} بیمار، ${DEMO_CLINICS.length} درمانگاه، ${DEMO_APPOINTMENTS.length} نوبت`,
  );
}

/** پروفایل‌های تستی باقی‌مانده را به نام فارسی معمولی تغییر می‌دهد و فیلدهای خالی را کامل می‌کند. */
async function normalizeLeftovers(
  tx: Tx,
  rosterDoctors: Set<string>,
  rosterPatients: Set<string>,
  specialtyBySlug: Map<string, number>,
): Promise<void> {
  const slugList = [...specialtyBySlug.keys()];
  const clinicList = DEMO_CLINICS;

  const usedDoctorNames = new Set(DEMO_DOCTORS.map((d) => d.fullName));
  let doctorCursor = 0;
  const nextDoctorName = (): string => {
    while (doctorCursor < FALLBACK_DOCTOR_NAMES.length) {
      const candidate = `دکتر ${FALLBACK_DOCTOR_NAMES[doctorCursor++]}`;
      if (!usedDoctorNames.has(candidate)) {
        usedDoctorNames.add(candidate);
        return candidate;
      }
    }
    throw new Error("FALLBACK_DOCTOR_NAMES تمام شد؛ نام‌های بیشتری به demo-data اضافه کنید.");
  };

  const doctors = await tx.doctorProfile.findMany({
    where: { userId: { notIn: [...rosterDoctors] } },
    orderBy: { createdAt: "asc" },
    select: {
      userId: true, fullName: true, bio: true, clinicName: true, consultationFeeRial: true, isListed: true,
      specialties: { select: { specialty: { select: { slug: true } } } },
      _count: { select: { availability: true } },
    },
  });

  for (const [i, d] of doctors.entries()) {
    // درمانگاه موجود را حفظ می‌کنیم؛ در غیر این صورت یکی از درمانگاه‌های دمو.
    const knownClinicIndex = clinicList.findIndex((c) => c.name === d.clinicName);
    const clinicIndex = knownClinicIndex >= 0 ? knownClinicIndex : i % clinicList.length;
    const clinic = clinicList[clinicIndex];

    const patch: Record<string, unknown> = {};
    if (isJunkName(d.fullName) || usedDoctorNames.has(d.fullName)) patch.fullName = nextDoctorName();
    else usedDoctorNames.add(d.fullName);
    if (!d.bio?.trim()) patch.bio = "پزشک همکار نوبت‌یار؛ ویزیت حضوری و آنلاین با پذیرش نوبت.";
    if (!d.clinicName?.trim()) {
      patch.clinicName = clinic.name;
      patch.clinicAddress = clinic.address;
      patch.clinicPhone = clinic.phone;
    }
    if (d.consultationFeeRial === 0n) patch.consultationFeeRial = 2_500_000n;
    if (!d.isListed) patch.isListed = true;
    if (Object.keys(patch).length > 0) await tx.doctorProfile.update({ where: { userId: d.userId }, data: patch });

    // تخصص هم‌خوان با درمانگاه (نه انتخاب تصادفی) تا پروفایل جانشین هم منطقی باشد.
    const defaultSlug = CLINIC_SPECIALTY[clinicIndex] ?? slugList[i % slugList.length];
    const currentSlugs = d.specialties.map((s) => s.specialty.slug);
    if (defaultSlug && !currentSlugs.includes(defaultSlug)) {
      const specialtyId = specialtyBySlug.get(defaultSlug);
      if (specialtyId) {
        await tx.doctorSpecialty.deleteMany({ where: { doctorId: d.userId } });
        await tx.doctorSpecialty.create({ data: { doctorId: d.userId, specialtyId } });
      }
    }
    if (d._count.availability === 0) {
      await tx.availabilityRule.createMany({
        data: [0, 1, 2, 3, 4].map((weekday) => ({ doctorId: d.userId, weekday, startTime: "09:00", endTime: "13:00" })),
      });
    }
  }

  const usedPatientNames = new Set(DEMO_PATIENTS.map((p) => p.fullName));
  let patientCursor = 0;
  const nextPatientName = (): string => {
    while (patientCursor < FALLBACK_PATIENT_NAMES.length) {
      const candidate = FALLBACK_PATIENT_NAMES[patientCursor++];
      if (!usedPatientNames.has(candidate)) {
        usedPatientNames.add(candidate);
        return candidate;
      }
    }
    throw new Error("FALLBACK_PATIENT_NAMES تمام شد؛ نام‌های بیشتری به demo-data اضافه کنید.");
  };

  const patients = await tx.patientProfile.findMany({
    where: { userId: { notIn: [...rosterPatients] } },
    orderBy: { createdAt: "asc" },
    select: { userId: true, fullName: true, gender: true },
  });

  for (const [i, p] of patients.entries()) {
    const patch: Record<string, unknown> = {};
    if (isJunkName(p.fullName) || usedPatientNames.has(p.fullName)) patch.fullName = nextPatientName();
    else usedPatientNames.add(p.fullName);
    if (!p.gender) patch.gender = i % 2 === 0 ? "female" : "male";
    if (Object.keys(patch).length > 0) await tx.patientProfile.update({ where: { userId: p.userId }, data: patch });
  }
}
