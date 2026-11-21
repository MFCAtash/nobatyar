import { formatDateInputValue, formatLocalInputValue } from "@/lib/format";

/** پیش‌نمایش شمسی زیر input ی date / datetime-local (مرورگر همیشه میلادی نشان می‌دهد). */
export function JalaliPreview({ value, kind = "date" }: { value: string; kind?: "date" | "datetime-local" }) {
  const text = kind === "date" ? formatDateInputValue(value) : formatLocalInputValue(value);
  return <span className="help" aria-live="polite">{text ? `تاریخ شمسی: ${text}` : "\u00A0"}</span>;
}
