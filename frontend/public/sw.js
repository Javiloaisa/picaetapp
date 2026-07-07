// Service worker de la Picaeta: recibe las notificaciones push y las muestra.
//
// Para el aviso "et toca" (type: "turn") pinta botones de respuesta rápida:
//   🙈 No puc      -> declina la semana sin abrir la app (solo Android)
//   🏖️ De vacances -> abre la app para poner la fecha de vuelta
// En iPhone los botones se ignoran: al tocar el aviso se abre la app y se
// responde ahí (iOS no soporta acciones en notificaciones web).

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = data.title || "PicaetApp";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [80, 40, 80],
    data: { url: data.url || "/", type: data.type || null },
  };
  if (data.type === "turn") {
    options.tag = "picaeta-torn";
    options.requireInteraction = true;
    options.actions = [
      { action: "decline", title: "🙈 No puc" },
      { action: "vacation", title: "🏖️ De vacances" },
    ];
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const action = event.action;
  const url = (event.notification.data && event.notification.data.url) || "/";

  // "No puc" desde la propia notificación (Android): declina la semana.
  if (action === "decline") {
    event.waitUntil(
      fetch("/api/turns/decline", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      })
        .then((res) => {
          if (res.ok) {
            return self.registration.showNotification("Fet! 🙈", {
              body: "Esta setmana no et toca; ho passem al següent.",
              icon: "/icon-192.png",
              badge: "/icon-192.png",
            });
          }
          // Sesión caducada o el turno ya no es tuyo: abre la app.
          return openApp(url);
        })
        .catch(() => openApp(url))
    );
    return;
  }

  // "De vacances": no se puede elegir fecha desde un botón -> abre la app.
  if (action === "vacation") {
    event.waitUntil(openApp("/?vacation=1"));
    return;
  }

  event.waitUntil(openApp(url));
});

function openApp(url) {
  return self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          if (url !== "/" && "navigate" in client) {
            client.navigate(url).catch(() => {});
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    });
}
