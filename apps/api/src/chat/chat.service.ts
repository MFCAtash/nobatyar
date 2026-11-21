import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "../common/decorators";
import { FIELD_CRYPTO, FieldCrypto } from "../crypto";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { validateOutgoing } from "./chat-attachments";
import { bodyAad, parseMessageCursor, previewOf, toMessageView, toSentView } from "./chat-codec";
import { PAGE_SIZE } from "./chat-types";
import type { SendMessageInput } from "./chat-types";

export type { SendMessageInput } from "./chat-types";

/**
 * مکالمه‌ها و پیام‌ها (REST + منطق gateway). ساختار فایل‌ها (فاز ۱۷):
 *   chat-codec.ts (رمزگشایی/نما) · chat-attachments.ts (اعتبارسنجی پیوست) · chat-socket-auth.ts (JWT/ابطال سوکت) · chat-types.ts
 */
@Injectable()
export class ChatService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO)  private readonly crypto: FieldCrypto,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  /**
   * ⚠️ همه‌ی دسترسی به conversations/messages باید با زمینه‌ی RLS باشد (withContext). جداول RLS اجباری دارند و نقش
   * اپلیکیشن BYPASSRLS ندارد؛ کوئری بدون app.user_id یعنی «هیچ ردیفی» و درج رد می‌شود.
   */
  private run<T>(user: AuthUser, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.withContext({ role: user.role, userId: user.id }, fn);
  }

  // ─── conversation‌های یک کاربر ───────────────────────────────────────────
  async getUserConversationIds(user: AuthUser): Promise<string[]> {
    const rows = await this.run(user, (tx) =>
      tx.conversation.findMany({
        where: { OR: [{ patientId: user.id }, { doctorId: user.id }] },
        select: { id: true },
      }),
    );
    return rows.map((r) => r.id);
  }

  // ─── لیست conversation‌ها با آخرین پیام ───────────────────────────────────
  async listConversations(user: AuthUser) {
    const userId = user.id;
    const { convs, unreadByConv } = await this.run(user, async (tx) => {
      const convs = await tx.conversation.findMany({
        where: { OR: [{ patientId: userId }, { doctorId: userId }] },
        include: {
          patient: { select: { userId: true, fullName: true } },
          doctor:  { select: { userId: true, fullName: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true, kind: true, senderId: true,
              bodyEnc: true, createdAt: true, readAt: true,
              attachmentName: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      // یک کوئری گروهی به‌جای N کوئری (N+1)
      const grouped = await tx.message.groupBy({
        by: ["conversationId"],
        where: { conversationId: { in: convs.map((c) => c.id) }, senderId: { not: userId }, readAt: null },
        _count: { _all: true },
      });
      return { convs, unreadByConv: new Map<string, number>(grouped.map((g): [string, number] => [g.conversationId, g._count._all])) };
    });

    return Promise.all(convs.map(async (c) => {
      const last = c.messages[0];
      const lastBodyPreview = previewOf(this.crypto, last);
      return {
        id:           c.id,
        appointmentId:c.appointmentId,
        peer:         c.patientId === userId ? c.doctor : c.patient,
        lastMessage:  last ? { ...last, id: last.id.toString(), bodyPreview: lastBodyPreview } : null,
        unread:       unreadByConv.get(c.id) ?? 0,
        createdAt:    c.createdAt,
      };
    }));
  }

  // ─── پیام‌های یک conversation (صفحه‌بندی cursor) ──────────────────────────
  async getMessages(user: AuthUser, conversationId: string, cursor?: string) {
    let cursorId: bigint | undefined;
    if (cursor !== undefined) {
      const parsed = parseMessageCursor(cursor);
      if (parsed === null) throw new BadRequestException("cursor نامعتبر است");
      cursorId = parsed;
    }

    const msgs = await this.run(user, async (tx) => {
      await this.assertMember(tx, user.id, conversationId);
      return tx.message.findMany({
        where: {
          conversationId,
          deletedAt: null,
          ...(cursorId !== undefined ? { id: { lt: cursorId } } : {}),
        },
        // cursor روی id است ⇒ ترتیب هم باید روی id باشد (createdAt ممکن است برای دو پیام یکسان یا نامنظم باشد)
        orderBy: { id: "desc" },
        take: PAGE_SIZE + 1,
      });
    });

    const hasMore = msgs.length > PAGE_SIZE;
    const page    = hasMore ? msgs.slice(0, PAGE_SIZE) : msgs;

    const decrypted = page.map((m) => toMessageView(this.crypto, m));

    // ترتیب صعودی برای رندر
    return {
      messages: decrypted.reverse(),
      hasMore,
      cursor: hasMore ? page[PAGE_SIZE - 1].id.toString() : null,
    };
  }

  // ─── ارسال پیام ────────────────────────────────────────────────────────────
  async createMessage(user: AuthUser, dto: SendMessageInput) {
    // ۱) عضویت (با RLS) — پیش از هر کار پرهزینه/شبکه‌ای
    await this.run(user, (tx) => this.assertMember(tx, user.id, dto.conversationId));

    // ۲) نوع/پیوست (کلید مال خودِ فرستنده؛ نوع و حجم از MinIO) — chat-attachments.ts
    const attachment = await validateOutgoing(this.storage, user.id, dto);

    // ۳) درج در «یک» تراکنش RLS (شناسه از sequence تا AAD رمزنگاری قبل از درج معلوم باشد)
    const msg = await this.run(user, async (tx) => {
      const [{ nextval }] = await tx.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('messages_id_seq')`;
      const bodyEnc = dto.kind === "TEXT"
        ? this.crypto.encrypt(Buffer.from(dto.body ?? "", "utf-8"), bodyAad(nextval))
        : Buffer.alloc(0);
      return tx.message.create({
        data: {
          id:              nextval,
          conversationId:  dto.conversationId,
          senderId:        user.id,
          kind:            dto.kind,
          bodyEnc,
          attachmentKey:   attachment?.key,
          attachmentName:  attachment ? dto.attachmentName : undefined,
          attachmentMime:  attachment?.mime,
          attachmentBytes: attachment?.bytes,
        },
      });
    });

    return toSentView(msg, dto.kind === "TEXT" ? (dto.body ?? "") : "");
  }

  // ─── علامت خوانده ─────────────────────────────────────────────────────────
  async markRead(user: AuthUser, conversationId: string): Promise<void> {
    await this.run(user, async (tx) => {
      await this.assertMember(tx, user.id, conversationId);
      // فقط read_at (سیاست messages_mark_read + trigger ی messages_guard در phase14-chat-rls.sql)
      await tx.message.updateMany({
        where: { conversationId, senderId: { not: user.id }, readAt: null },
        data: { readAt: new Date() },
      });
    });
  }

  // ─── دریافت لینک دانلود فایل ─────────────────────────────────────────────
  async getAttachmentUrl(
    user:      AuthUser,
    messageId: string,
  ): Promise<{ url: string; expiresAt: number }> {
    if (!/^\d{1,18}$/.test(messageId)) throw new NotFoundException("پیوست یافت نشد");
    const msg = await this.run(user, (tx) =>
      tx.message.findUnique({
        where:  { id: BigInt(messageId) },
        select: {
          attachmentKey: true, attachmentName: true,
          conversation: { select: { patientId: true, doctorId: true } },
        },
      }),
    );
    // RLS پیام را فقط به اعضا نشان می‌دهد؛ نبودن = یافت نشد (عدم افشای وجود پیام)
    if (!msg?.attachmentKey) throw new NotFoundException("پیوست یافت نشد");
    const { patientId, doctorId } = msg.conversation;
    if (user.id !== patientId && user.id !== doctorId) throw new ForbiddenException();

    return this.storage.createDownloadUrl("chat", msg.attachmentKey, msg.attachmentName ?? "file");
  }

  // ─── بررسی عضویت در conversation (داخل تراکنش RLS) ───────────────────────
  private async assertMember(tx: Prisma.TransactionClient, userId: string, conversationId: string) {
    const conv = await tx.conversation.findUnique({
      where:  { id: conversationId },
      select: { patientId: true, doctorId: true },
    });
    if (!conv) throw new NotFoundException("مکالمه یافت نشد");
    if (conv.patientId !== userId && conv.doctorId !== userId)
      throw new ForbiddenException("شما عضو این مکالمه نیستید");
    return conv;
  }
}
