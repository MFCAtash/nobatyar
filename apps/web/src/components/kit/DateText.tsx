import { formatDateTime, formatJalaliDate, formatJalaliDateTime, formatJalaliMedium, formatNumber, formatTime, formatToman } from "@/lib/format";

type Variant = "date" | "medium" | "time" | "datetime" | "long";
const FMT: Record<Variant, (d: string | Date) => string> = {
  date: formatJalaliDate, medium: formatJalaliMedium, time: formatTime, datetime: formatJalaliDateTime, long: formatDateTime,
};

/** تاریخ/ساعت شمسی (وقت تهران) با <time dateTime> معتبر؛ تنها راه نمایش تاریخ در UI. */
export function DateText({ value, variant = "datetime", className }: { value: string | Date; variant?: Variant; className?: string }) {
  const iso = typeof value === "string" ? value : value.toISOString();
  return <time dateTime={iso} className={className}>{FMT[variant](value)}</time>;
}

/** عدد با ارقام فارسی و هزارگان */
export function Num({ value, className = "" }: { value: number | bigint | string; className?: string }) {
  return <span className={`num ${className}`.trim()}>{formatNumber(value)}</span>;
}

/** مبلغ ریال ⇒ تومان */
export function Money({ rial, className = "" }: { rial: string | bigint; className?: string }) {
  return <span className={`num ${className}`.trim()}>{formatToman(rial)}</span>;
}
