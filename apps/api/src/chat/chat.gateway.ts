import {
  ConnectedSocket, MessageBody, OnGatewayConnection,
  OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer,
  WsException,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { Inject, Logger, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ChatSocketAuth } from "./chat-socket-auth";
import { ChatService } from "./chat.service";
import type { AuthUser } from "../common/decorators";
import { z } from "zod";

/** هر چند ms ابطال نشست یک سوکت باز دوباره سنجیده شود. */
const SESSION_RECHECK_MS = 30_000;

/** کاربر احرازشده‌ی سوکت (در handleConnection روی socket.data گذاشته می‌شود). */
function authedUser(socket: Socket): AuthUser | undefined {
  const u: unknown = socket.data?.user;
  return u && typeof u === "object" && "id" in u ? (u as AuthUser) : undefined;
}

const SendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  body:           z.string().max(4000).optional().default(""),
  kind:           z.enum(["TEXT","FILE","IMAGE"]).default("TEXT"),
  objectKey:      z.string().max(500).optional(),
  attachmentName: z.string().max(255).optional(),
  attachmentMime: z.string().max(80).optional(),
  attachmentBytes:z.number().int().optional(),
});

const ReadSchema = z.object({
  conversationId: z.string().uuid(),
  messageId:      z.string(),
});

const TypingSchema = z.object({
  conversationId: z.string().uuid(),
  typing:         z.boolean(),
});

@WebSocketGateway({
  namespace: "/chat",
  cors: {
    origin:      process.env.WEB_ORIGIN ?? "http://localhost:3001",
    credentials: true,
  },
  transports: ["websocket"],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer() private readonly io!: Server;
  private readonly logger = new Logger(ChatGateway.name);
  /** بازبررسی دوره‌ایِ ابطال برای هر سوکت (تعلیق/خروج نباید منتظر قطع شدن سوکت بماند). */
  private readonly sweeps = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly chatSvc: ChatService,
    @Inject(ChatSocketAuth) private readonly socketAuth: ChatSocketAuth,
  ) {}

  // ─── اتصال ─────────────────────────────────────────────────────────────────
  async handleConnection(socket: Socket) {
    try {
      const user = await this.socketAuth.authenticate(socket);
      socket.data.user = user;
      socket.join(`user:${user.id}`);
      this.sweeps.set(socket.id, setInterval(() => void this.sweep(socket), SESSION_RECHECK_MS).unref());

      // join اتاق‌های conversation
      const convIds = await this.chatSvc.getUserConversationIds(user);
      convIds.forEach((id) => socket.join(`conv:${id}`));

      this.logger.log(`connect: ${user.id} (${socket.id})`);
    } catch {
      socket.disconnect(true);
    }
  }

  // ─── قطع اتصال ─────────────────────────────────────────────────────────────
  handleDisconnect(socket: Socket) {
    const t = this.sweeps.get(socket.id);
    if (t) { clearInterval(t); this.sweeps.delete(socket.id); }
    const user = authedUser(socket);
    if (!user) return;
    this.logger.log(`disconnect: ${user.id} (${socket.id})`);
  }

  // ─── ارسال پیام ────────────────────────────────────────────────────────────
  @SubscribeMessage("send_message")
  async onSendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() raw: unknown,
  ) {
    const user = await this.requireUser(socket);

    const parsed = SendMessageSchema.safeParse(raw);
    if (!parsed.success) throw new WsException("invalid payload");

    const dto = parsed.data;

    // عضویت، مالکیت فایل و نوع/حجم پیوست در ChatService (با RLS) بررسی می‌شود
    const msg = await this.chatSvc.createMessage(user, dto);

    // broadcast به همه اعضای conversation
    this.io.to(`conv:${dto.conversationId}`).emit("new_message", msg);

    return { ok: true, messageId: msg.id.toString() };
  }

  // ─── علامت خوانده ──────────────────────────────────────────────────────────
  @SubscribeMessage("read_messages")
  async onRead(
    @ConnectedSocket() socket: Socket,
    @MessageBody() raw: unknown,
  ) {
    const user = await this.requireUser(socket);

    const parsed = ReadSchema.safeParse(raw);
    if (!parsed.success) throw new WsException("invalid payload");

    await this.chatSvc.markRead(user, parsed.data.conversationId);

    // به طرف مقابل اطلاع بده
    socket.to(`conv:${parsed.data.conversationId}`).emit("messages_read", {
      conversationId: parsed.data.conversationId,
      readerId: user.id,
      at: new Date().toISOString(),
    });

    return { ok: true };
  }

  // ─── وضعیت تایپ ────────────────────────────────────────────────────────────
  @SubscribeMessage("typing")
  onTyping(
    @ConnectedSocket() socket: Socket,
    @MessageBody() raw: unknown,
  ) {
    const user = authedUser(socket);
    if (!user) return;
    const parsed = TypingSchema.safeParse(raw);
    if (!parsed.success) return;
    // socket.to(room) بدون عضویت هم پخش می‌کند ⇒ فقط اتاق‌هایی که همین سوکت (پس از احراز) عضوشان شده
    if (!socket.rooms.has(`conv:${parsed.data.conversationId}`)) return;

    // به همه اعضا به‌جز فرستنده اطلاع بده
    socket.to(`conv:${parsed.data.conversationId}`).emit("typing_indicator", {
      conversationId: parsed.data.conversationId,
      userId: user.id,
      typing: parsed.data.typing,
    });
  }

  // ─── ابطال نشست ────────────────────────────────────────────────────────────
  private async requireUser(socket: Socket): Promise<AuthUser> {
    const user = authedUser(socket);
    if (!user) throw new WsException("unauthorized");
    if (!(await this.socketAuth.isStillValid(user))) {
      socket.disconnect(true);
      throw new WsException("unauthorized");
    }
    return user;
  }

  private async sweep(socket: Socket): Promise<void> {
    const user = authedUser(socket);
    if (!user) return;
    try {
      if (!(await this.socketAuth.isStillValid(user))) {
        this.logger.log(`session revoked: ${user.id} (${socket.id})`);
        socket.disconnect(true);
      }
    } catch (e) {
      this.logger.warn(`session recheck failed: ${(e as Error).name}`);
    }
  }

  onModuleDestroy(): void {
    for (const t of this.sweeps.values()) clearInterval(t);
    this.sweeps.clear();
  }

  // ─── آنلاین بودن ───────────────────────────────────────────────────────────
  /**
   * آیا کاربر روی «هر نمونه‌ی API» سوکت باز دارد؟ با redis-adapter از اتاق `user:<id>` در کل خوشه می‌پرسد
   * (نقشه‌ی محلی فقط سوکت‌های همین پروسه را می‌دید).
   */
  async isOnline(userId: string): Promise<boolean> {
    const sockets = await this.io.in(`user:${userId}`).fetchSockets();
    return sockets.length > 0;
  }
}
