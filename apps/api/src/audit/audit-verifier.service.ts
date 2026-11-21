import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

interface BrokenRow { broken_seq: bigint | number; reason: string | null }

/** A24: بررسی یکپارچگی زنجیره هش Audit توسط تابع SECURITY DEFINER دیتابیس (hardening.sql). */
@Injectable()
export class AuditVerifierService {
  private readonly log = new Logger(AuditVerifierService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async verify() {
    const rows = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.$queryRaw<BrokenRow[]>`SELECT * FROM verify_audit_chain()`,
    );
    const broken = rows.map((r) => ({ seq: String(r.broken_seq), reason: r.reason ?? "unknown" }));
    if (broken.length) this.log.error(`audit chain broken at ${broken.map((b) => b.seq).join(",")}`);
    return { ok: broken.length === 0, broken };
  }
}
