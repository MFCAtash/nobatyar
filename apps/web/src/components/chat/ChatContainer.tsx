"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@/hooks/use-chat";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth-context";
import { MAX_UPLOAD_MB } from "@/lib/files";
import { formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import { ChatView } from "./ChatView";

/** منطق چت: اتصال، ارسال، آپلود، دانلود. نمایش در ChatView است. */
export function ChatContainer({ conversationId }: { conversationId: string }) {
  const { api, me } = useAuth();
  const toast = useToast();
  const chat = useChat(conversationId);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { markRead, sendTyping, sendText, sendFile, messages, pending } = chat;

  useEffect(() => { bottomRef.current?.scrollIntoView?.({ behavior: "smooth" }); }, [messages.length, pending.length]);
  useEffect(() => { if (messages.length > 0) markRead(); }, [messages.length, markRead]);

  const onText = (v: string) => { setText(v); sendTyping(); };

  const onSend = async () => {
    const draft = text.trim();
    const r = await sendText(draft);
    if (r === "full") { toast("صف ارسال پر است؛ تا برقراری اتصال صبر کنید.", "bad"); return; }
    if (r === "empty") return;
    // در صورت خطا متن باقی میماند تا کاربر دوباره تلاش کند.
    if (r === "error") { toast(chat.error ?? "ارسال پیام ناموفق بود.", "bad"); return; }
    setText("");
    if (r === "queued") toast("اتصال قطع است؛ پیام پس از اتصال ارسال می‌شود.", "info");
  };

  const onFile = async (file: File) => {
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) { setUploadErr(`حداکثر اندازه فایل ${formatNumber(MAX_UPLOAD_MB)} مگابایت است`); return; }
    setUploading(true); setUploadErr(null);
    try { await sendFile(file); } catch (e) { setUploadErr(errorMessage(e)); } finally { setUploading(false); }
  };

  const onDownload = useCallback(async (msgId: string) => {
    try {
      const { url } = await api.get<{ url: string }>(`/conversations/messages/${msgId}/attachment`);
      window.open(url, "_blank", "noopener");
    } catch { toast("دریافت لینک دانلود ناموفق بود.", "bad"); }
  }, [api, toast]);

  return (
    <ChatView
      meId={me?.id} messages={messages} pending={pending} expiredCount={chat.expiredCount}
      connected={chat.connected} hasMore={chat.hasMore} loading={chat.loading} peerTyping={chat.typingUsers.length > 0}
      text={text} uploading={uploading} uploadErr={uploadErr} bottomRef={bottomRef}
      onText={onText} onSend={() => void onSend()} onFile={(f) => void onFile(f)} onLoadMore={chat.loadMore} onDownload={(id) => void onDownload(id)}
      onCancelPending={chat.cancelPending} onDismissError={() => setUploadErr(null)} onDismissExpired={chat.dismissExpired}
    />
  );
}
