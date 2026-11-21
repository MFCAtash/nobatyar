/**
 * متن پوش‌ها «عمداً عمومی» است: نام پزشک/بیمار، تخصص، دلیل مراجعه یا هر داده‌ی سلامتی نمی‌آید.
 * (پوش از سرویس‌های Google/Apple/Mozilla عبور می‌کند و روی صفحه‌ی قفل نمایش داده می‌شود.)
 * تنها شناسه‌ی شبه‌ناشناس (UUID) نوبت در URL نسبی می‌آید.
 */
export interface PushPayload {
  title: string;
  body: string;
  /** فقط مسیر نسبی همین سایت */
  url: string;
  tag: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildReminderPayload(kind: "24h" | "1h", appointmentId: string): PushPayload {
  if (!UUID_RE.test(appointmentId)) throw new Error("invalid appointment id");
  return {
    title: "یادآوری نوبت",
    body: kind === "1h" ? "نوبت شما حدود یک ساعت دیگر شروع می‌شود." : "فردا نوبت دارید. برای جزئیات وارد برنامه شوید.",
    url: `/appointments/${appointmentId}`,
    tag: `appt-${appointmentId}-${kind}`,
  };
}

/** اعتبارسنجی نهایی پیش از ارسال: URL فقط نسبی و بدون // یا scheme. */
export function assertSafePayload(p: PushPayload): void {
  if (!/^\/[A-Za-z0-9/_-]*$/.test(p.url) || p.url.startsWith("//")) throw new Error("push url must be a same-origin relative path");
  if (p.title.length > 60 || p.body.length > 160) throw new Error("push text too long");
}
