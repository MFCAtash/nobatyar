import { Body, ConflictException, Controller, ForbiddenException, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import { AuthUser, CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { decideReinstate, decideSuspend, suspendSchema, type SuspendInput, type UserStatus } from "./user-admin";

/**
 * مدیریت وضعیت کاربر توسط ادمین. تعلیق «فوری» است: وضعیت DB + همه‌ی refresh token ها + همه‌ی access token های صادرشده
 * (ابطال Redis با sid/cutoff) ⇒ درخواست بعدیِ کاربر ۴۰۱ می‌شود و سوکت چت/SSE او در چند ثانیه بسته می‌شود.
 */
@Roles("ADMIN")
@Controller("admin/users")
export class UserAdminController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Post(":id/suspend")
  @HttpCode(200)
  async suspend(@CurrentUser() a: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(suspendSchema)) body: SuspendInput) {
    await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const u = await tx.user.findUnique({ where: { id }, select: { id: true, role: true, status: true } });
      if (!u) throw new NotFoundException();
      const d = decideSuspend(a.id, { id: u.id, role: u.role, status: u.status as UserStatus });
      if (!d.ok) throw d.code === "already_suspended" ? new ConflictException({ error: d.code }) : new ForbiddenException({ error: d.code });
      // شرطی: دو ادمین هم‌زمان ⇒ یکی برنده
      const upd = await tx.user.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "SUSPENDED" } });
      if (upd.count !== 1) throw new ConflictException({ error: "already_suspended" });
      await this.audit.logIn(tx, { actorId: a.id, actorRole: "ADMIN", action: "user.suspended", objectType: "user", objectId: id, meta: { reason: body.reason } });
    });
    await this.auth.revokeAllSessionsOf(id);
    return { id, status: "SUSPENDED" as const };
  }

  @Post(":id/reinstate")
  @HttpCode(200)
  async reinstate(@CurrentUser() a: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const u = await tx.user.findUnique({ where: { id }, select: { status: true } });
      if (!u) throw new NotFoundException();
      const d = decideReinstate({ status: u.status as UserStatus });
      if (!d.ok) throw new ConflictException({ error: d.code });
      await tx.user.updateMany({ where: { id, status: "SUSPENDED" }, data: { status: "ACTIVE" } });
      await this.audit.logIn(tx, { actorId: a.id, actorRole: "ADMIN", action: "user.reinstated", objectType: "user", objectId: id });
    });
    return { id, status: "ACTIVE" as const };
  }

  /** بدون تغییر وضعیت: فقط همه‌ی نشست‌های کاربر (مثلاً گوشی گم‌شده) بسته شود. */
  @Post(":id/revoke-sessions")
  @HttpCode(200)
  async revokeSessions(@CurrentUser() a: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      const u = await tx.user.findUnique({ where: { id }, select: { id: true } });
      if (!u) throw new NotFoundException();
      await this.audit.logIn(tx, { actorId: a.id, actorRole: "ADMIN", action: "user.sessions_revoked", objectType: "user", objectId: id });
    });
    await this.auth.revokeAllSessionsOf(id);
    return { id, revoked: true as const };
  }
}
