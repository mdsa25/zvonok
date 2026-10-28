/* Звонок — сервис-воркер для пуша на iPhone (PWA с домашнего экрана, iOS 16.4+) и ноутбука.
   Принимает Web Push и показывает уведомление о входящем звонке; по нажатию открывает
   приложение и сразу входит в разговор со звонящим (?autojoin=1&caller=…&room=…).
   v67: раньше в адресе не было звонящего — ответ уходил в общую комнату («случайный общий созвон»).
   Уведомление старше минуты по нажатию только открывает приложение: вызов давно закончился. */

self.addEventListener("install", function (e) { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (_) { try { d = { name: e.data && e.data.text() }; } catch (__) {} }

  var kind = d.kind || "call";

  if (kind === "cancel") {
    // звонящий отменил (или ответили на другом устройстве) — гасим уведомление
    e.waitUntil(
      self.registration.getNotifications({ tag: "zvonok-call" })
        .then(function (ns) { ns.forEach(function (n) { n.close(); }); })
    );
    return;
  }

  var name = d.name || "Звонок";
  var video = (d.video === "1" || d.video === 1);
  var all = String(d.to) === "0";
  var body = all ? ("Общий созвон — звонит " + name) : (video ? "Входящий видеозвонок" : "Входящий звонок");

  e.waitUntil(
    self.registration.showNotification(all ? "Общий созвон" : name, {
      body: body,
      tag: "zvonok-call",
      renotify: true,
      requireInteraction: true,
      data: { caller: d.caller, video: d.video, to: d.to, name: d.name || "", room: d.room || "", cid: d.cid || "", ts: Date.now() }
    })
  );
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var data = e.notification.data || {};
  var url = "./";
  if (data.ts && Date.now() - data.ts < 60000) {
    var video = (data.video === "1" || data.video === 1) ? "1" : "0";
    var all = String(data.to) === "0" ? "1" : "0";
    url = "./?autojoin=1&video=" + video +
      "&caller=" + encodeURIComponent(data.caller || 0) +
      "&to=" + encodeURIComponent(data.to || 0) +
      "&all=" + all +
      (data.room ? "&room=" + encodeURIComponent(data.room) : "") +
      (data.name ? "&name=" + encodeURIComponent(data.name) : "");
  }
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
