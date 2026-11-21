import type { Meta, StoryObj } from "@storybook/react";
import { messages, noop } from "@/stories/fixtures";
import { ChatView } from "./ChatView";
import { FileMessage } from "./FileMessage";

const base = {
  meId: "me", messages, pending: [], expiredCount: 0, connected: true, hasMore: false, loading: false, peerTyping: false,
  text: "", uploading: false, uploadErr: null,
  onText: noop, onSend: noop, onFile: noop, onLoadMore: noop, onDownload: noop, onCancelPending: noop, onDismissError: noop, onDismissExpired: noop,
};
const meta = { title: "Chat/ChatView", component: ChatView, args: base, parameters: { layout: "fullscreen" } } satisfies Meta<typeof ChatView>;
export default meta;
type S = StoryObj<typeof meta>;

export const Connected: S = {};
export const PeerTyping: S = { args: { peerTyping: true, hasMore: true } };
export const Empty: S = { args: { messages: [] } };
export const OfflineWithQueue: S = { args: { connected: false, pending: [{ localId: "p1", body: "ممنونم دکتر، امروز هم اندازه‌گیری می‌کنم.", at: 0 }], text: "پیام بعدی…" } };
export const ExpiredNotice: S = { args: { expiredCount: 2 } };
export const UploadError: S = { args: { uploadErr: "حداکثر اندازه فایل ۲۰ مگابایت است" } };

export const FileBubbles: StoryObj = {
  render: () => <div className="stack"><FileMessage msg={messages[2]} isMe onDownload={noop} /><FileMessage msg={messages[3]} isMe={false} onDownload={noop} /></div>,
};
