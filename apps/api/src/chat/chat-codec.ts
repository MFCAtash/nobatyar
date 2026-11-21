import { aad } from "../crypto";
import type { FieldCrypto } from "../crypto";

/** رمزگشایی/نمای پیام‌ها — توابع خالص (بدون DB)، با FieldCrypto ی تزریقی؛ قابل‌تست با crypto ساختگی. */
type Crypto = Pick<FieldCrypto, "decrypt">;

interface MsgRow {
  id: bigint; conversationId: string; senderId: string; kind: string; bodyEnc: Buffer;
  attachmentName: string | null; attachmentMime: string | null; attachmentBytes: number | null; attachmentKey: string | null;
  readAt: Date | null; editedAt: Date | null; createdAt: Date;
}

/**
 * AAD ی متن پیام: «جدول + شناسه + ستون» (aad سه پارامتر می‌خواهد؛ پیش‌تر دو پارامتر داده می‌شد ⇒ tsc خطا و AAD = "msg:ID:undefined").
 * برای دادهی توسعه‌ی قدیمی، رمزگشایی در صورت شکست با AAD ی قدیمی هم امتحان می‌شود (فقط خواندن؛ نوشتن همیشه AAD ی جدید).
 */
export const bodyAad = (id: bigint | string): string => aad("messages", id.toString(), "body");
const legacyBodyAad = (id: bigint | string): string => `msg:${id.toString()}:undefined`;

export function openBody(crypto: Crypto, enc: Buffer, id: bigint | string): Buffer {
  try { return crypto.decrypt(enc, bodyAad(id)); } catch { return crypto.decrypt(enc, legacyBodyAad(id)); }
}

/** متن پیام؛ هر خطای رمزگشایی ⇒ رشته‌ی خالی (یک پیام خراب نباید کل صفحه را بشکند). */
export function decryptBody(crypto: Crypto, m: Pick<MsgRow, "id" | "kind" | "bodyEnc">): string {
  if (m.kind !== "TEXT" && m.bodyEnc.length === 0) return "";
  try { return openBody(crypto, m.bodyEnc, m.id).toString("utf-8"); } catch { return ""; }
}

/** پیش‌نمایش آخرین پیام در لیست مکالمه‌ها. */
export function previewOf(crypto: Crypto, last: Pick<MsgRow, "id" | "kind" | "bodyEnc" | "attachmentName"> | undefined): string {
  if (!last) return "";
  if (last.kind !== "TEXT") return `📎 ${last.attachmentName ?? "فایل"}`;
  try { return openBody(crypto, last.bodyEnc, last.id).toString("utf-8").slice(0, 60); } catch { return "…"; }
}

export function toMessageView(crypto: Crypto, m: MsgRow) {
  return {
    id: m.id.toString(), conversationId: m.conversationId, senderId: m.senderId, kind: m.kind,
    body: decryptBody(crypto, m),
    attachmentName: m.attachmentName, attachmentMime: m.attachmentMime, attachmentBytes: m.attachmentBytes,
    hasAttachment: !!m.attachmentKey, readAt: m.readAt, editedAt: m.editedAt, createdAt: m.createdAt,
  };
}

/** پاسخ پس از ارسال: متن همان است که فرستنده داده (دوباره رمزگشایی نمی‌شود). */
export function toSentView(msg: Omit<MsgRow, "bodyEnc" | "readAt" | "editedAt">, body: string) {
  return {
    id: msg.id.toString(), conversationId: msg.conversationId, senderId: msg.senderId, kind: msg.kind, body,
    attachmentName: msg.attachmentName, attachmentMime: msg.attachmentMime, attachmentBytes: msg.attachmentBytes,
    hasAttachment: !!msg.attachmentKey, createdAt: msg.createdAt,
  };
}

/** cursor ی پیام: فقط عدد ۱ تا ۱۸ رقمی (BigInt امن). */
export const parseMessageCursor = (v: string): bigint | null => (/^\d{1,18}$/.test(v) ? BigInt(v) : null);
