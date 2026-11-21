/**
 * سیاست Service Worker — «فقط فایل‌های استاتیک» (UMD: هم importScripts در sw.js، هم require در تست).
 *
 * قاعده‌ی طلایی: هیچ پاسخ API/HTML/داده‌ی کاربر هرگز cache نمی‌شود.
 *   · فقط GET هم‌مبدأ و فقط مسیرهای allowlist (/_next/static، /icons، manifest، offline.html) cache می‌شوند.
 *   · /api/، /socket.io، /payment/callback و هر چیز دیگر ⇒ bypass (SW اصلاً دخالت نمی‌کند).
 *   · ناوبری (HTML) ⇒ فقط شبکه؛ در قطعی، صفحه‌ی ثابت offline.html (بدون هیچ داده).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NvySwPolicy = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var STATIC_CACHE = "nvy-static-v1";
  var PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];
  var NEVER = [/^\/api\//, /^\/socket\.io(\/|$)/, /^\/payment\/callback/, /^\/__e2e\//];
  var STATIC = [/^\/_next\/static\//, /^\/icons\//, /^\/manifest\.webmanifest$/, /^\/offline\.html$/];

  /** @returns {"static"|"navigate"|"bypass"} */
  function classify(req, selfOrigin) {
    if (req.method !== "GET") return "bypass";
    var u;
    try { u = new URL(req.url); } catch (e) { return "bypass"; }
    if (u.origin !== selfOrigin) return "bypass";
    for (var i = 0; i < NEVER.length; i++) if (NEVER[i].test(u.pathname)) return "bypass";
    if (req.mode === "navigate") return "navigate";
    for (var j = 0; j < STATIC.length; j++) if (STATIC[j].test(u.pathname)) return "static";
    return "bypass";
  }

  /** فقط پاسخ ۲۰۰ ی هم‌مبدأ که صراحتاً no-store/private نیست. */
  function shouldCache(status, type, cacheControl) {
    return status === 200 && type === "basic" && !/no-store|private/i.test(cacheControl || "");
  }

  /** مقصد کلیک روی اعلان: فقط مسیر نسبی امن؛ هر چیز دیگر ⇒ "/". */
  function safeUrl(url) {
    return typeof url === "string" && /^\/[A-Za-z0-9/_-]*$/.test(url) && url.indexOf("//") !== 0 ? url : "/";
  }

  /** پیلود پوش (JSON) با سقف طول و مقادیر پیش‌فرض عمومی؛ ورودی خراب ⇒ اعلان عمومی. */
  function parsePush(text) {
    var d = {};
    try { d = JSON.parse(text || "{}") || {}; } catch (e) { d = {}; }
    var s = function (v, max, dflt) { return typeof v === "string" && v ? v.slice(0, max) : dflt; };
    return { title: s(d.title, 60, "نوبت‌یار"), body: s(d.body, 160, "اعلان جدید دارید."), url: safeUrl(d.url), tag: s(d.tag, 80, "nvy") };
  }

  return { STATIC_CACHE: STATIC_CACHE, PRECACHE: PRECACHE, classify: classify, shouldCache: shouldCache, safeUrl: safeUrl, parsePush: parsePush };
});
