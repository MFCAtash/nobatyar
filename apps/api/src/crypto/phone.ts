const FA = "۰۱۲۳۴۵۶۷۸۹";
const AR = "٠١٢٣٤٥٦٧٨٩";

/**
 * نرمال‌سازی موبایل ایران به قالب "989XXXXXXXXX" (۱۲ رقم). نامعتبر → null.
 * ورودی‌های مجاز: 09123456789، +989123456789، 00989123456789، 9123456789 و ارقام فارسی/عربی.
 */
export function normalizeIranMobile(input: string): string | null {
  let s = "";
  for (const ch of input.trim()) {
    const fa = FA.indexOf(ch);
    const ar = AR.indexOf(ch);
    if (fa >= 0) s += String(fa);
    else if (ar >= 0) s += String(ar);
    else if (/[0-9]/.test(ch)) s += ch;
    else if (/[\s\-()+]/.test(ch)) continue;
    else return null;
  }
  if (s.startsWith("0098")) s = s.slice(4);
  else if (s.startsWith("98")) s = s.slice(2);
  else if (s.startsWith("0")) s = s.slice(1);
  return /^9\d{9}$/.test(s) ? `98${s}` : null;
}

/** تبدیل ارقام فارسی/عربی به ASCII و حذف فاصله‌ها (برای کد OTP). */
export function toAsciiDigits(input: string): string {
  let out = "";
  for (const ch of input.trim()) {
    const fa = FA.indexOf(ch);
    const ar = AR.indexOf(ch);
    out += fa >= 0 ? String(fa) : ar >= 0 ? String(ar) : ch;
  }
  return out.replace(/\s+/g, "");
}
