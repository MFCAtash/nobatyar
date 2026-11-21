import path from "node:path";
import { fileURLToPath } from "node:url";

// ریشه‌ی monorepo: برای خروجی standalone (ردیابی فایل‌ها باید از ریشه‌ی workspace شروع شود، وگرنه server.js در مسیر اشتباه می‌افتد)
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const API_URL = process.env.API_URL ?? "http://localhost:3000";

// آدرس عمومی LiveKit (همان LIVEKIT_URL سمت API). مرورگر مستقیم به آن وصل می‌شود، پس باید در CSP مجاز باشد.
// ws(s) برای سیگنالینگ؛ http(s) برای اعتبارسنجی/fallback ی کلاینت.
// آدرس عمومی ذخیره‌ساز (MinIO پشت Caddy): آپلود presigned PUT از مرورگر مستقیم به آن می‌رود ⇒ باید در CSP باشد.
const STORAGE = (process.env.STORAGE_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
const storageOrigin = /^https?:\/\/[^/\s]+$/i.test(STORAGE) ? STORAGE : "";
const LIVEKIT = (process.env.LIVEKIT_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
const lkOrigins = LIVEKIT && /^wss?:\/\//i.test(LIVEKIT)
  ? [LIVEKIT, LIVEKIT.replace(/^ws(s?):\/\//i, "http$1://")].join(" ")
  : "";

// Sentry مرورگر (اختیاری): فقط origin ی ingest در CSP مجاز می‌شود. رویدادها پیش از ارسال scrub می‌شوند (SentryInit).
const SENTRY_DSN = (process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").trim();
let sentryOrigin = "";
try { if (SENTRY_DSN) sentryOrigin = new URL(SENTRY_DSN).origin; } catch { /* DSN نامعتبر: Sentry کلاً غیرفعال می‌ماند */ }

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  // image کوچک Docker: فقط فایل‌های لازم در .next/standalone (اجرا: node apps/web/server.js)
  // در Windows محلی (بدون امتیاز symlink) NEXT_STANDALONE=false تنظیم شود؛
  //Docker/production به صورت پیشفرض standalone میماند.
  output: process.env.NEXT_STANDALONE === "false" ? undefined : "standalone",
  experimental: { outputFileTracingRoot: REPO_ROOT },
  // API از همین مبدأ پروکسی می‌شود ⇒ کوکی refresh «same-origin» است (SameSite=Strict بدون دردسر CORS)
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${API_URL}/api/v1/:path*` },
      // چت (socket.io) هم‌مبدأ: در production Caddy آن را مستقیم به API می‌دهد؛ این قاعده برای dev/CI/E2E است
      { source: "/socket.io/:path*", destination: `${API_URL}/socket.io/:path*` },
    ];
  },
  async headers() {
    // در حالت dev، React Refresh به unsafe-eval نیاز دارد؛ در production هرگز اضافه نمیشود.
    const devEval = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";
    return [
      // Service Worker و سیاستش همیشه تازه (به‌روزرسانی SW نباید پشت cache مرورگر گیر کند)
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/sw-policy.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
      { source: "/manifest.webmanifest", headers: [{ key: "Content-Type", value: "application/manifest+json" }, { key: "Cache-Control", value: "public, max-age=3600" }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
          // CSP پایه (Next بدون nonce به inline script نیاز دارد). CSP مبتنی بر nonce در فاز ۹.
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; img-src 'self' data: blob:${storageOrigin ? " " + storageOrigin : ""}; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${devEval}; connect-src 'self'${storageOrigin ? " " + storageOrigin : ""}${lkOrigins ? " " + lkOrigins : ""}${sentryOrigin ? " " + sentryOrigin : ""}; media-src 'self' blob: mediastream:; worker-src 'self' blob:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
    ];
  },
};
