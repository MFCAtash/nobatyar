import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { recordingConsentHash } from "./room-policy";

// پرچم M8 قبل از بارگذاری سرویس فعال میشود (MODULE_FLAGS در زمان import خوانده میشود).
process.env.FF_M8_VIDEO_SMART = "true";
const { RoomPolicyService } = await import("./room-policy.service");

const APPT = "appt-1";
const PATIENT = "patient-1";
const DOCTOR = "doctor-1";

function hashFor(userId: string) {
  return createHash("sha256").update(recordingConsentHash(APPT, userId)).digest("hex");
}

/** پروندهٔ دروغین تنها برای اثبات رفتار سرویس بدون نیاز به LiveKit/DB واقعی. */
function makePrisma(receipts: Array<{ userId: string; hash: string; policy: string; version: string }> = []) {
  const tx = {
    appointment: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === APPT
          ? { id: APPT, patientId: PATIENT, doctorId: DOCTOR, kind: "VIDEO", startsAt: new Date(), status: "CONFIRMED" }
          : null,
    },
    videoRoomPolicy: {
      findUnique: async () => null,
      upsert: async () => ({ appointmentId: APPT }),
    },
    consentReceipt: {
      findMany: async ({ where }: { where: { userId?: { in: string[] } } }) =>
        receipts.filter((r) => !where.userId || where.userId.in.includes(r.userId)).map((r) => ({ userId: r.userId, hash: r.hash })),
      create: async () => ({ id: "receipt-1" }),
    },
  };
  const withContext = async <T>(_ctx: unknown, fn: (t: typeof tx) => Promise<T>): Promise<T> => fn(tx);
  return { withContext } as unknown as PrismaService;
}

const audit = { log: async () => undefined } as never;

describe("M8 room policy service — consent ledger", () => {
  it("never allows recording with only one side's consent", async () => {
    const prisma = makePrisma([
      { userId: PATIENT, hash: hashFor(PATIENT), policy: "VIDEO_RECORDING", version: "1" },
    ]);
    const svc = new RoomPolicyService(prisma, audit);
    const user = { id: PATIENT, role: "PATIENT" as const, sid: "s", iatMs: 0 };
    const out = await svc.get(user, APPT);
    expect(out.consent).toEqual({ patient: true, doctor: false });
    expect(out.recordingAllowed).toBe(false);
  });

  it("allows recording only when both receipts are bound to this appointment", async () => {
    const prisma = makePrisma([
      { userId: PATIENT, hash: hashFor(PATIENT), policy: "VIDEO_RECORDING", version: "1" },
      { userId: DOCTOR, hash: hashFor(DOCTOR), policy: "VIDEO_RECORDING", version: "1" },
      { userId: DOCTOR, hash: createHash("sha256").update("other-appointment").digest("hex"), policy: "VIDEO_RECORDING", version: "1" },
    ]);
    const svc = new RoomPolicyService(prisma, audit);
    const out = await svc.get({ id: DOCTOR, role: "DOCTOR", sid: "s", iatMs: 0 }, APPT);
    expect(out.consent).toEqual({ patient: true, doctor: true });
  });

  it("keeps the patient in the waiting room by default", async () => {
    const svc = new RoomPolicyService(makePrisma(), audit);
    const out = await svc.gate({ id: PATIENT, role: "PATIENT", sid: "s", iatMs: 0 }, APPT, false);
    expect(out.gate).toBe("wait");
  });
});
