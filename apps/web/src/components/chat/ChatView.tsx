import type { RefObject } from "react";
import type { ChatMessage } from "@/hooks/use-chat";
import type { Pending } from "@/lib/outbox";
import { formatNumber } from "@/lib/format";
import { Composer } from "./Composer";
import { MessageBubble, PendingBubble, TypingBubble } from "./MessageBubble";

export interface ChatViewProps {
  meId: string | undefined;
  messages: ChatMessage[];
  pending: Pending[];
  expiredCount: number;
  connected: boolean;
  hasMore: boolean;
  loading: boolean;
  peerTyping: boolean;
  text: string;
  uploading: boolean;
  uploadErr: string | null;
  bottomRef?: RefObject<HTMLDivElement>;
  onText: (v: string) => void;
  onSend: () => void;
  onFile: (f: File) => void;
  onLoadMore: () => void;
  onDownload: (id: string) => void;
  onCancelPending: (localId: string) => void;
  onDismissError: () => void;
  onDismissExpired: () => void;
}

/** نمای خالص چت (بدون هوک/شبکه) — در Storybook با داده‌ی ساختگی نمایش داده می‌شود. */
export function ChatView(p: ChatViewProps) {
  return (
    <div className="chat-shell">
      <div className="chat-bar" role="status">
        <span className="chat-dot" data-on={p.connected} aria-hidden="true" />
        <span className="muted small">{p.connected ? "متصل" : "در حال اتصال مجدد…"}</span>
      </div>

      <div className="chat-scroll">
        {p.hasMore && (
          <div className="chat-more">
            <button type="button" className="btn btn-ghost btn-sm" disabled={p.loading} onClick={p.onLoadMore}>
              {p.loading ? "در حال بارگذاری…" : "پیام‌های قدیمی‌تر"}
            </button>
          </div>
        )}
        <div className="chat-list" role="log" aria-live="polite" aria-label="پیام‌ها">
          {p.messages.map((m) => <MessageBubble key={m.id} msg={m} isMe={m.senderId === p.meId} onDownload={p.onDownload} />)}
          {p.pending.map((x) => <PendingBubble key={x.localId} body={x.body} onCancel={() => p.onCancelPending(x.localId)} />)}
          {p.peerTyping && <TypingBubble />}
        </div>
        <div ref={p.bottomRef} />
      </div>

      {p.expiredCount > 0 && (
        <div className="chat-note" role="status">
          {formatNumber(p.expiredCount)} پیام به‌دلیل قطعی طولانی ارسال نشد؛ لطفاً دوباره بنویسید.
          <button type="button" className="reset-btn ms-2 fw-bold" onClick={p.onDismissExpired}>باشه</button>
        </div>
      )}
      {p.pending.length > 0 && !p.connected && (
        <div className="chat-note" role="status">پیام‌ها فقط تا بستن این صفحه در صف می‌مانند و پس از اتصال ارسال می‌شوند.</div>
      )}
      {p.uploadErr && (
        <div className="chat-alert" role="alert">
          {p.uploadErr}
          <button type="button" className="reset-btn" onClick={p.onDismissError} aria-label="بستن خطا">✕</button>
        </div>
      )}

      <Composer value={p.text} uploading={p.uploading} onChange={p.onText} onSend={p.onSend} onFile={p.onFile} />
    </div>
  );
}
