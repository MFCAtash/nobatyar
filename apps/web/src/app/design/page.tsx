"use client";
import Link from "next/link";
import { Alert, Badge, DataTable, EmptyState, FormField, Sparkline, StatCard, Stepper, VitalCard } from "@/components/design";
import { FONTS, THEMES, useTheme, type Density, type FontId, type FontScale, type ThemeId } from "@/components/ThemeProvider";
import { tokens } from "@/design/tokens.generated";
import { cssVars } from "@/lib/css";

const SWATCHES = ["black", "panel", "teal", "blue", "amber", "red", "ink", "ink-soft", "muted", "border"] as const;

/** نمایشگاه زنده طراحی — امکان انتخاب و اعمال هر تم بدون نیاز به ورود. */
export default function DesignShowcasePage() {
  const { theme, density, fontScale, font, adaptive, setAdaptive, setTheme, setDensity, setFontScale, setFont } = useTheme();
  const themes = (THEMES as readonly { id: ThemeId; label: string; desc: string; group: string; main: boolean }[]);
  const color = (tokens.themes as Record<string, Record<string, string>>)[theme] ?? (tokens.color.dark as Record<string, string>);
  const fonts = (FONTS as readonly { id: FontId; label: string; sample: string; sub: string }[]);

  return (
    <div className="stack">
      <header className="page-head">
        <div><h1>نمایشگاه طراحی نوبتیار</h1><p className="muted">تمهای جدید با سایه نور و هاله، فونتهای نستعلیق + Inter انگلیسی و کامپوننتها را ببینید و انتخاب خود را اعمال کنید.</p></div>
        <div className="row gap-2">
          <Link href="/" className="btn ghost">بازگشت</Link>
          <button className="btn btn-primary" type="button" onClick={() => setTheme(theme)}>تم فعلی به عنوان دیفالت اعمال شود</button>
        </div>
      </header>

      <section className="card stack">
        <h2 className="fs-lg m-0">۱) انتخاب تم {fonts.find(f=>f.id===font)?.label && <small className="muted">(فونت فعلی: {fonts.find(f=>f.id===font)!.label})</small>}</h2>
        <h3>روشن</h3>
        <div className="grid grid-3">
          {themes.filter((t) => t.group === "روشن").map((t) => (
            <button key={t.id} type="button" className={`ds-theme-card ${theme === t.id ? "selected" : ""}`} onClick={() => setTheme(t.id as ThemeId)} aria-pressed={theme === t.id}>
              <span className="ds-theme-preview">
                <i className="ds-theme-bar" />
                <i className="ds-theme-dot" />
                <i className="ds-theme-line" />
              </span>
              <strong>{t.label}</strong>
              <span className="muted small">{t.desc}</span>
              <div className="row gap-2 wrap">
                {t.main && <Badge tone="info">تم اصلی پروژه</Badge>}
                {theme === t.id && <Badge tone="ok">اعمال شده در زنده</Badge>}
              </div>
            </button>
          ))}
        </div>
        <h3>تیره (Dark)</h3>
        <div className="grid grid-3">
          {themes.filter((t) => t.group === "تیره").map((t) => (
            <button key={t.id} type="button" className={`ds-theme-card ${theme === t.id ? "selected" : ""}`} onClick={() => setTheme(t.id as ThemeId)} aria-pressed={theme === t.id}>
              <span className="ds-theme-preview">
                <i className="ds-theme-bar" />
                <i className="ds-theme-dot" />
                <i className="ds-theme-line" />
                <span className="ds-theme-glow" aria-hidden="true" />
              </span>
              <strong>{t.label}</strong>
              <span className="muted small">{t.desc}</span>
              <div className="row gap-2 wrap">
                {t.main && <Badge tone="info">تم اصلی پروژه</Badge>}
                {theme === t.id && <Badge tone="ok">اعمال شده در زنده</Badge>}
              </div>
            </button>
          ))}
        </div>
        <h3>فصلی</h3>
        <div className="grid grid-3">
          {themes.filter((t) => t.group === "فصلی").map((t) => (
            <button key={t.id} type="button" className={`ds-theme-card ${theme === t.id ? "selected" : ""}`} onClick={() => setTheme(t.id as ThemeId)} aria-pressed={theme === t.id}>
              <span className="ds-theme-preview">
                <i className="ds-theme-bar" />
                <i className="ds-theme-dot" />
                <i className="ds-theme-line" />
                <span className="ds-theme-glow" aria-hidden="true" />
              </span>
              <strong>{t.label}</strong>
              <span className="muted small">{t.desc}</span>
              {theme === t.id && <Badge tone="ok">اعمال شده در زنده</Badge>}
            </button>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h2 className="fs-lg m-0">۲) فونت متن فارسی <small className="muted">(تغییر فونت جای خودش همان صفحه عمومی میشود)</small></h2>
        <div className="stack gap-2">
          {fonts.map((f) => (
            <button key={f.id} type="button" className={`ds-font-card ${font === f.id ? "selected" : ""}`} onClick={() => setFont(f.id as FontId)} aria-pressed={font === f.id}>
              <span className="ds-font-name">{f.label}</span>
              <span className="ds-font-sample" data-font={f.id}>{f.sample}<span className="ds-font-sample-en" dir="ltr">{f.sample}</span></span>
              <span className="muted small">{f.sub}</span>
            </button>
          ))}
        </div>
        <div className="row gap-2 wrap mt-2"><button className="btn" type="button" onClick={() => { setFont(font); }}>فونت فعلی را نگه بدار</button><Badge tone="info">{fonts.find((f) => f.id === font)?.label ?? "نمیشناسیم"}</Badge></div>
      </section>

      <section className="card stack">
        <h2 className="fs-lg m-0">۳) تراکم، مقیاس قلم و تم تطبیقی</h2>
        <div className="row gap-2 wrap mt-2">
          <button className={`btn ${adaptive ? "btn-primary" : ""}`} type="button" onClick={() => setAdaptive(!adaptive)} aria-pressed={adaptive}>
            تم تطبیقی ساعتی: {adaptive ? "روشن" : "خاموش"}
          </button>
          <span className="muted small">بعد از ۱۹:۰۰ شبانه و صبح روشن میشود.</span>
        </div>
        <div className="row gap-2 wrap">
          {(["compact", "comfortable"] as Density[]).map((d) => (
            <button key={d} type="button" className={`btn ${density === d ? "btn-primary" : ""}`} onClick={() => setDensity(d)}>{d === "compact" ? "فشرده" : "راحت"}</button>
          ))}
          {(["100", "125", "150"] as FontScale[]).map((f) => (
            <button key={f} type="button" className={`btn ${fontScale === f ? "btn-primary" : ""}`} onClick={() => setFontScale(f)}>{f}٪</button>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h2 className="fs-lg m-0">۴) پالت رنگ تم فعلی ({theme})</h2>
        <div className="row gap-2 wrap">
          {SWATCHES.map((k) => (
            <div key={k} className="ds-swatch">
              <span className="ds-swatch-color" style={cssVars({ "--swatch": color[k] ?? "transparent" })} aria-hidden="true" />
              <span className="muted small">{k}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h2 className="fs-lg m-0">۵) کامپوننتهای نمونه</h2>
        <Stepper steps={["رضایت", "متن گفتار", "پیشنویس", "بازبینی پزشک"]} current={2} />
        <div className="row gap-2 wrap">
          <Badge tone="ok">طبیعی</Badge><Badge tone="warn">نیاز به بررسی</Badge><Badge tone="bad">هشدار</Badge>
          <button className="btn btn-primary" type="button">دکمه اصلی</button>
          <button className="btn" type="button">دکمه ثانویه</button>
          <button className="btn ghost" type="button">دکمه ساده</button>
        </div>
        <Alert tone="info" title="پیشنویس آماده است">خروجی دستیار بالینی همیشه نیاز به بازبینی پزشک دارد.</Alert>
        <Alert tone="bad" title="خطای نمونه">رضایت صریح بیمار ثبت نشده است.</Alert>
        <div className="grid grid-3">
          <StatCard label="نوبتهای امروز" value="۱۲" hint="۳ منتظر تأیید" tone="info" />
          <StatCard label="نرخ اشغال" value="۸۴٪" hint="هدف ۸۰٪" tone="ok" />
          <StatCard label="غیبتها" value="۲" hint="یادآوری هدفمند" tone="bad" />
        </div>
        <div className="grid grid-3">
          <VitalCard label="فشار خون" value="145/92" unit="mmHg" flag="watch" reference="۹۰/۶۰ تا ۱۴۰/۹۰" />
          <VitalCard label="قند خون" value="110" unit="mg/dL" flag="normal" reference="۷۰ تا ۱۴۰" />
          <VitalCard label="اکسیژن" value="88" unit="%" flag="alert" reference="۹۵ تا ۱۰۰" />
        </div>
        <Sparkline values={[120, 125, 132, 128, 140, 138]} tone="warn" height={64} />
        <FormField label="مقدار" help="بازه معقول: ۷۰ تا ۱۴۰"><input className="input" placeholder="مثال: ۱۲۰" /></FormField>
        <DataTable headers={["بیمار", "زمان", "وضعیت"]} rows={[
          ["علی احمدی", "امروز ۱۰:۰۰", <Badge key="a" tone="ok">تأییدشده</Badge>],
          ["مریم رضایی", "فردا ۰۹:۳۰", <Badge key="b" tone="warn">منتظر</Badge>],
        ]} />
        <EmptyState icon="📭" title="هیچ اندازه‌های ثبت نشده" description="برای دیدن روند، اولین اندازهگیری را ثبت کنید." />
      </section>
    </div>
  );
}
