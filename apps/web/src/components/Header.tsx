"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/Brand";
import { useTheme } from "@/components/ThemeProvider";
import { formatBadgeCount, formatNumber } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { useNotifications } from "@/lib/use-notifications";
import { moduleEnabled } from "@/components/system/ModuleGate";

interface NavItem { href: string; label: string; exact?: boolean; group: string }

const PATIENT: NavItem[] = [
  { href: "/", label: "جستجوی پزشک", group: "ویزیت" },
  { href: "/appointments", label: "نوبت‌های من", group: "ویزیت" },
  { href: "/chat", label: "پیام‌ها", group: "ویزیت" },
  { href: "/family", label: "اعضای خانواده", group: "پرونده من" },
  { href: "/records", label: "پرونده سلامت", group: "پرونده من" },
  { href: "/health-profile", label: "پروفایل سلامت", group: "پرونده من" },
  { href: "/vitals", label: "پایش از راه دور", group: "پرونده من" },
  { href: "/prescriptions", label: "نسخه‌ها", group: "پرونده من" },
  { href: "/second-opinions", label: "نظر دوم", group: "خدمات" },
  { href: "/triage", label: "ارزیابی علائم", group: "خدمات" },
  { href: "/privacy", label: "حریم خصوصی", group: "خدمات" },
  { href: "/precheck", label: "آمادگی ویزیت", group: "خدمات" },
  { href: "/support", label: "پشتیبانی", group: "خدمات" },
  { href: "/wallet", label: "کیف پول", group: "حساب" },
  { href: "/security", label: "امنیت و Passkey", group: "حساب" },
  ...(moduleEnabled("FF_M9_PATIENT_RECORD") ? [{ href: "/health/record", label: "پروندهٔ من (تایم لاین)", group: "پرونده من" }] : []),
  ...(moduleEnabled("FF_M10_TRIAGE_GOV") ? [{ href: "/triage/ruleset", label: "قواعد ارزیابی", group: "خدمات" }] : []),
  ...(moduleEnabled("FF_M14_ECOSYSTEM") ? [{ href: "/growth/clinics", label: "کلینیک‌ها", group: "خدمات" }] : []),
  ...(moduleEnabled("FF_M15_WCAG") || moduleEnabled("FF_M5_NOTIF_ORCHESTRATOR") ? [{ href: "/settings/preferences", label: "تنظیمات من", group: "حساب" }] : []),
];
const DOCTOR: NavItem[] = [
  { href: "/doctor", label: "پنل پزشک", exact: true, group: "کار من" },
  { href: "/doctor/schedule", label: "برنامه‌ی کاری", group: "کار من" },
  { href: "/prescriptions", label: "نسخه‌ها", group: "کار من" },
  { href: "/second-opinions", label: "نظر دوم", group: "کار من" },
  { href: "/vitals", label: "پایش از راه دور", group: "کار من" },
  ...(moduleEnabled("FF_M7_CHAT_ASSIST") ? [{ href: "/chat/assist", label: "دستیار چت", group: "کار من" }] : []),
  ...(moduleEnabled("FF_M8_VIDEO_SMART") ? [{ href: "/video/policy", label: "سیاست ویدئو", group: "کار من" }] : []),
  ...(moduleEnabled("FF_M14_ECOSYSTEM") ? [{ href: "/growth/clinics", label: "فضای کاری و کلینیک‌ها", group: "کار من" }] : []),
];
const ADMIN: NavItem[] = [
  { href: "/admin/verifications", label: "تأیید پزشکان", group: "مدیریت" },
  { href: "/admin/refunds", label: "استرداد وجه", group: "مدیریت" },
  { href: "/admin/payments", label: "پرداخت‌ها", group: "مدیریت" },
  { href: "/admin/security", label: "امنیت حساب", group: "مدیریت" },
  { href: "/admin/data-requests", label: "درخواستهای حریم خصوصی", group: "مدیریت" },
  ...(moduleEnabled("FF_M11_AUTO_OPS") ? [{ href: "/admin/ops", label: "عملیات و SLO", group: "مدیریت" }] : []),
  ...(moduleEnabled("FF_M13_PRODUCT_ANALYTICS") ? [{ href: "/admin/analytics", label: "تحلیل محصول", group: "مدیریت" }] : []),
];

/** B1: ناوبری گروهی — ۳ لینک اصلی + drawer قابلدسترس برای بقیه. */
export function Header() {
  const { status, me, logout } = useAuth();
  const path = usePathname();
  const { theme, cycle } = useTheme();
  const { unread } = useNotifications();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMenuOpen(false); }, [path]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenuOpen(false); menuRef.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const items: NavItem[] = me?.role === "PATIENT" ? PATIENT : me?.role === "DOCTOR" ? DOCTOR : me?.role === "ADMIN" ? ADMIN : [];
  const primary = items.slice(0, 3);
  const rest = items.slice(3);
  const publicItems: NavItem[] = [
    { href: "/status", label: "وضعیت سامانه", group: "عمومی" },
    { href: "/design", label: "نمایشگاه طراحی", group: "عمومی" },
    { href: "/proposals", label: "نقشه پیشنهادها", group: "عمومی" },
  ];

  const active = (it: NavItem) => path === it.href || (!it.exact && it.href !== "/" && path.startsWith(`${it.href}/`)) || (it.href === "/" && path.startsWith("/doctors/"));
  const renderLink = (it: NavItem) => <Link key={it.href} href={it.href} aria-current={active(it) ? "page" : undefined}>{it.label}</Link>;
  const groups = Array.from(new Set([...rest, ...publicItems].map((i) => i.group)));

  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label="نوبت‌یار — صفحه اصلی"><Brand /></Link>
        <nav className="nav" aria-label="منوی اصلی">
          {primary.map(renderLink)}
          {(rest.length > 0 || !me) && (
            <>
              <button
                ref={menuRef}
                type="button"
                className="btn btn-ghost btn-sm nav-more"
                aria-expanded={menuOpen}
                aria-controls="nav-drawer"
                onClick={() => setMenuOpen((v) => !v)}
              >
                بیشتر {menuOpen ? "▴" : "▾"}
              </button>
              {menuOpen && (
                <div className="nav-drawer" id="nav-drawer" role="dialog" aria-label="منوی بیشتر">
                  {groups.map((g) => (
                    <section key={g}>
                      <h3>{g}</h3>
                      {[...rest, ...publicItems].filter((i) => i.group === g).map(renderLink)}
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
          {status === "authed" && (
            <Link href="/notifications" aria-label={`اعلانها${unread > 0 ? ` (${formatNumber(unread)} خواندهنشده)` : ""}`} className="bell">
              🔔{unread > 0 && <span className="bell-badge" aria-hidden="true">{formatBadgeCount(unread)}</span>}
            </Link>
          )}
          <button className="btn btn-ghost btn-sm" type="button" onClick={cycle} aria-label={`تغییر پوسته (فعلی: ${theme})`}>🎨</button>
          {status === "authed" ? (
            <button className="btn btn-sm" type="button" onClick={() => void logout()}>خروج</button>
          ) : status === "anon" ? (
            <Link className="btn btn-primary btn-sm" href="/login">ورود / ثبت‌نام</Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
