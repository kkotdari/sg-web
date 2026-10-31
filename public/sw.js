/* 스타게이트 서비스워커 — 푸시 알림만 다룬다(2026-10-31). 가져오기(fetch)·캐시는 안 건드린다(사이트는 늘 네트워크에서). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "스타게이트", body: e.data ? e.data.text() : "" }; }
  const opts = { body: d.body || "", icon: "/icon-192.png", badge: "/icon-192.png", data: { url: d.url || "/" } };
  if (d.tag) { opts.tag = d.tag; opts.renotify = true; }
  e.waitUntil(self.registration.showNotification(d.title || "스타게이트", opts));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const same = all.find((c) => new URL(c.url).origin === self.location.origin);
    if (same) {
      await same.focus();
      same.postMessage({ type: "scr-push-open", url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
