/** قرارداد خالص رویدادهای چت در سمت کلاینت — قابل تست بدون DOM. */

export type ChatSendKind = "TEXT" | "FILE" | "IMAGE";

export interface ChatSendPayload {
  conversationId: string;
  body: string;
  kind: ChatSendKind;
  objectKey?: string;
  attachmentName?: string;
  attachmentMime?: string;
  attachmentBytes?: number;
}

export function sendPayload(
  conversationId: string,
  body: string,
  kind: ChatSendKind = "TEXT",
  extra: Partial<Omit<ChatSendPayload, "conversationId" | "body" | "kind">> = {},
): ChatSendPayload {
  return { conversationId, body, kind, ...extra };
}

/** messageId اختیاری است؛ سرور تمام پیامهای طرف مقابل را علامت میزند. */
export function readPayload(conversationId: string, messageId?: string) {
  return messageId ? { conversationId, messageId } : { conversationId };
}

export type SendOutcome = "sent" | "queued" | "full" | "empty" | "error";

export interface AckResult {
  ok: boolean;
  error?: unknown;
  ack?: { ok?: boolean; messageId?: string };
}

export function isAckSuccess(r: AckResult): boolean {
  return r.ok && r.ack?.ok === true && typeof r.ack.messageId === "string";
}

const ERROR_FA: Record<string, string> = {
  unauthorized: "نشست شما منقضی شده است؛ دوباره وارد شوید.",
  invalid_payload: "پیام معتبر نبود؛ دوباره تلاش کنید.",
  forbidden: "شما عضو این مکالمه نیستید.",
  not_found: "مکالمه یافت نشد.",
  server_error: "پیام ذخیره نشد؛ دوباره تلاش کنید.",
  timeout: "پاسخی از سرور نرسید؛ پیام ارسال نشد.",
};

/** پیام خطای فاقد PHI برای نمایش در UI. */
export function wsErrorMessage(raw: unknown): string {
  const obj = raw as { code?: unknown; message?: string } | null | undefined;
  const code = typeof obj?.code === "string" ? obj.code : "";
  return ERROR_FA[code] ?? "ارسال پیام ناموفق بود.";
}
