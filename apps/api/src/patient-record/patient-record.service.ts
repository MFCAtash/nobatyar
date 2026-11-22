import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { moduleEnabled } from "../common/feature-flags";
import { aad, FIELD_CRYPTO, type FieldCrypto } from "../crypto";
import { PrismaService } from "../prisma/prisma.service";
import { encryptExport, type EncryptedExport } from "./export-crypto";
import { normalizeItems, reconcile, type MedicationItem } from "./medications";
import {
  groupByKind,
  parseMeasurement,
  trendOf,
  validateRange,
  type TimelineKind,
  type TimelinePoint,
} from "./timeline";
import type { AddTimelineInput, ReconcileInput } from "./patient-record.schemas";

function requireFlag() {
  if (!moduleEnabled("FF_M9_PATIENT_RECORD")) throw new BadRequestException({ error: "module_disabled" });
}

const pointAad = (id: string) => aad("health_timeline_points", id, "value_enc");
const medsAad = (id: string) => aad("medication_reconciliations", id, "items_enc");

interface StoredPoint {
  kind: TimelineKind;
  primary: number;
  secondary?: number;
  unit: string;
}

@Injectable()
export class PatientRecordService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private run<T>(user: AuthUser, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.withContext({ role: user.role, userId: user.id }, fn);
  }

  async addPoint(user: AuthUser, input: AddTimelineInput) {
    requireFlag();
    let m;
    try {
      m = parseMeasurement(input.kind, input.value, input.unit);
    } catch (e) {
      throw new BadRequestException({ error: "invalid_measurement", message: (e as Error).message });
    }
    const at = input.at ? new Date(input.at) : new Date();
    if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 86_400_000) {
      throw new BadRequestException({ error: "invalid_at" });
    }

    const id = randomUUID();
    const payload: StoredPoint = { kind: m.kind, primary: m.primary, secondary: m.secondary, unit: m.unit };
    const valueEnc = this.crypto.encrypt(Buffer.from(JSON.stringify(payload), "utf-8"), pointAad(id));

    await this.run(user, (tx) =>
      tx.healthTimelinePoint.create({ data: { id, patientId: user.id, kind: m.kind, valueEnc, at } }),
    );
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "health.timeline.add",
      objectType: "health_timeline_points",
      objectId: id,
      meta: { kind: m.kind }, // بدون مقدار بالینی
    });
    return { id, kind: m.kind, at: at.toISOString(), primary: m.primary, secondary: m.secondary, unit: m.unit };
  }

  async timeline(user: AuthUser, q: { kind?: TimelineKind; from?: string; to?: string }) {
    requireFlag();
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 365 * 86_400_000);
    const to = q.to ? new Date(q.to) : new Date();
    try {
      validateRange(from, to);
    } catch (e) {
      throw new BadRequestException({ error: "invalid_range", message: (e as Error).message });
    }

    const rows = await this.run(user, (tx) =>
      tx.healthTimelinePoint.findMany({
        where: { patientId: user.id, at: { gte: from, lte: to }, ...(q.kind ? { kind: q.kind } : {}) },
        orderBy: { at: "asc" },
        take: 2000,
      }),
    );

    const points: TimelinePoint[] = [];
    for (const r of rows) {
      try {
        const v = JSON.parse(this.crypto.decrypt(r.valueEnc, pointAad(r.id)).toString("utf-8")) as StoredPoint;
        points.push({ id: r.id, kind: v.kind, at: r.at.toISOString(), primary: v.primary, secondary: v.secondary, unit: v.unit });
      } catch {
        // رکورد خراب/کلید قدیمی: نادیده گرفته می‌شود تا کل تایم‌لاین از کار نیفتد (لاگ بدون PHI).
      }
    }
    const grouped = groupByKind(points);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      points,
      grouped,
      trends: {
        WEIGHT: trendOf(grouped.WEIGHT),
        BP: trendOf(grouped.BP),
        GLUCOSE: trendOf(grouped.GLUCOSE),
        LAB: trendOf(grouped.LAB),
      },
    };
  }

  async reconcileMedications(user: AuthUser, input: ReconcileInput) {
    requireFlag();
    const latest = await this.run(user, (tx) =>
      tx.medicationReconciliation.findFirst({
        where: { patientId: user.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, itemsEnc: true },
      }),
    );
    let previous: MedicationItem[] = [];
    if (latest) {
      try {
        previous = JSON.parse(this.crypto.decrypt(latest.itemsEnc, medsAad(latest.id)).toString("utf-8"));
      } catch {
        previous = [];
      }
    }

    const result = reconcile(previous, input.items);
    const id = randomUUID();
    const itemsEnc = this.crypto.encrypt(Buffer.from(JSON.stringify(result.items), "utf-8"), medsAad(id));
    await this.run(user, (tx) =>
      tx.medicationReconciliation.create({
        data: { id, patientId: user.id, itemsEnc, reviewedBy: input.reviewedBy ?? null },
      }),
    );
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "health.medications.reconcile",
      objectType: "medication_reconciliations",
      objectId: id,
      meta: { items: result.items.length, warnings: result.warnings.length },
    });
    return { id, ...result, createdAt: new Date().toISOString() };
  }

  async latestMedications(user: AuthUser) {
    requireFlag();
    const row = await this.run(user, (tx) =>
      tx.medicationReconciliation.findFirst({
        where: { patientId: user.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, itemsEnc: true, createdAt: true, reviewedBy: true },
      }),
    );
    if (!row) return { items: [], warnings: [], createdAt: null, reviewedBy: null };
    let items: MedicationItem[] = [];
    try {
      items = JSON.parse(this.crypto.decrypt(row.itemsEnc, medsAad(row.id)).toString("utf-8"));
    } catch {
      items = [];
    }
    return { items: normalizeItems(items), warnings: reconcile([], items).warnings, createdAt: row.createdAt, reviewedBy: row.reviewedBy };
  }

  async consentLedger(user: AuthUser) {
    requireFlag();
    const [consents, receipts] = await Promise.all([
      this.run(user, (tx) =>
        tx.consent.findMany({ where: { userId: user.id }, orderBy: { grantedAt: "desc" } }),
      ),
      this.run(user, (tx) =>
        tx.consentReceipt.findMany({ where: { userId: user.id }, orderBy: { at: "desc" }, take: 200 }),
      ),
    ]);
    return { consents, receipts };
  }

  /** خروجی رمزشده با عبارت عبور بیمار؛ سرور کلید را نگه نمی‌دارد. */
  async exportRecord(user: AuthUser, passphrase: string) {
    requireFlag();
    const tl = await this.timeline(user, {});
    const meds = await this.latestMedications(user);
    const ledger = await this.consentLedger(user);
    const payload = {
      exportedAt: new Date().toISOString(),
      patientId: user.id,
      timeline: tl.points,
      medications: meds.items,
      consents: ledger.consents,
      consentReceipts: ledger.receipts,
    };
    const envelope: EncryptedExport = encryptExport(JSON.stringify(payload), passphrase);

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "health.export.encrypted",
      objectType: "user",
      objectId: user.id,
      meta: { points: tl.points.length, medications: meds.items.length },
    });
    return {
      filename: `nobatyar-health-${new Date().toISOString().slice(0, 10)}.nbe.json`,
      algorithm: "AES-256-GCM + scrypt",
      envelope,
    };
  }
}
