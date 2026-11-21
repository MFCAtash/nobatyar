import type { ChatMessage } from "@/hooks/use-chat";
import { DateText } from "@/components/kit";
import { FileMessage } from "./FileMessage";

export function MessageBubble({ msg, isMe, onDownload }: { msg: ChatMessage; isMe: boolean; onDownload: (msgId: string) => void }) {
  return (
    <div className="msg" data-me={isMe}>
      <div className="msg-col">
        {msg.kind === "TEXT" || msg.kind === "SYSTEM"
          ? <div className="bubble" data-me={isMe}>{msg.body}</div>
          : <FileMessage msg={msg} isMe={isMe} onDownload={onDownload} />}
        <div className="msg-meta">
          <DateText value={msg.createdAt} variant="time" className="msg-time num" />
          {isMe && (
            <span className="msg-tick" data-read={Boolean(msg.readAt)}>
              {msg.readAt ? "✓✓" : "✓"}
              <span className="sr-only">{msg.readAt ? "خوانده شد" : "ارسال شد"}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** پیامی که هنوز به سرور نرسیده (قطعی اتصال) */
export function PendingBubble({ body, onCancel }: { body: string; onCancel: () => void }) {
  return (
    <div className="msg" data-me="true">
      <div className="msg-col">
        <div className="bubble" data-me="true" data-pending="true">{body}</div>
        <div className="msg-meta">
          <span className="msg-time">⏳ در صف ارسال</span>
          <button type="button" className="msg-link" onClick={onCancel}>لغو</button>
        </div>
      </div>
    </div>
  );
}

export function TypingBubble() {
  return (
    <div className="msg" role="status" aria-label="طرف مقابل در حال نوشتن است">
      <div className="typing" aria-hidden="true"><i /><i /><i /></div>
    </div>
  );
}
