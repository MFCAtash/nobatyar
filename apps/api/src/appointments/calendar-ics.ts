/** خروجی تقویم استاندارد RFC 5545 — فاقد PHI (دلیل مراجعه، کد ملی و شماره تلفن وارد نمیشود). */
export interface IcsEventInput {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  location?: string | null;
  description?: string | null;
}

const escapeText = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** تمام خطها حداکثر ۷۵ اکتت باشند ( folding استاندارد ). */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    if (bytes + size > 73) { parts.push(current); current = " "; bytes = 1; }
    current += ch; bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n");
}

const utc = (d: Date): string => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function buildIcs(e: IcsEventInput): string {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nobatyar//SmartBooking//FA", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}@nobatyar`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(e.start)}`,
    `DTEND:${utc(e.end)}`,
    `SUMMARY:${escapeText(e.summary)}`,
  ];
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
