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
import {
  JoinSchema, ReadSchema, SendMessageSchema, TypingSchema,
  type ChatWsErrorCode, type ChatWsError,
} from "./chat.schemas";

const SESSION_RECHECK_MS = 30_000;

function authedUser(socket: Socket): AuthUser | undefined {
  const u: unknown = socket.data?.user;
  return u && typeof u === "object" && "id" in u ? (u as AuthUser) : undefined;
}

/** خطای ساختاریافته و فاقد PHI برای کلاینت — کد خطا قابل تشخیص است. */
function wsError(code: ChatWsErrorCode, message: string): WsException {
  return new WsException({ code, message } satisfies ChatWsError);
}

@WebSocketGateway({
  namespace: "/chat",
  cors: {
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3001",
    credentials: true,
  },
  transports: ["websocket"],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer() private readonly io!: Server;
  private readonly logger = new Logger(ChatGateway.name);
  private readonly sweeps = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly chatSvc: ChatService,
    @Inject(ChatSocketAuth) private readonly socketAuth: ChatSocketAuth,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const user = await this.socketAuth.authenticate(socket);
      socket.data.user = user;
      socket.join(`user:${user.id}`);
      this.sweeps.set(socket.id, setInterval(() => void this.sweep(socket), SESSION_RECHECK_MS).unref());

      const convIds = await this.chatSvc.getUserConversationIds(user);
      convIds.forEach((id) => socket.join(`conv:${id}`));
      this.logger.log(`connect: ${user.id} (${socket.id})`);
    } catch (e) {
      // پیشتر اینجا خطا بیسر و صدا خورده میشد ⇒ client «متصل» نشان میداد ولی هیچ پیامی نمیرسید.
      this.logger.warn(`connect rejected: ${(e as Error).name}`);
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    const t = this.sweeps.get(socket.id);
    if (t) { clearInterval(t); this.sweeps.delete(socket.id); }
    const user = authedUser(socket);
    if (!user) return;
    this.logger.log(`disconnect: ${user.id} (${socket.id})`);
  }

  /** اتاق مکالمه — عضویت واقعی فقط بر اساس RLS/service است، نه صرفاً درخواست client. */
  @SubscribeMessage("join_conversation")
  async onJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() raw: unknown,
  ) {
    const user = await this.requireUser(socket);
    const parsed = JoinSchema.safeParse(raw);
    if (!parsed.success) throw wsError("invalid_payload", "invalid payload");
    const ids = await this.chatSvc.getUserConversationIds(user);
    const id = parsed.data.conversationId;
    if (!ids.includes(id)) throw wsError("forbidden", "not a member");
    socket.join(`conv:${id}`);
    return { ok: true };
  }

  @SubscribeMessage("send_message")
  async onSendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() raw: unknown,
  ) {
    const user = await this.requireUser(socket);
    const parsed = SendMessageSchema.safeParse(raw);
    if (!parsed.success) throw wsError("invalid_payload", "invalid payload");

    const dto = parsed.data;
    let msg;
    try {
      msg = await this.chatSvc.createMessage(user, dto);
    } catch (e) {
      if (e instanceof WsException) throw e;
      this.logger.warn(`message rejected: ${(e as Error).name}`);
      throw wsError("server_error", "message not saved");
    }

    this.io.to(`conv:${dto.conversationId}`).emit("new_message", msg);
    return { ok: true, messageId: msg.id.toString() };
  }

  @SubscribeMessage("read_messages")
  async onRead(
    @ConnectedSocket() socket: Socket,
    @MessageBody() raw: unknown,
  ) {
    const user = await this.requireUser(socket);
    const parsed = ReadSchema.safeParse(raw);
    if (!parsed.success) throw wsError("invalid_payload", "invalid payload");

    await this.chatSvc.markRead(user, parsed.data.conversationId);
    socket.to(`conv:${parsed.data.conversationId}`).emit("messages_read", {
      conversationId: parsed.data.conversationId,
      readerId: user.id,
      at: new Date().toISOString(),
    });
    return { ok: true };
  }

  @SubscribeMessage("typing")
  onTyping(
    @ConnectedSocket() socket: Socket,
    @MessageBody() raw: unknown,
  ) {
    const user = authedUser(socket);
    if (!user) return;
    const parsed = TypingSchema.safeParse(raw);
    if (!parsed.success) return;
    if (!socket.rooms.has(`conv:${parsed.data.conversationId}`)) return;
    socket.to(`conv:${parsed.data.conversationId}`).emit("typing_indicator", {
      conversationId: parsed.data.conversationId,
      userId: user.id,
      typing: parsed.data.typing,
    });
  }

  private async requireUser(socket: Socket): Promise<AuthUser> {
    const user = authedUser(socket);
    if (!user) throw wsError("unauthorized", "unauthorized");
    if (!(await this.socketAuth.isStillValid(user))) {
      socket.disconnect(true);
      throw wsError("unauthorized", "session revoked");
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

  async isOnline(userId: string): Promise<boolean> {
    const sockets = await this.io.in(`user:${userId}`).fetchSockets();
    return sockets.length > 0;
  }
}
