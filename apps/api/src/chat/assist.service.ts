import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { moduleEnabled } from "../common/feature-flags";
import { aad, FIELD_CRYPTO, type FieldCrypto } from "../crypto";
import { PrismaService } from "../prisma/prisma.service";
import { decryptBody } from "./chat-codec";
import {
  buildSummary,
  dedupeQuickReplies,
  normalizeQuickReply,
  parseStoredSummary,
  serializeSummary,
  MAX_QUICK_REPLIES,
} from "./assist";

function requireFlag() {
  if (!moduleEnabled("FF_M7_CHAT_ASSIST")) throw new BadRequestException({ error: "module_disabled" });
}

const summaryAad = (conversationId: string) => aad("conversation_summaries", conversationId, "body_enc");

@Injectable()
export class ChatAssistService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private run<T>(user: AuthUser, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.withContext({ role: user.role, userId: user.id }, fn);
  }

  // ─── پاسخ‌های سریع (فقط پزشک) ────────────────────────────────────────────
  async listQuickReplies(user: AuthUser) {
    requireFlag();
    return this.run(user, (tx) =>
      tx.chatQuickReply.findMany({ where: { doctorId: user.id }, orderBy: { id: "asc" }, select: { id: true, textFa: true } }),
    );
  }

  async addQuickReply(user: AuthUser, text: string) {
    requireFlag();
    const t = normalizeQuickReply(text);
    if (!t) throw new BadRequestException({ error: "invalid_text" });

    return this.run(user, async (tx) => {
      const existing = await tx.chatQuickReply.findMany({
        where: { doctorId: user.id },
        select: { id: true, textFa: true },
      });
      const merged = dedupeQuickReplies([...existing.map((e) => e.textFa), t]);
      if (!merged.includes(t)) {
        // متن تکراری است ⇒ همان رکورد موجود برگردانده می‌شود (idempotent)
        const hit = existing.find((e) => normalizeQuickReply(e.textFa) === t);
        return hit ?? existing[0];
      }
      if (existing.length >= MAX_QUICK_REPLIES) {
        throw new BadRequestException({ error: "quick_reply_limit", max: MAX_QUICK_REPLIES });
      }
      return tx.chatQuickReply.create({ data: { doctorId: user.id, textFa: t }, select: { id: true, textFa: true } });
    });
  }

  async deleteQuickReply(user: AuthUser, id: string) {
    requireFlag();
    const deleted = await this.run(user, (tx) =>
      tx.chatQuickReply.deleteMany({ where: { id, doctorId: user.id } }),
    );
    if (deleted.count === 0) throw new NotFoundException();
    return { ok: true };
  }

  // ─── خلاصهٔ مکالمه با رضایت ─────────────────────────────────────────────
  async summarize(user: AuthUser, conversationId: string, consentId: string) {
    requireFlag();

    const conv = await this.run(user, async (tx) => {
      const c = await tx.conversation.findUnique({
        where: { id: conversationId },
        select: { patientId: true, doctorId: true },
      });
      if (!c) throw new NotFoundException();
      if (c.patientId !== user.id && c.doctorId !== user.id) throw new ForbiddenException();
      return c;
    });

    // رضایت باید متعلق به بیمارِ همان مکالمه و معتبر باشد؛ صرفِ وجود consentId کافی نیست.
    const consent = await this.run(user, (tx) =>
      tx.consent.findFirst({
        where: { id: consentId, userId: conv.patientId, type: "HEALTH_DATA_PROCESSING", revokedAt: null },
        select: { id: true },
      }),
    );
    if (!consent) throw new ForbiddenException({ error: "consent_required" });

    const messages = await this.run(user, (tx) =>
      tx.message.findMany({
        where: { conversationId, deletedAt: null, kind: "TEXT" },
        orderBy: { id: "desc" },
        take: 60,
        select: { id: true, senderId: true, kind: true, bodyEnc: true },
      }),
    );

    const mapped = messages
      .map((m) => ({
        speaker: (m.senderId === conv.patientId ? "PATIENT" : "DOCTOR") as "PATIENT" | "DOCTOR",
        text: decryptBody(this.crypto, m),
      }))
      .reverse();

    const summary = buildSummary(mapped);
    const plain = serializeSummary(summary);
    const enc = this.crypto.encrypt(Buffer.from(plain, "utf-8"), summaryAad(conversationId));

    await this.run(user, (tx) =>
      tx.conversationSummary.upsert({
        where: { conversationId },
        update: { bodyEnc: enc, consentId: consent.id, createdAt: new Date() },
        create: { conversationId, bodyEnc: enc, consentId: consent.id },
      }),
    );

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "chat.summary.create",
      objectType: "conversation_summaries",
      objectId: conversationId,
      meta: { consentId: consent.id, bullets: summary.bullets.length, redactions: summary.redactions },
    });

    return { ...summary, generatedAt: new Date().toISOString() };
  }

  async getSummary(user: AuthUser, conversationId: string) {
    requireFlag();
    const row = await this.run(user, (tx) =>
      tx.conversationSummary.findUnique({ where: { conversationId }, select: { bodyEnc: true, createdAt: true } }),
    );
    if (!row) throw new NotFoundException({ error: "summary_not_found" });
    const plain = this.crypto.decrypt(row.bodyEnc, summaryAad(conversationId)).toString("utf-8");
    const parsed = parseStoredSummary(plain);
    if (!parsed) throw new NotFoundException({ error: "summary_corrupt" });
    return parsed;
  }
}
