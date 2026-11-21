import { randomUUID } from "node:crypto";
import { HttpException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { RateLimiter } from "../auth/rate-limit";
import type { AuthUser } from "../common/decorators";
import { aad, FIELD_CRYPTO, FieldCrypto } from "../crypto";
import { PrismaService } from "../prisma/prisma.service";
import { KV_STORE, KeyValueStore } from "../redis/kv-store";
import { COMPLAINTS, GLOBAL_RED_FLAGS } from "./triage-catalog";
import { applicableFlags, runTriage, TriageInput, TriageResult, validateTriageInput } from "./triage-engine";

const RUNS_PER_HOUR = 20;
const HISTORY = 20;

@Injectable()
export class TriageService {
  private readonly limiter: RateLimiter;
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(KV_STORE) kv: KeyValueStore,
  ) { this.limiter = new RateLimiter(kv); }

  /** کاتالوگ برای UI (متن‌ها عمومی‌اند؛ هیچ داده‌ی کاربر ندارد). */
  catalog() {
    return {
      complaints: COMPLAINTS.map((c) => ({ code: c.code, labelFa: c.labelFa })),
      globalRedFlags: GLOBAL_RED_FLAGS.map(({ id, textFa, ageMax, ageMin, pregnantOnly }) => ({ id, textFa, ageMax, ageMin, pregnantOnly })),
    };
  }

  /** پرچم‌های قابل‌پرسش برای ورودی مرحله‌ی اول. */
  flagsFor(input: Pick<TriageInput, "ageYears" | "pregnant" | "symptoms">) {
    const f = applicableFlags(input);
    const pick = (x: typeof f.global) => x.map(({ id, textFa, level }) => ({ id, textFa, level }));
    return { global: pick(f.global), specific: pick(f.specific) };
  }

  async run(u: AuthUser, input: TriageInput) {
    const rl = await this.limiter.hit(`triage:${u.id}`, RUNS_PER_HOUR, 3600);
    if (!rl.allowed) throw new HttpException({ error: "too_many_requests", retryAfterSec: rl.retryAfterSec }, 429);
    const errors = validateTriageInput(input);
    if (errors.length) throw new UnprocessableEntityException({ error: "invalid_triage_input", issues: errors });

    const result = runTriage(input);
    const id = randomUUID();
    await this.prisma.withContext({ role: u.role, userId: u.id }, async (tx) => {
      await tx.triageSession.create({
        data: {
          id, patientId: u.id, engineVersion: result.engineVersion,
          answersEnc: this.crypto.encrypt(JSON.stringify(input), aad("triage_sessions", id, "answers")),
          resultEnc: this.crypto.encrypt(JSON.stringify(result), aad("triage_sessions", id, "result")),
        },
      });
      // فوریت/علائم عمداً در Audit نمی‌آید (HEALTH)؛ فقط نسخه‌ی قواعد
      await this.audit.logIn(tx, { actorId: u.id, actorRole: u.role, action: "triage.run", objectType: "triage_session", objectId: id, meta: { engine: result.engineVersion } });
    });
    return { id, result, doctors: await this.suggestDoctors(result) };
  }

  /** پزشکان فهرست‌شده با تخصص‌های پیشنهادی (اطلاعات عمومی دایرکتوری). فقط برای فوریت‌هایی که نوبت آنلاین معنا دارد. */
  async suggestDoctors(result: TriageResult) {
    if (result.suggestedKind === "EMERGENCY" || result.suggestedKind === "NONE") return [];
    const slugs = result.specialties.map((s) => s.slug);
    const rows = await this.prisma.withContext({ role: "ANON" }, (tx) =>
      tx.doctorProfile.findMany({
        where: { isListed: true, specialties: { some: { specialty: { slug: { in: slugs } } } } },
        select: { userId: true, fullName: true, consultationFeeRial: true, specialties: { select: { specialty: { select: { slug: true, nameFa: true } } } } },
        take: 30,
      }),
    );
    const rank = (d: (typeof rows)[number]) => Math.min(...d.specialties.map((s) => (slugs.includes(s.specialty.slug) ? slugs.indexOf(s.specialty.slug) : 99)));
    return rows.sort((a, b) => rank(a) - rank(b)).slice(0, 5).map((d) => ({
      id: d.userId, fullName: d.fullName, consultationFeeRial: d.consultationFeeRial.toString(), specialties: d.specialties.map((s) => s.specialty),
    }));
  }

  async history(u: AuthUser) {
    const rows = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.triageSession.findMany({ where: { patientId: u.id }, orderBy: { createdAt: "desc" }, take: HISTORY, select: { id: true, createdAt: true, resultEnc: true } }),
    );
    return rows.map((r) => {
      const res = r.resultEnc ? (JSON.parse(this.crypto.decryptString(r.resultEnc, aad("triage_sessions", r.id, "result"))) as TriageResult) : null;
      return { id: r.id, createdAt: r.createdAt, urgency: res?.urgency ?? null, specialties: res?.specialties ?? [] };
    });
  }

  async getOne(u: AuthUser, id: string) {
    const r = await this.prisma.withContext({ role: u.role, userId: u.id }, (tx) =>
      tx.triageSession.findFirst({ where: { id, patientId: u.id }, select: { id: true, createdAt: true, answersEnc: true, resultEnc: true } }),
    );
    if (!r || !r.resultEnc) throw new NotFoundException();
    return {
      id: r.id, createdAt: r.createdAt,
      answers: JSON.parse(this.crypto.decryptString(r.answersEnc, aad("triage_sessions", id, "answers"))),
      result: JSON.parse(this.crypto.decryptString(r.resultEnc, aad("triage_sessions", id, "result"))) as TriageResult,
    };
  }
}
