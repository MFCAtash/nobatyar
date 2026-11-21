"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { useAuth } from "@/lib/auth-context";
import { enqueue, remove, splitFresh, type Pending } from "@/lib/outbox";
import { isAckSuccess, readPayload, sendPayload, wsErrorMessage, type AckResult, type SendOutcome } from "./chat-contract";

export interface ChatMessage {
  id:              string;
  conversationId:  string;
  senderId:        string;
  kind:            "TEXT" | "FILE" | "IMAGE" | "SYSTEM";
  body:            string;
  attachmentName?: string;
  attachmentMime?: string;
  attachmentBytes?: number;
  hasAttachment:   boolean;
  readAt:          string | null;
  createdAt:       string;
}

export interface TypingIndicator {
  conversationId: string;
  userId:         string;
  typing:         boolean;
}

interface State {
  messages:   ChatMessage[];
  hasMore:    boolean;
  cursor:     string | null;
  loading:    boolean;
  connected:  boolean;
  /** userId → timeout id */
  typing:     Record<string, ReturnType<typeof setTimeout>>;
  typingUsers:string[];
  /** خطای قابل نمایش (فاقد محتوای پیام/داده سلامت). */
  error:      string | null;
}

const TYPING_CLEAR_MS = 3000;
const ACK_TIMEOUT_MS = 5000;

/** ارسال با تأیید سرور — برخلاف emit ساده، خطا را به client میرساند. */
function emitWithAck(sock: Socket, event: string, payload: unknown): Promise<AckResult> {
  return new Promise((resolve) => {
    sock.timeout(ACK_TIMEOUT_MS).emit(event, payload, (err: Error | null, ack?: { ok?: boolean; messageId?: string }) => {
      if (err) return resolve({ ok: false, error: err, ack });
      resolve({ ok: true, ack });
    });
  });
}

