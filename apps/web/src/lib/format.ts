/** قالب‌بندی فارسی/جلالی بر پایه‌ی Intl (بدون وابستگی). منطقه‌ی زمانی همه‌جا Asia/Tehran است. */
const TZ = "Asia/Tehran";

const fa = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: TZ, ...opts });
const faTime = new Intl.DateTimeFormat("fa-IR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const enDate = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const faNum = new Intl.NumberFormat("fa-IR");
const faPlain = new Intl.NumberFormat("fa-IR", { useGrouping: false });
const faDec1 = new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** «۰۹:۰۰» */
export const formatTime = (d: Date | string): string => faTime.format(new Date(d));

/** «سه‌شنبه ۲۱ مهر» */
export const formatDayLabel = (d: Date | string): string =>
  fa({ weekday: "long", day: "numeric", month: "long" }).format(new Date(d));

/** «۱۴۰۵/۰۷/۲۱» */
export const formatJalaliDate = (d: Date | string): string =>
  fa({ year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));

/** «سه‌شنبه ۲۱ مهر ۱۴۰۵، ساعت ۰۹:۰۰» */
export const formatDateTime = (d: Date | string): string =>
  `${fa({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(d))}، ساعت ${formatTime(d)}`;

/** تاریخ محلی تهران به‌صورت YYYY-MM-DD — همان قالبی که API برای اسلات‌ها می‌خواهد. */
export const tehranDateStr = (d: Date): string => enDate.format(d);

/** n روز متوالی (از امروز تهران) به‌صورت رشته‌ی YYYY-MM-DD */
export function nextTehranDays(n: number, from: Date = new Date()): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < n && i < n + 3; i++) {
    const s = tehranDateStr(new Date(from.getTime() + i * 86_400_000));
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/** برچسب روز برای یک رشته‌ی YYYY-MM-DD (ظهر تهران تا از مرز روز دور باشیم). */
export function dayLabelFromDateStr(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  return formatDayLabel(new Date(Date.UTC(y, m - 1, d, 12) - 3.5 * 3_600_000));
}

export const formatNumber = (n: number | bigint | string): string => faNum.format(typeof n === "string" ? BigInt(n) : n);

/** عدد بدون جداکننده‌ی هزارگان و با ارقام فارسی: سال تولد «۱۳۷۰» (نه «۱٬۳۷۰»)، شماره‌ی قلم، کد */
export const formatDigits = (n: number | string): string => faPlain.format(typeof n === "string" ? Number(n) : n);

/** «۹۹+» برای شمارنده‌ی نشان (badge) */
export const formatBadgeCount = (n: number, max = 99): string => (n > max ? `${formatNumber(max)}+` : formatNumber(n));

/** حجم فایل با ارقام و واحد فارسی: «۱٫۵ مگابایت» */
export function formatBytes(b: number): string {
  if (b < 1024) return `${formatNumber(b)} بایت`;
  if (b < 1024 * 1024) return `${faDec1.format(b / 1024)} کیلوبایت`;
  return `${faDec1.format(b / 1024 / 1024)} مگابایت`;
}

/** «۱۴۰۵/۰۷/۲۱، ۰۹:۰۰» — برای فهرست‌ها و حباب‌ها (کوتاه‌تر از formatDateTime) */
export const formatJalaliDateTime = (d: Date | string): string => `${formatJalaliDate(d)}، ${formatTime(d)}`;

/** «۲۱ مهر ۱۴۰۵» — تاریخ میانه (جایگزین dateStyle: "medium") */
export const formatJalaliMedium = (d: Date | string): string =>
  fa({ day: "numeric", month: "long", year: "numeric" }).format(new Date(d));

/** مقدار input[type=date] (YYYY-MM-DD، تقویم میلادی مرورگر) ⇒ «۲۱ مهر ۱۴۰۵»؛ نامعتبر ⇒ "" */
export function formatDateInputValue(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return "";
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) - 3.5 * 3_600_000);
  return Number.isNaN(dt.getTime()) ? "" : formatJalaliMedium(dt);
}

/** ISO ی مقدار datetime-local (وقت تهران) برای نمایش شمسی؛ نامعتبر ⇒ "" */
export function formatLocalInputValue(v: string): string {
  const iso = tehranLocalToIso(v);
  return iso ? formatDateTime(iso) : "";
}

/** مبلغ API به ریال است؛ نمایش به تومان. «۰» ⇒ رایگان */
export function formatToman(rial: string | bigint): string {
  const r = typeof rial === "bigint" ? rial : BigInt(rial);
  if (r === 0n) return "رایگان";
  return `${faNum.format(r / 10n)} تومان`;
}

/** تخمین بازپرداخت لغو بیمار (فقط راهنمای نمایشی — تصمیم نهایی با سرور است). */
export function estimateRefundPercent(startsAt: Date | string, now: Date = new Date()): 100 | 50 | 0 {
  const hours = (new Date(startsAt).getTime() - now.getTime()) / 3_600_000;
  return hours >= 24 ? 100 : hours >= 2 ? 50 : 0;
}

/** فقط مسیرهای داخلی سایت برای redirect (جلوگیری از open-redirect). */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}

const FA = "۰۱۲۳۴۵۶۷۸۹";
const AR = "٠١٢٣٤٥٦٧٨٩";
/** ارقام فارسی/عربی ⇒ ASCII (برای موبایل و کد OTP) */
/** ارقام لاتین ⇒ فارسی (بدون جداکننده؛ مناسب شماره‌ی تلفن/کد برای نمایش) */
export const toPersianDigits = (s: string): string => s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

export function toAsciiDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const i = FA.indexOf(ch);
    const j = AR.indexOf(ch);
    out += i >= 0 ? String(i) : j >= 0 ? String(j) : ch;
  }
  return out;
}

/** مقدار input[type=datetime-local] (وقت تهران، بدون منطقه) ⇒ ISO/UTC. نامعتبر ⇒ null */
export function tehranLocalToIso(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi) - 210 * 60_000; // +03:30
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** ثانیه ⇒ «۰۵:۰۳» (ارقام فارسی) */
export function formatCountdown(totalSec: number): string {
  const t = Math.max(0, Math.floor(totalSec));
  const two = (n: number) => faNum.format(n).padStart(2, "۰");
  return `${two(Math.floor(t / 60))}:${two(t % 60)}`;
}
