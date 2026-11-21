"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { useAuth } from "@/lib/auth-context";
import { enqueue, remove, splitFresh, type Pending } from "@/lib/outbox";

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
}

const TYPING_CLEAR_MS = 3000;

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
    typing: {}, typingUsers: [],
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
      setState((s) => ({ ...s, loading: false }));
    }
  }, [api, conversationId, status]);

  // ─── WebSocket ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== "authed") return;

    let io: Socket | undefined;
    (async () => {
      const { io: ioConnect } = await import("socket.io-client");

      // access token فقط در حافظه‌ی api نگه‌داری می‌شود؛ تابع auth در هر (re)connect توکن «تازه» را می‌گیرد
      io = ioConnect("/chat", {
        path:        "/socket.io",
        transports:  ["websocket"],
        auth:        (cb: (d: { token: string | null }) => void) => cb({ token: api.getToken() }),
        reconnectionAttempts: 5,
        reconnectionDelay:    1500,
      });
      socketRef.current = io;

      io.on("connect", () => {
        setState((s) => ({ ...s, connected: true }));
        // join اتاق
        io!.emit("join_conversation", conversationId);
        // ارسال پیام‌های صف‌شده‌ی دوران قطعی (پیام‌های بیش از ۱۵ دقیقه‌ای فرستاده نمی‌شوند)
        const { fresh, stale } = splitFresh(pendingRef.current);
        fresh.forEach((p) => io!.emit("send_message", { conversationId, body: p.body, kind: "TEXT" }));
        if (stale.length) setExpiredCount((n) => n + stale.length);
        if (pendingRef.current.length) setQueue([]);
      });

      io.on("disconnect", () => {
        setState((s) => ({ ...s, connected: false }));
      });

      io.on("new_message", (msg: ChatMessage) => {
        if (msg.conversationId !== conversationId) return;
        setState((s) => ({
          ...s,
          messages: [...s.messages, msg],
        }));
        // علامت خوانده
        io!.emit("read_messages", { conversationId });
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
  /** ⇒ "sent" (فوری) | "queued" (در صف تا اتصال) | "full" | "empty" */
  const sendText = useCallback((body: string): "sent" | "queued" | "full" | "empty" => {
    const sock = socketRef.current;
    if (sock?.connected) {
      if (!body.trim()) return "empty";
      sock.emit("send_message", { conversationId, body, kind: "TEXT" });
      return "sent";
    }
    const r = enqueue(pendingRef.current, body);
    if (!r.ok) return r.reason;
    setQueue(r.queue);
    return "queued";
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

    // مرحله ۳: ارسال پیام با objectKey
    socketRef.current?.emit("send_message", {
      conversationId,
      body:           "",
      kind:           file.type.startsWith("image/") ? "IMAGE" : "FILE",
      objectKey,
      attachmentName: file.name,
      attachmentMime: file.type,
      attachmentBytes:file.size,
    });
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

  const markRead = useCallback(() => { socketRef.current?.emit("read_messages", { conversationId }); }, [conversationId]);

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
    dismissExpired: () => setExpiredCount(0),
  };
}