export function useChat(conversationId: string) {
  const { api, status } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  // صف ارسال هنگام قطعی — فقط در حافظه (سیاست «هیچ داده‌ی پزشکی روی دستگاه نمی‌ماند»)
  const pendingRef = useRef<Pending[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [expiredCount, setExpiredCount] = useState(0);
  const setQueue = useCallback((q: Pending[]) => { pendingRef.current = q; setPending(q); }, []);
  const [state, setState] = useState<State>({
    messages: [], hasMore: false, cursor: null,
    loading: false, connected: false,
    typing: {}, typingUsers: [], error: null,
  });

  // ─── بارگذاری تاریخچه ─────────────────────────────────────────────────────
  const loadHistory = useCallback(async (cursor?: string) => {
    if (status !== "authed") return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const q = cursor ? `?cursor=${cursor}` : "";
      const r = await api.get<{
        messages: ChatMessage[]; hasMore: boolean; cursor: string | null;
      }>(`/conversations/${conversationId}/messages${q}`);

      setState((s) => ({
        ...s,
        messages:  cursor ? [...r.messages, ...s.messages] : r.messages,
        hasMore:   r.hasMore,
        cursor:    r.cursor,
        loading:   false,
      }));
    } catch {
      setState((s) => ({ ...s, loading: false, error: "تاریخچه پیامها بارگذاری نشد." }));
    }
  }, [api, conversationId, status]);

  // ─── WebSocket ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== "authed") return;

    let io: Socket | undefined;
    (async () => {
      const { io: ioConnect } = await import("socket.io-client");

      // access token فقط در حافظه‌ی api نگه‌داری می‌شود؛ تابع auth در هر (re)connect توکن «تازه» را می‌گیرد
      // Next.js rewrites ارتقای WebSocket را پروکسی نمیکند ⇒ در dev/CI مستقیماً به منبع API وصل میشویم.
      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? "/chat";
      io = ioConnect(socketUrl, {
        path:        "/socket.io",
        transports:  ["websocket"],
        auth:        (cb: (d: { token: string | null }) => void) => cb({ token: api.getToken() }),
        reconnectionAttempts: 5,
        reconnectionDelay:    1500,
      });
      socketRef.current = io;

      io.on("connect", async () => {
        setState((s) => ({ ...s, connected: true, error: null }));
        // join اتاق — فقط زمانی که سرور عضویت را تأیید کند، اتاق واقعی است.
        const joined = await emitWithAck(io!, "join_conversation", { conversationId });
        if (!joined.ok) setState((s) => ({ ...s, error: wsErrorMessage(joined.error) }));

        // ارسال پیام‌های صف‌شده‌ی دوران قطعی (پیام‌های بیش از ۱۵ دقیقه‌ای فرستاده نمی‌شوند)
        const { fresh, stale } = splitFresh(pendingRef.current);
        const failed: Pending[] = [];
        for (const p of fresh) {
          const r = await emitWithAck(io!, "send_message", sendPayload(conversationId, p.body));
          if (!isAckSuccess(r)) failed.push(p);
        }
        if (stale.length) setExpiredCount((n) => n + stale.length);
        setQueue(failed);
        if (failed.length) setState((s) => ({ ...s, error: "برخی پیامهای صفشده ارسال نشدند." }));
      });

      io.on("disconnect", () => {
        setState((s) => ({ ...s, connected: false }));
      });

      // خطاهای سرور پیشتر بیسر و صدا نادیده گرفته میشدند.
      io.on("exception", (err: unknown) => {
        setState((s) => ({ ...s, error: wsErrorMessage(err) }));
      });

      io.on("new_message", (msg: ChatMessage) => {
        if (msg.conversationId !== conversationId) return;
        setState((s) => ({
          ...s,
          messages: [...s.messages, msg],
        }));
        // علامت خوانده — قرارداد جدید با messageId اختیاری؛ قدیمیها هم کار میکنند.
        io!.emit("read_messages", readPayload(conversationId, msg.id));
      });

      io.on("messages_read", (data: { conversationId: string; readerId: string }) => {
        if (data.conversationId !== conversationId) return;
        setState((s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.readAt ? m : { ...m, readAt: new Date().toISOString() },
          ),
        }));
      });

      io.on("typing_indicator", (data: TypingIndicator) => {
        if (data.conversationId !== conversationId) return;
        setState((s) => {
          // پاک کردن timer قبلی
          if (s.typing[data.userId]) clearTimeout(s.typing[data.userId]);

          const newTyping = { ...s.typing };
          let newUsers    = s.typingUsers.filter((u) => u !== data.userId);

          if (data.typing) {
            newUsers = [...newUsers, data.userId];
            newTyping[data.userId] = setTimeout(() => {
              setState((ss) => ({
                ...ss,
                typingUsers: ss.typingUsers.filter((u) => u !== data.userId),
              }));
            }, TYPING_CLEAR_MS);
          } else {
            delete newTyping[data.userId];
          }

          return { ...s, typing: newTyping, typingUsers: newUsers };
        });
      });
    })();

    loadHistory();

    return () => {
      io?.disconnect();
      socketRef.current = null;
    };
  }, [conversationId, status, loadHistory]);

  // ─── ارسال پیام متنی ──────────────────────────────────────────────────────
  /** فقط پس از ack سرور "sent" برمیگرداند؛ خطا را در state قرار میدهد. */
  const sendText = useCallback(async (body: string): Promise<SendOutcome> => {
    const sock = socketRef.current;
    if (!sock?.connected) {
      const r = enqueue(pendingRef.current, body);
      if (!r.ok) return r.reason;
      setQueue(r.queue);
      return "queued";
    }
    if (!body.trim()) return "empty";
    setState((s) => ({ ...s, error: null }));
    const ack = await emitWithAck(sock, "send_message", sendPayload(conversationId, body));
    if (!isAckSuccess(ack)) {
      setState((s) => ({ ...s, error: wsErrorMessage(ack.error) }));
      return "error";
    }
    return "sent";
  }, [conversationId, setQueue]);

  const cancelPending = useCallback((localId: string) => setQueue(remove(pendingRef.current, localId)), [setQueue]);

  // ─── ارسال پیام فایل ──────────────────────────────────────────────────────
  const sendFile = useCallback(async (file: File) => {
    // مرحله ۱: دریافت presigned URL
    const { objectKey, presignedPut } = await api.post<{
      uploadId: string; objectKey: string; presignedPut: string;
    }>("/storage/upload-token", {
      bucket: "chat",
      mime:   file.type,
      bytes:  file.size,
    });

    // مرحله ۲: آپلود مستقیم به MinIO
    const put = await fetch(presignedPut, {
      method:  "PUT",
      body:    file,
      headers: { "Content-Type": file.type },
    });
    if (!put.ok) throw new Error("upload_failed");

    // مرحله ۳: ارسال پیام با objectKey — بدون ack موفق نمیشماریم
    const sock = socketRef.current;
    if (!sock) throw new Error("disconnected");
    const ack = await emitWithAck(sock, "send_message", sendPayload(
      conversationId, "", file.type.startsWith("image/") ? "IMAGE" : "FILE",
      { objectKey, attachmentName: file.name, attachmentMime: file.type, attachmentBytes: file.size },
    ));
    if (!isAckSuccess(ack)) {
      setState((s) => ({ ...s, error: wsErrorMessage(ack.error) }));
      throw new Error("send_failed");
    }
  }, [api, conversationId]);

  // ─── ارسال typing indicator ───────────────────────────────────────────────
  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTyping = useCallback(() => {
    socketRef.current?.emit("typing", { conversationId, typing: true });
    if (typingRef.current) clearTimeout(typingRef.current);
    typingRef.current = setTimeout(() => {
      socketRef.current?.emit("typing", { conversationId, typing: false });
    }, 2500);
  }, [conversationId]);

  // ─── بارگذاری پیام‌های قدیمی‌تر ─────────────────────────────────────────
  const loadMore = useCallback(() => {
    if (state.cursor) loadHistory(state.cursor);
  }, [loadHistory, state.cursor]);

  const markRead = useCallback(() => {
    socketRef.current?.emit("read_messages", readPayload(conversationId));
  }, [conversationId]);

  return {
    messages:    state.messages,
    hasMore:     state.hasMore,
    loading:     state.loading,
    connected:   state.connected,
    typingUsers: state.typingUsers,
    sendText,
    sendFile,
    sendTyping,
    loadMore,
    markRead,
    pending,
    cancelPending,
    expiredCount,
    error: state.error,
    dismissError: () => setState((s) => ({ ...s, error: null })),
    dismissExpired: () => setExpiredCount(0),
  };
}
