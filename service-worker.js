// Service worker: gjør appen installerbar + tar imot push-varsler i bakgrunnen.

importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

const CACHE_NAME = "hallreg-cache-v5";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./schedule.js",
  "./firebase-config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Enkel "network falling back to cache"-strategi, slik at appen også åpner seg uten nett.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// --- Push-varsler via Firebase Cloud Messaging ---------------------------
// firebase-config.js kan ikke importeres direkte her (den er ikke en service
// worker-fil), så vi henter konfigurasjonen fra searchparams appen sender inn,
// eller lar dette stå tomt til `firebaseConfigInline` blir satt av appen ved
// registrering. Enklest: vi initialiserer med samme faste verdier som resten
// av appen. Disse hentes fra IndexedDB-melding sendt av app.js ved oppstart,
// men for enkelhets skyld dupliserer vi konfig-verdiene her via en egen fil:
importScripts("./firebase-config.js");

try {
  firebase.initializeApp(self.FIREBASE_CONFIG);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {};
    const title = payload.notification?.title || "Registrering i hallen";
    const body = payload.notification?.body || "Tid for å registrere antall besøkende.";
    self.registration.showNotification(title, {
      body,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: "hallreg-varsel",
      renotify: true,
      data,
    });
  });
} catch (e) {
  // Firebase er ikke konfigurert ennå (firebase-config.js har placeholder-verdier).
  console.warn("Service worker: Firebase-messaging ikke aktivert ennå.", e);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ("focus" in client) {
          client.postMessage({ type: "APNE_REGISTRERING" });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});
