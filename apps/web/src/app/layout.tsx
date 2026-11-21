import "@fontsource-variable/vazirmatn";
// فاز ۲۲: فونتهای قابلانتخاب (نستعلیق، نسخ، امیری، شرقی و Inter انگلیسی)
import "@fontsource-variable/noto-nastaliq-urdu";
import "@fontsource/noto-naskh-arabic/400.css";
import "@fontsource/amiri/400.css";
import "@fontsource/scheherazade-new/400.css";
import "@fontsource-variable/inter";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { CommandPalette } from "@/components/CommandPalette";
import { Header } from "@/components/Header";
import { OfflineBanner } from "@/components/kit/OfflineBanner";
import { Providers } from "@/components/Providers";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PwaRegister } from "@/components/PwaRegister";
import { SentryInit } from "@/components/SentryInit";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "نوبت‌یار | رزرو نوبت پزشک", template: "%s | نوبت‌یار" },
  description: "جستجوی پزشک و رزرو نوبت آنلاین",
  manifest: "/manifest.webmanifest",
  applicationName: "نوبت‌یار",
  appleWebApp: { capable: true, title: "نوبت‌یار", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#0f766e", width: "device-width", initialScale: 1 };

// تم پیش از اولین رنگ‌آمیزی اعمال می‌شود (جلوگیری از فلاش)
const themeScript = `try{var t=localStorage.getItem('nvy-theme');if(t==='dark')t='clinical-dark';if(t==='light')t='clinical-light';if(['clinical-light','calm-teal','low-bandwidth','senior','clinical-dark','midnight-blue','emerald-night','violet-clinic','graphite-med','amber-oncall','indigo-ward','high-contrast','spring-night','summer-night','autumn-night'].indexOf(t)>=0)document.documentElement.setAttribute('data-theme',t);var d=localStorage.getItem('nvy-density');if(d==='compact'||d==='comfortable')document.documentElement.setAttribute('data-density',d);var fs=localStorage.getItem('nvy-font-scale');if(['100','125','150'].indexOf(fs)>=0)document.documentElement.setAttribute('data-font-scale',fs);var f=localStorage.getItem('nvy-font');if(['vazirmatn','nastaliq','naskh','amiri','scheherazade','inter-en'].indexOf(f)>=0)document.documentElement.setAttribute('data-font',f)}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" data-theme="emerald-night" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a className="skip-link" href="#main">رفتن به محتوا</a>
        <PwaRegister />
        <SentryInit />
        <ThemeProvider>
          <Providers>
            <Header />
            <CommandPalette />
            <main id="main" className="container page">{children}</main>
            <OfflineBanner />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
