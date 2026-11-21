"use client";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

/** تمهای اصلی پروژه (انتخاب کاربر): زمرد شب، بنفش درمانگاه، نیلی بخش، گرافیت پزشکی، بالینی تیره */
export const THEMES = [
  { id: "clinical-light", label: "بالینی روشن", desc: "پیشفرض بیمار — اعتماد و آرامش", group: "روشن", main: false },
  { id: "calm-teal", label: "سبز آرام", desc: "پروفایل سلامت و پایش از راه دور", group: "روشن", main: false },
  { id: "low-bandwidth", label: "کمپهنایباند", desc: "تک رنگ، بدون blur و gradient", group: "روشن", main: false },
  { id: "senior", label: "سالمند", desc: "فونت بزرگ و اهداف لمس ۴۸px", group: "روشن", main: false },
  { id: "clinical-dark", label: "بالینی تیره", desc: "پنل پزشک و اتاق ویزیت", group: "تیره", main: true },
  { id: "midnight-blue", label: "نیمه شب آبی", desc: "کادر پزشکی شبانه — آبی عمیق", group: "تیره", main: false },
  { id: "emerald-night", label: "زمرد شب", desc: "سبز تیره بالینی و آرام", group: "تیره", main: true },
  { id: "violet-clinic", label: "بنفش درمانگاه", desc: "بنفش ملایم برای تمرکز", group: "تیره", main: true },
  { id: "graphite-med", label: "گرافیت پزشکی", desc: "خاکستری-تیل حرفهای و کمحاشیه", group: "تیره", main: true },
  { id: "amber-oncall", label: "کهربای کشیک", desc: "گرم و کم نور برای شیفت شب", group: "تیره", main: false },
  { id: "indigo-ward", label: "نیلی بخش", desc: "نیلی تیره مناسب مانیتورینگ", group: "تیره", main: true },
  { id: "high-contrast", label: "کنتراست بالا", desc: "ادمین و انطباق — WCAG AAA", group: "تیره", main: false },
  { id: "spring-night", label: "شب بهاری", desc: "سبز روشن و طراوت بهار", group: "فصلی", main: false },
  { id: "summer-night", label: "شب تابستانی", desc: "فیروزهای خنک و آرام", group: "فصلی", main: false },
  { id: "autumn-night", label: "شب پاییزی", desc: "کهربایی گرم و دلنشین", group: "فصلی", main: false },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"] | "dark" | "light";
export type Density = "compact" | "comfortable";
export type FontScale = "100" | "125" | "150";

export const FONTS = [
  { id: "vazirmatn", label: "وزیرمتن", sample: "نوبت‌یار — سلامت شما در دسترس", sub: "خوانا و مدرن · پیشفرض" },
  { id: "nastaliq", label: "نستعلیق", sample: "نوبت‌یار — سلامت شما در دسترس", sub: "خط کلاسیک فارسی · رسمی و زیبا" },
  { id: "naskh", label: "نسخ", sample: "نوبت‌یار — سلامت شما در دسترس", sub: "نسخ عربی · متعادل و سنتی" },
  { id: "amiri", label: "امیری", sample: "نوبت‌یار — سلامت شما در دسترس", sub: "خط قرآنی · وقار و آرامش" },
  { id: "scheherazade", label: "شهرزاد", sample: "نوبت‌یار — سلامت شما در دسترس", sub: "خط شرقی کلاسیک · مناسب عناوین" },
  { id: "inter-en", label: "Inter (انگلیسی)", sample: "Care. Simplified. Nobatyar", sub: "برای رابطهای انگلیسی و کدها" },
] as const;
export type FontId = (typeof FONTS)[number]["id"];

interface ThemeState {
  theme: ThemeId;
  density: Density;
  fontScale: FontScale;
  font: FontId;
  adaptive: boolean;
  setAdaptive: (v: boolean) => void;
  setTheme: (t: ThemeId) => void;
  setDensity: (d: Density) => void;
  setFontScale: (f: FontScale) => void;
  setFont: (f: FontId) => void;
  cycle: () => void;
}

const Ctx = createContext<ThemeState | null>(null);
const KEY = "nvy-theme";
const DENSITY_KEY = "nvy-density";
const FONT_KEY = "nvy-font-scale";
const FONT_ID_KEY = "nvy-font";
const ADAPTIVE_KEY = "nvy-adaptive-theme";
const legacy = (v: string | null): ThemeId => {
  if (v === "dark") return "clinical-dark";
  if (v === "light") return "clinical-light";
  return (THEMES.some((t) => t.id === v) ? v : "emerald-night") as ThemeId;
};

const isDarkTheme = (t: ThemeId) => t !== "light" && t !== "clinical-light" && t !== "calm-teal" && t !== "senior" && t !== "low-bandwidth";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("emerald-night");
  const [density, setDensityState] = useState<Density>("comfortable");
  const [fontScale, setFontScaleState] = useState<FontScale>("100");
  const [font, setFontState] = useState<FontId>("scheherazade");
  const [adaptive, setAdaptiveState] = useState(false);

  useEffect(() => {
    try {
      setThemeState(legacy(localStorage.getItem(KEY)));
      setDensityState(localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable");
      const f = localStorage.getItem(FONT_KEY);
      setFontScaleState(f === "125" || f === "150" ? f : "100");
      const fid = localStorage.getItem(FONT_ID_KEY);
      setFontState(FONTS.some((x) => x.id === fid) ? (fid as FontId) : "scheherazade");
      setAdaptiveState(localStorage.getItem(ADAPTIVE_KEY) === "true");
    } catch { /* حالت خصوصی */ }
  }, []);

  // تم تطبیقی ساعتی: شبانه بعد از ۱۹ و روشن در طول روز (با امکان غیرفعالسازی)
  useEffect(() => {
    if (!adaptive) return;
    const h = new Date().getHours();
    const t: ThemeId = h >= 19 || h < 7 ? "emerald-night" : "clinical-light";
    setThemeState(t);
  }, [adaptive]);

  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute("data-theme", theme);
    el.setAttribute("data-density", density);
    el.setAttribute("data-font-scale", fontScale);
    el.setAttribute("data-font", font);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isDarkTheme(theme) ? "#0b1220" : "#f5f9fb");
  }, [theme, density, fontScale, font]);

  const setTheme = useCallback((t: ThemeId) => { setThemeState(t); try { localStorage.setItem(KEY, t); } catch { /* ignore */ } }, []);
  const setDensity = useCallback((d: Density) => { setDensityState(d); try { localStorage.setItem(DENSITY_KEY, d); } catch { /* ignore */ } }, []);
  const setFontScale = useCallback((f: FontScale) => { setFontScaleState(f); try { localStorage.setItem(FONT_KEY, f); } catch { /* ignore */ } }, []);
  const setFont = useCallback((f: FontId) => { setFontState(f); try { localStorage.setItem(FONT_ID_KEY, f); } catch { /* ignore */ } }, []);
  const setAdaptive = useCallback((v: boolean) => { setAdaptiveState(v); try { localStorage.setItem(ADAPTIVE_KEY, String(v)); } catch { /* ignore */ } }, []);
  const cycle = useCallback(() => {
    const i = THEMES.findIndex((t) => t.id === theme);
    setTheme(THEMES[(i + 1) % THEMES.length]!.id);
  }, [theme, setTheme]);

  const value = useMemo(() => ({ theme, density, fontScale, font, adaptive, setAdaptive, setTheme, setDensity, setFontScale, setFont, cycle }), [theme, density, fontScale, font, adaptive, setAdaptive, setTheme, setDensity, setFontScale, setFont, cycle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme must be used inside ThemeProvider");
  return v;
}
