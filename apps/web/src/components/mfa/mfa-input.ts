/** ورودی چالش MFA: یا TOTP ۶ رقمی یا کد پشتیبان ۴-۴-۴. خالص و قابل تست. */
export type MfaInput = { kind: "totp"; value: string } | { kind: "recovery"; value: string };

export function normalizeMfaInput(raw: string): MfaInput | null {
  const v = raw.replace(/[\sـ]/g, "").trim();
  if (/^\d{6}$/.test(v)) return { kind: "totp", value: v };
  const recovery = v.toUpperCase().replace(/-/g, "");
  if (/^[0-9A-F]{12}$/.test(recovery)) {
    return { kind: "recovery", value: `${recovery.slice(0, 4)}-${recovery.slice(4, 8)}-${recovery.slice(8)}` };
  }
  return null;
}
