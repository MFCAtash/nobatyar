/** دایره‌ی حرف اول نام (بدون «دکتر»). */
export const initialOf = (fullName: string): string => fullName.replace(/^دکتر\s*/, "").charAt(0);

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  return <div className={`avatar avatar-${size}`} aria-hidden="true">{initialOf(name)}</div>;
}
