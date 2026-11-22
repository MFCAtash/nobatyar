import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { moduleEnabled } from "../common/feature-flags";
import { aad, FIELD_CRYPTO, type FieldCrypto } from "../crypto";
import { PrismaService } from "../prisma/prisma.service";
import {
  compareVersion,
  evaluateRuleSet,
  validateRuleSet,
  type Evaluation,
  type RuleSet,
} from "./ruleset";
import type { CreateRuleSetInput } from "./ruleset.schemas";

function requireFlag() {
  if (!moduleEnabled("FF_M10_TRIAGE_GOV")) throw new BadRequestException({ error: "module_disabled" });
}

const contentAad = (id: string) => aad("triage_rule_sets", id, "content_enc");

@Injectable()
export class TriageGovernanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private run<T>(user: AuthUser, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.withContext({ role: user.role, userId: user.id }, fn);
  }

  private decryptRow(row: { id: string; contentEnc: Buffer }): RuleSet | null {
    try {
      return JSON.parse(this.crypto.decrypt(row.contentEnc, contentAad(row.id)).toString("utf-8")) as RuleSet;
    } catch {
      return null; // corrupt row or rotated key: skip without logging PHI
    }
  }

  /** ظ†ط³ط®ظ‡ظ” ظپط¹ط§ظ„: ط¨ط§ظ„ط§طھط±غŒظ† ظ†ط³ط®ظ‡ظ” طھط£غŒغŒط¯ط´ط¯ظ‡ (approvedAt != null). */
  async active(user: AuthUser): Promise<{ version: string; ruleset: RuleSet; approvedAt: string } | null> {
    requireFlag();
    const rows = await this.run(user, (tx) =>
      tx.triageRuleSet.findMany({ orderBy: { approvedAt: "desc" }, take: 50 }),
    );
    for (const row of rows) {
      const rs = this.decryptRow(row);
      if (rs && compareVersion(rs.version, row.version) === 0) {
        return { version: row.version, ruleset: rs, approvedAt: row.approvedAt.toISOString() };
      }
    }
    return null;
  }

  async list(user: AuthUser) {
    requireFlag();
    const rows = await this.run(user, (tx) =>
      tx.triageRuleSet.findMany({ orderBy: { approvedAt: "desc" }, take: 100 }),
    );
    return rows.map((r) => {
      const rs = this.decryptRow(r);
      return {
        id: r.id,
        version: r.version,
        approvedBy: r.approvedBy,
        approvedAt: r.approvedAt,
        ruleCount: rs?.rules.length ?? 0,
        label: rs?.approvedByLabel ?? null,
        valid: rs ? validateRuleSet(rs).length === 0 : false,
      };
    });
  }

  /** ط³ط§ط®طھ ظ¾غŒط´â€Œظ†ظˆغŒط³: ط§ط¹طھط¨ط§ط±ط³ظ†ط¬غŒ ع©ط§ظ…ظ„ ظ¾غŒط´ ط§ط² ط°ط®غŒط±ظ‡ط› ruleset ظ†ط§ظ…ط¹طھط¨ط± ط°ط®غŒط±ظ‡ ظ†ظ…غŒâ€Œط´ظˆط¯. */
  async create(user: AuthUser, input: CreateRuleSetInput) {
    requireFlag();
    const errors = validateRuleSet(input);
    if (errors.length) throw new BadRequestException({ error: "invalid_ruleset", issues: errors });

    const existing = await this.run(user, (tx) =>
      tx.triageRuleSet.findUnique({ where: { version: input.version }, select: { id: true } }),
    );
    if (existing) throw new ConflictException({ error: "version_exists" });

    const id = randomUUID();
    const contentEnc = this.crypto.encrypt(Buffer.from(JSON.stringify(input), "utf-8"), contentAad(id));
    await this.run(user, (tx) =>
      tx.triageRuleSet.create({
        data: { id, version: input.version, contentEnc, approvedBy: user.id, approvedAt: new Date() },
      }),
    );
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "triage.ruleset.create",
      objectType: "triage_rule_sets",
      objectId: id,
      meta: { version: input.version, rules: input.rules.length },
    });
    return { id, version: input.version, rules: input.rules.length };
  }

  /** ط§ط±ط²غŒط§ط¨غŒ ط¨ط§ ظ†ط³ط®ظ‡ظ” ظپط¹ط§ظ„ط› ظ†ط¨ظˆط¯ ظ†ط³ط®ظ‡ â‡’ 404 (fail-closedطŒ ط¨ط¯ظˆظ† ط­ط¯ط³). */
  async evaluate(user: AuthUser, symptoms: string[]): Promise<Evaluation> {
    requireFlag();
    const a = await this.active(user);
    if (!a) throw new NotFoundException({ error: "no_active_ruleset" });
    return evaluateRuleSet(a.ruleset, symptoms);
  }

  async evaluateWithVersion(user: AuthUser, version: string, symptoms: string[]): Promise<Evaluation> {
    requireFlag();
    const row = await this.run(user, (tx) => tx.triageRuleSet.findUnique({ where: { version } }));
    if (!row) throw new NotFoundException({ error: "ruleset_not_found" });
    const rs = this.decryptRow(row);
    if (!rs) throw new NotFoundException({ error: "ruleset_corrupt" });
    return evaluateRuleSet(rs, symptoms);
  }
}
