import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { moduleEnabled } from "../common/feature-flags";
import { PrismaService } from "../prisma/prisma.service";
import { checkSeats, normalizeWorkspace, rankClinics, type ClinicLike } from "./clinics";
import type { CreateClinicInput, CreatePlanInput, WorkspaceInput } from "./clinics.schemas";

function requireFlag() {
  if (!moduleEnabled("FF_M14_ECOSYSTEM")) throw new BadRequestException({ error: "module_disabled" });
}

@Injectable()
export class GrowthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async clinics(user: AuthUser, q: { lat?: number; lng?: number; maxKm?: number; q?: string; verifiedOnly?: string; limit?: number }) {
    requireFlag();
    const rows = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.clinic.findMany({ take: 500, orderBy: { name: "asc" } }),
    );
    return rankClinics(rows as ClinicLike[], {
      origin: q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : null,
      maxKm: q.maxKm,
      query: q.q,
      verifiedOnly: q.verifiedOnly === "1",
      limit: q.limit,
    });
  }

  async createClinic(user: AuthUser, input: CreateClinicInput) {
    requireFlag();
    const row = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.clinic.create({
        data: {
          name: input.name.trim(),
          addressFa: input.addressFa.trim(),
          phone: input.phone.trim(),
          geoLat: input.geoLat ?? null,
          geoLng: input.geoLng ?? null,
          verified: input.verified === true,
        },
      }),
    );
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "growth.clinic.create",
      objectType: "clinics",
      objectId: row.id,
      meta: { verified: row.verified },
    });
    return row;
  }

  async verifyClinic(user: AuthUser, id: string) {
    requireFlag();
    const found = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.clinic.findUnique({ where: { id }, select: { id: true } }),
    );
    if (!found) throw new NotFoundException();
    const row = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.clinic.update({ where: { id }, data: { verified: true } }),
    );
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "growth.clinic.verify",
      objectType: "clinics",
      objectId: id,
    });
    return row;
  }

  async getWorkspace(user: AuthUser) {
    requireFlag();
    const row = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.doctorWorkspace.findUnique({ where: { doctorId: user.id } }),
    );
    return { dashboard: normalizeWorkspace(row?.dashboard) };
  }

  async putWorkspace(user: AuthUser, input: WorkspaceInput) {
    requireFlag();
    const row = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.doctorWorkspace.upsert({
        where: { doctorId: user.id },
        update: { dashboard: input.dashboard },
        create: { doctorId: user.id, dashboard: input.dashboard },
      }),
    );
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "growth.workspace.update",
      objectType: "doctor_workspaces",
      objectId: user.id,
      meta: { dashboard: input.dashboard },
    });
    return { dashboard: normalizeWorkspace(row.dashboard) };
  }

  async listPlans(user: AuthUser) {
    requireFlag();
    return this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.organizationPlan.findMany({ orderBy: { name: "asc" } }),
    );
  }

  async createPlan(user: AuthUser, input: CreatePlanInput) {
    requireFlag();
    const row = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.organizationPlan.create({ data: { name: input.name.trim(), seats: input.seats } }),
    );
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "growth.plan.create",
      objectType: "organization_plans",
      objectId: row.id,
      meta: { seats: row.seats },
    });
    return row;
  }

  async checkPlanSeats(user: AuthUser, id: string, used: number) {
    requireFlag();
    const plans = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.organizationPlan.findMany(),
    );
    const res = checkSeats(plans, { planId: id, usedSeats: used });
    if (!res.ok) throw new BadRequestException({ error: res.error });
    return { planId: id, usedSeats: used, remaining: res.remaining };
  }
}
