/**
 * قالب‌بندی فریم‌های SSE (text/event-stream) — منطق خالص.
 *
 * پروتکل نوبتیار:
 *   event: ready         — اشتراک Redis برقرار است؛ کلاینت می‌تواند لیست را از REST بگیرد. (بدون id)
 *   event: notification  — یک اعلان؛ id همان شناسه‌ی اعلان در DB است (= Last-Event-ID).
 *   event: resync        — بازپخش ممکن نیست (cursor نامعتبر/فاصله‌ی زیاد)؛ کلاینت لیست را از REST بگیرد.
 *   event: reconnect     — سرور اتصال را عمداً می‌بندد (انقضای توکن/سقف عمر/خاموشی)؛ فوراً reconnect کنید.
 *   : hb                 — heartbeat (کامنت؛ رویدادی به برنامه نمی‌رسد).
 */

export const SSE_EVENT = {
  READY: "ready",
  NOTIFICATION: "notification",
  RESYNC: "resync",
  RECONNECT: "reconnect",
} as const;

export interface NotificationEvent {
  id: string;
  kind: string;
  titleFa: string;
  bodyFa: string;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
}

export interface SseFrame {
  event?: string;
  id?: string;
  data: unknown;
  retry?: number;
}

const BAD_FIELD = /[\r\n\0]/;

export function formatEvent(f: SseFrame): string {
  let out = "";
  if (f.retry !== undefined) out += `retry: ${Math.max(0, Math.trunc(f.retry))}\n`;
  if (f.id !== undefined) {
    if (BAD_FIELD.test(f.id)) throw new Error("invalid SSE id");
    out += `id: ${f.id}\n`;
  }
  if (f.event !== undefined) {
    if (BAD_FIELD.test(f.event)) throw new Error("invalid SSE event name");
    out += `event: ${f.event}\n`;
  }
  const data = typeof f.data === "string" ? f.data : JSON.stringify(f.data);
  // هر خط داده جداگانه؛ JSON.stringify هرگز CR/LF خام تولید نمی‌کند، ولی رشته‌ی خام ممکن است.
  for (const line of data.split(/\r\n|\r|\n/)) out += `data: ${line}\n`;
  return out + "\n";
}

/** خط کامنت: مرورگر/کلاینت آن را نادیده می‌گیرد، ولی بایت به proxy می‌رسد و idle-timeout صفر می‌شود. */
export function formatComment(text: string): string {
  return `: ${text.replace(/[\r\n]+/g, " ")}\n\n`;
}

/** تعیین مدت اتصال مجدد برای کلاینت‌های EventSource (میلی‌ثانیه). */
export function formatRetry(ms: number): string {
  return `retry: ${Math.max(0, Math.trunc(ms))}\n\n`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
