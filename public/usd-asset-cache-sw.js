const CACHE_NAME = "usd-viewer-asset-cache-v1";
const MAX_CACHEABLE_BYTES = 64 * 1024 * 1024;

const SAME_ORIGIN_PREFIXES = [
  "/data/",
  "/environments/",
  "/materialx/",
  "/needle-engine/",
  "/needle-three/",
  "/test-fixtures/",
  "/three/",
  "/usd/",
];

function diagnosticsCacheEnabled(clientUrl) {
  try {
    const url = new URL(clientUrl);
    if (url.searchParams.get("assetCache") === "0") return false;
    return url.searchParams.has("debug") || url.searchParams.get("assetCache") === "1";
  } catch {
    return false;
  }
}

async function cacheEnabledForClient(clientId) {
  if (!clientId) return false;
  const client = await clients.get(clientId);
  return client ? diagnosticsCacheEnabled(client.url) : false;
}

function isCacheableSameOriginPath(url) {
  return SAME_ORIGIN_PREFIXES.some(prefix => url.pathname.startsWith(prefix));
}

function isCacheableRemoteUrl(url) {
  if (url.hostname === "asset-explorer.needle.tools") {
    return url.pathname === "/api/models.json" || url.pathname.startsWith("/downloads/");
  }
  if (url.hostname === "raw.githubusercontent.com") {
    return url.pathname.startsWith("/usd-wg/assets/") ||
      url.pathname.startsWith("/KhronosGroup/glTF-Sample-Assets/");
  }
  if (url.hostname === "cdn.needle.tools") {
    return url.pathname.startsWith("/static/three/");
  }
  if (url.hostname === "www.gstatic.com") {
    return url.pathname.startsWith("/draco/");
  }
  return false;
}

function isCacheableRequest(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.origin === location.origin) return isCacheableSameOriginPath(url);
  return isCacheableRemoteUrl(url);
}

function canStore(response) {
  if (!response) return false;
  if (response.status !== 200) return false;
  const contentLength = Number(response.headers.get("content-length"));
  return !Number.isFinite(contentLength) || contentLength <= MAX_CACHEABLE_BYTES;
}

async function notifyClient(clientId, payload) {
  if (!clientId) return;
  const client = await clients.get(clientId);
  client?.postMessage({ source: "usd-viewer-asset-cache", ...payload });
}

async function refreshCache(cache, request, clientId) {
  try {
    const revalidateRequest = new Request(request, { cache: "no-cache" });
    const response = await fetch(revalidateRequest);
    if (!canStore(response)) return;
    await cache.put(request, response.clone());
    await notifyClient(clientId, { type: "refresh", url: request.url });
  } catch {
    // The cached response is still usable. Revalidation is best-effort.
  }
}

async function cacheFirst(event) {
  let cache = null;
  try {
    cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) {
      event.waitUntil(refreshCache(cache, event.request, event.clientId));
      event.waitUntil(notifyClient(event.clientId, { type: "hit", url: event.request.url }));
      return cached;
    }
  } catch {
    cache = null;
  }

  const response = await fetch(event.request);
  if (cache && canStore(response)) {
    event.waitUntil(
      cache.put(event.request, response.clone())
        .then(() => notifyClient(event.clientId, { type: "store", url: event.request.url }))
        .catch(() => {})
    );
  }
  return response;
}

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith("usd-viewer-asset-cache-") && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (!isCacheableRequest(event.request)) return;
  event.respondWith((async () => {
    const enabled = await cacheEnabledForClient(event.clientId);
    if (!enabled) return fetch(event.request);
    return cacheFirst(event);
  })());
});
