/* =====================================================================
   Ronsberger HMO Portal — Service Worker
   - Cache-first for immutable hashed assets (JS/CSS bundles)
   - Network-first for HTML, manifests, build-meta so updates are instant
   - Push notifications for background alerts (pending approvals)
   - skipWaiting + clients.claim for seamless version transitions
   ===================================================================== */

const SW_VERSION = "ronsberger-sw-v2";
const STATIC_CACHE = SW_VERSION + "-static";
const RUNTIME_CACHE = SW_VERSION + "-runtime";

const IMMUTABLE_EXTENSIONS = [".js", ".css", ".woff2", ".woff", ".ttf"];

const NETWORK_FIRST_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/build-meta.json",
];

// -----------------------------------------------------------------------
// Install
// -----------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(["/"]).catch(() => {});
    })
  );
  self.skipWaiting();
});

// -----------------------------------------------------------------------
// Activate: clean up old caches
// -----------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// -----------------------------------------------------------------------
// Fetch routing strategy
// -----------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (NETWORK_FIRST_URLS.some((u) => url.pathname === u || url.pathname.startsWith("/auth"))) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (IMMUTABLE_EXTENSIONS.some((ext) => url.pathname.endsWith(ext))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match("/index.html");
  }
}

// -----------------------------------------------------------------------
// Push Notifications — fires even when browser / app is CLOSED
// -----------------------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = {
    title: "Ronsberger HMO",
    body: "You have a pending authorization request.",
    url: "/",
    tag: "ronsberger-push",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag: data.tag || "ronsberger-push",
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || "/" },
    actions: [
      { action: "open", title: "Review Request" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// -----------------------------------------------------------------------
// Notification click
// -----------------------------------------------------------------------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((c) => c.url.includes(self.location.origin));
      if (existingClient) {
        existingClient.focus();
        existingClient.navigate(targetUrl);
        return;
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

// -----------------------------------------------------------------------
// Message from page: SKIP_WAITING
// -----------------------------------------------------------------------
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
