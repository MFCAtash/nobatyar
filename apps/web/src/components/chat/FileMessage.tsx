import type { ChatMessage } from "@/hooks/use-chat";
import { formatBytes } from "@/lib/files";

export function FileMessage({ msg, isMe, onDownload }: { msg: ChatMessage; isMe: boolean; onDownload: (msgId: string) => void }) {
  const isImage = msg.attachmentMime?.startsWith("image/");
  return (
    <button type="button" className="file-msg" data-me={isMe} onClick={() => onDownload(msg.id)}>
      <span className="file-msg-icon" aria-hidden="true">{isImage ? "🖼️" : "📎"}</span>
      <span>
        <span className="file-msg-name">{msg.attachmentName ?? "فایل"}</span>
        {msg.attachmentBytes ? <span className="file-msg-size block">{formatBytes(msg.attachmentBytes)}</span> : null}
      </span>
    </button>
  );
}
