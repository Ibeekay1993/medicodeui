/* =====================================================================
   Ronsberger HMO Portal — Service Worker
   - Cache-first for immutable hashed assets (JS/CSS bundles)
   - Network-first for HTML, manifests, build-meta so updates are instant
   - Push notifications for background alerts (pending approvals)
   - skipWaiting + clients.claim for seamless version transitions
   ===================================================================== */

const SW_VERSION = "ronsberger-sw-v7";
const STATIC_CACHE = SW_VERSION + "-static";
const RUNTIME_CACHE = SW_VERSION + "-runtime";

// Vite emits the PDF.js module worker as a content-hashed .mjs asset.
// Cache it like other immutable build assets so offline/network fallback never
// returns index.html for a JavaScript module import.
const IMMUTABLE_EXTENSIONS = [".js", ".mjs", ".css", ".woff2", ".woff", ".ttf"];

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

  // Always request the active deployment's CSS. A previous cache entry can
  // have a plausible text/css header while containing stale or broken rules.
  // Keep a validated copy only for offline fallback.
  if (url.pathname.toLowerCase().endsWith(".css")) {
    event.respondWith(networkFirstStylesheet(request));
    return;
  }

  if (IMMUTABLE_EXTENSIONS.some((ext) => url.pathname.endsWith(ext))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  // Only consult this worker version's static cache. A generic caches.match()
  // can return entries from unrelated or superseded caches.
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached && hasExpectedAssetType(request, cached)) return cached;
  if (cached) await cache.delete(request);

  const response = await fetch(request);
  // SPA hosts may answer a missing asset URL with index.html and status 200.
  // Never cache that HTML (or any other wrong MIME type) as a CSS/JS bundle.
  if (hasExpectedAssetType(request, response)) await cache.put(request, response.clone());
  return response;
}

async function networkFirstStylesheet(request) {
  const cache = await caches.open(STATIC_CACHE);

  try {
    // `reload` bypasses the browser HTTP cache as well as this service
    // worker's cache-first path, so a deployment cannot reuse stale CSS.
    const response = await fetch(request, { cache: "reload" });
    if (hasExpectedAssetType(request, response)) {
      await cache.put(request, response.clone());
      return response;
    }

    const cached = await cache.match(request);
    return cached && hasExpectedAssetType(request, cached) ? cached : response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached && hasExpectedAssetType(request, cached)) return cached;
    throw error;
  }
}

function hasExpectedAssetType(request, response) {
  if (!response.ok) return false;

  const pathname = new URL(request.url).pathname.toLowerCase();
  const contentType = (response.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();

  if (pathname.endsWith(".css")) return contentType === "text/css";

  if (pathname.endsWith(".js") || pathname.endsWith(".mjs")) {
    return [
      "text/javascript",
      "application/javascript",
      "text/ecmascript",
      "application/ecmascript",
      "application/x-javascript",
    ].includes(contentType);
  }

  return true;
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
    // A retry or duplicate dispatch with the same request tag should update the
    // existing alert quietly instead of showing/vibrating a second toast.
    renotify: false,
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
