/**
 * لوگوی منحصربفرد نوبتیار — طراحی کلاسیک:
 * دایره (تداوم مراقبت) + خط ECG (قلب و سلامت) + صلیب کوچک (پزشکی)،
 * با هاله رنگی متناسب با تم و نام «نوبت‌یار» به خط نستعلیق.
 */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-wrap ${compact ? "brand-compact" : ""}`}>
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="38" height="38" role="presentation">
          <circle cx="24" cy="24" r="20" className="brand-ring" />
          <path d="M7 25h9l4-9 6 17 5-12 4 4h7" className="brand-ecg" fill="none" />
          <path d="M24 7v6M21 10h6" className="brand-cross" />
        </svg>
      </span>
      <span className="brand-name">نوبت‌یار</span>
    </span>
  );
}
