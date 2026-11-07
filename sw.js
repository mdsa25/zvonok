/* Звонок — сервис-воркер для пуша на iPhone (PWA с домашнего экрана, iOS 16.4+) и ноутбука.
   Принимает Web Push и показывает уведомление о входящем звонке; по нажатию открывает
   приложение и сразу входит в разговор со звонящим (?autojoin=1&caller=…&room=…).
   v67: раньше в адресе не было звонящего — ответ уходил в общую комнату («случайный общий созвон»).
   Уведомление старше минуты по нажатию только открывает приложение: вызов давно закончился.
   v69: на каждый пуш — уведомление (и на «отмену»): иначе Safari отзывает подписку. */

self.addEventListener("install", function (e) { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

function cidTime(cid) {
  try {
    if (!cid || String(cid).length < 12) return 0;
    var t = parseInt(String(cid).slice(8), 36);
    return (t > 1500000000000 && t < Date.now() + 86400000) ? t : 0;
  } catch (_) { return 0; }
}
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (_) { try { d = { name: e.data && e.data.text() }; } catch (__) {} }

  var kind = d.kind || "call";

  if (kind === "cancel") {
    /* звонящий отменил (или ответили/отклонили на одном из устройств) — гасим уведомление о вызове.
       v69: и обязательно показываем своё: Safari требует уведомление на КАЖДЫЙ пуш, после трёх «тихих»
       отзывает подписку — и iPhone перестаёт получать звонки при закрытом приложении. Отмена до ответа —
       «Пропущенный звонок»; ответили (ans) — короткое уведомление, которое сразу убираем. */
    var cn = d.name || "Звонок", call = String(d.to) === "0";
    e.waitUntil(
      self.registration.getNotifications({ tag: "zvonok-call" })
        .then(function (ns) { ns.forEach(function (n) { n.close(); }); })
        .then(function () {
          if (d.ans === "1" || d.ans === 1) {
            return self.registration.showNotification(call ? "Общий созвон" : cn, { body: "Звонок обработан", tag: "zvonok-done", silent: true, data: { ts: 0 } })
              .then(function () { return new Promise(function (r) { setTimeout(r, 2000); }); })
              .then(function () { return self.registration.getNotifications({ tag: "zvonok-done" }); })
              .then(function (l) { l.forEach(function (n) { n.close(); }); });
          }
          var ct0 = cidTime(d.cid), dt0 = new Date(ct0 || Date.now());
          var hm0 = ("0" + dt0.getHours()).slice(-2) + ":" + ("0" + dt0.getMinutes()).slice(-2);
          return self.registration.showNotification("Пропущенный звонок", { body: (call ? "Общий созвон — " : "") + cn + " в " + hm0, tag: "zvonok-missed", data: { ts: 0 } });
        })
        .catch(function () {})
    );
    return;
  }

  var name = d.name || "Звонок";
  var video = (d.video === "1" || d.video === 1);
  var all = String(d.to) === "0";
  var body = all ? ("Общий созвон — звонит " + name) : (video ? "Входящий видеозвонок" : "Входящий звонок");

  /* v69: пуш задержался (телефон был без сети; резервный сервер мог не задать срок жизни) — вызов давно
     закончился: не «входящий», а «пропущенный» с временем звонка (оно — в номере вызова: 8 случайных
     знаков + время звонящего в base36). Уведомление показать нужно всё равно — так требует iOS. */
  var ct = cidTime(d.cid);
  if (ct && Date.now() - ct > 180000) {
    var dt = new Date(ct), hm = ("0" + dt.getHours()).slice(-2) + ":" + ("0" + dt.getMinutes()).slice(-2);
    e.waitUntil(self.registration.showNotification("Пропущенный звонок", { body: (all ? "Общий созвон — " : "") + name + " в " + hm, tag: "zvonok-missed", data: { ts: 0 } }));
    return;
  }

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
