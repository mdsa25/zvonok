/* Звонок — сервис-воркер для пуша на iPhone (PWA с домашнего экрана, iOS 16.4+).
   Принимает Web Push и показывает уведомление о входящем звонке; по тапу
   открывает приложение и сразу входит в общую комнату (?autojoin=1). */

self.addEventListener("install", function (e) { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (_) { try { d = { name: e.data && e.data.text() }; } catch (__) {} }

  var kind = d.kind || "call";

  if (kind === "cancel") {
    // звонящий отменил — гасим уведомление
    e.waitUntil(
      self.registration.getNotifications({ tag: "zvonok-call" })
        .then(function (ns) { ns.forEach(function (n) { n.close(); }); })
    );
    return;
  }

  var name = d.name || "Звонок";
  var video = (d.video === "1" || d.video === 1);
  var body = video ? "Входящий видеозвонок" : "Входящий звонок";

  e.waitUntil(
    self.registration.showNotification(name, {
      body: body,
      tag: "zvonok-call",
      renotify: true,
      requireInteraction: true,
      data: { caller: d.caller, video: d.video, to: d.to }
    })
  );
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var data = e.notification.data || {};
  var video = (data.video === "1" || data.video === 1) ? "1" : "0";
  var url = "./?autojoin=1&video=" + video;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if ("focus" in c) {
          c.focus();
          try { if (c.navigate) c.navigate(url); } catch (_) {}
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
