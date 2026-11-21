/**
 * حالت اعلان‌ها در کلاینت — توابع خالص (قابل‌تست). منبع داده‌ها دو مسیر هم‌زمان است:
 *  ۱) REST (صفحه‌ی اول لیست)  ۲) SSE (اعلان زنده + بازپخش پس از reconnect)
 * این دو ممکن است همپوشانی داشته باشند؛ ادغام بر اساس id انجام می‌شود تا نه تکراری بماند و نه چیزی گم شود.
 */
export interface Notification {
  id:        string;
  kind:      string;
  titleFa:   string;
  bodyFa:    string;
  payload?:  Record<string, unknown>;
  readAt:    string | null;
  createdAt: string;
}

export interface NotificationsState {
  items:   Notification[];
  unread:  number;
  hasMore: boolean;
  cursor:  string | null;
  loading: boolean;
}

export interface NotificationsPage {
  items:   Notification[];
  unread:  number;
  hasMore: boolean;
  cursor:  string | null;
}

/** جدیدترین اول؛ با تساوی زمان، id برای پایداری ترتیب. */
const newestFirst = (a: Notification, b: Notification): number =>
  a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0;

/** داده‌ی خام SSE را اعتبارسنجی می‌کند؛ نامعتبر ⇒ null. */
export function parseNotification(raw: string): Notification | null {
  try {
    const v = JSON.parse(raw) as Partial<Notification> | null;
    if (!v || typeof v.id !== "string" || typeof v.titleFa !== "string" || typeof v.bodyFa !== "string" || typeof v.createdAt !== "string") return null;
    return {
      id: v.id, kind: typeof v.kind === "string" ? v.kind : "SYSTEM", titleFa: v.titleFa, bodyFa: v.bodyFa,
      payload: v.payload && typeof v.payload === "object" ? (v.payload as Record<string, unknown>) : undefined,
      readAt: typeof v.readAt === "string" ? v.readAt : null, createdAt: v.createdAt,
    };
  } catch {
    return null;
  }
}

/** اعلان زنده (یا بازپخش‌شده). اگر قبلاً داریم: بدون تغییر شمارنده. */
export function applyLive(s: NotificationsState, n: Notification): NotificationsState {
  if (s.items.some((x) => x.id === n.id)) return s;
  return {
    ...s,
    items: [...s.items, n].sort(newestFirst),
    unread: n.readAt ? s.unread : s.unread + 1,
  };
}

/**
 * ادغام صفحه‌ی اول REST با حالت فعلی (که ممکن است اعلان‌های زنده‌ی جدیدتر یا صفحات بعدی داشته باشد).
 *  - برای idهای مشترک، نسخه‌ی سرور (readAt) معتبر است.
 *  - شمارنده‌ی unread = مقدار سرور + اعلان‌های خوانده‌نشده‌ی «زنده‌ی جدیدتر از snapshot ی سرور».
 */
export function mergeFirstPage(s: NotificationsState, page: NotificationsPage): NotificationsState {
  const fetched = new Map(page.items.map((n) => [n.id, n]));
  const newest = page.items.length ? page.items.reduce((m, n) => (n.createdAt > m ? n.createdAt : m), page.items[0].createdAt) : null;
  const oldest = page.items.length ? page.items.reduce((m, n) => (n.createdAt < m ? n.createdAt : m), page.items[0].createdAt) : null;

  const local = s.items.filter((n) => !fetched.has(n.id));
  const postSnapshotUnread = local.filter((n) => !n.readAt && (newest === null || n.createdAt > newest)).length;
  // اگر صفحات بعدی را هم بار کرده‌ایم (قدیمی‌تر از قدیمی‌ترین مورد صفحه‌ی اول)، cursor/hasMore ی فعلی معتبرتر است
  const hasDeeper = oldest !== null && local.some((n) => n.createdAt < oldest);

  return {
    ...s,
    items: [...page.items, ...local].sort(newestFirst),
    unread: page.unread + postSnapshotUnread,
    hasMore: hasDeeper ? s.hasMore : page.hasMore,
    cursor: hasDeeper ? s.cursor : page.cursor,
    loading: false,
  };
}
