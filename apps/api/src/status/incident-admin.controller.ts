import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { AuthUser, CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { createIncidentSchema, updateIncidentSchema, type CreateIncidentInput, type UpdateIncidentInput } from "./incident.schemas";
import { canUpdateIncident, containsPersonalData, type IncidentStatus } from "./status-policy";
import { StatusService } from "./status.service";

const assertPublicSafe = (...texts: string[]): void => {
  if (texts.some(containsPersonalData)) throw new BadRequestException({ error: "contains_personal_data", message: "متن حادثه عمومی است؛ شماره/ایمیل/شناسه نگذارید." });
};

/** مدیریت حوادث نمایش‌داده‌شده در صفحه‌ی وضعیت (فقط ادمین؛ همه‌چیز audit می‌شود). */
@Roles("ADMIN")
@Controller("admin/status/incidents")
export class IncidentAdminController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StatusService) private readonly status: StatusService,
  ) {}

  @Get()
  list() {
    return this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.statusIncident.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { updates: { orderBy: { createdAt: "asc" } } } }),
    );
  }

  @Post()
  @HttpCode(201)
  async create(@CurrentUser() a: AuthUser, @Body(new ZodPipe(createIncidentSchema)) body: CreateIncidentInput) {
    assertPublicSafe(body.titleFa, body.bodyFa);
    const r = await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const inc = await tx.statusIncident.create({
        data: { titleFa: body.titleFa, impact: body.impact, componentId: body.componentId ?? null, status: "INVESTIGATING", createdBy: a.id, updates: { create: { status: "INVESTIGATING", bodyFa: body.bodyFa, authorId: a.id } } },
        select: { id: true },
      });
      await this.audit.logIn(tx, { actorId: a.id, actorRole: "ADMIN", action: "status.incident_created", objectType: "status_incident", objectId: inc.id, meta: { impact: body.impact } });
      return inc;
    });
    this.status.invalidate();
    return r;
  }

  @Post(":id/updates")
  @HttpCode(200)
  async update(@CurrentUser() a: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(updateIncidentSchema)) body: UpdateIncidentInput) {
    assertPublicSafe(body.bodyFa);
    await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const cur = await tx.statusIncident.findUnique({ where: { id }, select: { status: true } });
      if (!cur) throw new NotFoundException();
      const verdict = canUpdateIncident(cur.status as IncidentStatus, body.status, body.bodyFa.length > 0);
      if (!verdict.ok) throw new ConflictException({ error: verdict.code });
      const now = new Date();
      // شرطی: دو ادمین هم‌زمان ⇒ فقط روی حادثه‌ی «هنوز حل‌نشده»
      const upd = await tx.statusIncident.updateMany({ where: { id, status: { not: "RESOLVED" } }, data: { status: body.status, resolvedAt: body.status === "RESOLVED" ? now : null } });
      if (upd.count !== 1) throw new ConflictException({ error: "incident_resolved" });
      await tx.statusIncidentUpdate.create({ data: { incidentId: id, status: body.status, bodyFa: body.bodyFa, authorId: a.id } });
      await this.audit.logIn(tx, { actorId: a.id, actorRole: "ADMIN", action: "status.incident_updated", objectType: "status_incident", objectId: id, meta: { to: body.status } });
    });
    this.status.invalidate();
    return { id, status: body.status };
  }
}
