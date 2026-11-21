/* Service Worker نوبت‌یار — فقط استاتیک + Web Push. منطق در sw-policy.js (تست‌شده). هیچ پاسخ APIی cache نمی‌شود. */
importScripts("/sw-policy.js");
var P = self.NvySwPolicy;

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(P.STATIC_CACHE).then(function (c) { return c.addAll(P.PRECACHE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== P.STATIC_CACHE; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); }),
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  var kind = P.classify({ method: req.method, url: req.url, mode: req.mode }, self.location.origin);
  if (kind === "bypass") return; // SW دخالت نمی‌کند ⇒ رفتار عادی مرورگر

  if (kind === "navigate") {
    // HTML هرگز cache نمی‌شود؛ فقط در قطعی صفحه‌ی ثابت
    e.respondWith(fetch(req).catch(function () { return caches.match("/offline.html"); }));
    return;
  }

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (P.shouldCache(res.status, res.type, res.headers.get("cache-control"))) {
          var copy = res.clone();
          caches.open(P.STATIC_CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    }),
  );
});

// خروج از حساب: هر cache ی احتمالی پاک شود (دفاع در عمق؛ داده‌ای cache نمی‌شود)
self.addEventListener("message", function (e) {
  if (e.data && e.data.type === "PURGE") e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
});

self.addEventListener("push", function (e) {
  var p = P.parsePush(e.data ? e.data.text() : "");
  e.waitUntil(self.registration.showNotification(p.title, { body: p.body, tag: p.tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", lang: "fa", dir: "rtl", data: { url: p.url } }));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = P.safeUrl(e.notification.data && e.notification.data.url);
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if ("focus" in c && new URL(c.url).origin === self.location.origin) { c.navigate(url); return c.focus(); }
      }
      return self.clients.openWindow(url);
    }),
  );
});
