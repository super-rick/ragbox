/**
 * Service Worker for ragbox.always.tools
 *
 * - Model files (huggingface.co, cdn.jsdelivr.net for transformers/onnx): cache-first
 * - Same-origin app shell + assets: network-first (app code always fresh)
 * - Cross-origin non-model requests (CDN, fonts, analytics): passed through, NOT cached
 */

const CACHE_NAME = 'rag-tools-models-v1';
const STATIC_CACHE = 'rag-tools-static-v1';
const STATIC_CACHE_MAX = 60;

const MODEL_URL_PATTERNS = [
  'huggingface.co',
  'cdn.jsdelivr.net/npm/@xenova/transformers',
  'cdn.jsdelivr.net/npm/onnxruntime-web',
];

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/sw.js',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Static assets may not exist at deploy time; non-critical
      });
    })
  );
});

// Delete ONLY our own old versioned caches. Never touch unknown caches —
// WebLLM keeps its ~500MB model weights in its own CacheStorage, and wiping
// it on every SW update forced a full re-download.
const OLD_CACHE_PATTERN = /^rag-tools-(models|static)-/;
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => OLD_CACHE_PATTERN.test(k) && k !== CACHE_NAME && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    // Cache write is best-effort — a quota failure must not fail the response.
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

/**
 * Best-effort cache write with a size cap. A cache failure (e.g. quota) is
 * swallowed here so it can NEVER discard a response that already fetched fine.
 */
async function cacheStatic(request, response) {
  try {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
    // Prune oldest entries if over capacity (keys are in insertion order).
    const keys = await cache.keys();
    if (keys.length > STATIC_CACHE_MAX) {
      const excess = keys.length - STATIC_CACHE_MAX;
      await Promise.all(keys.slice(0, excess).map((k) => cache.delete(k)));
    }
  } catch (err) {
    console.warn('[sw] cache write skipped:', err);
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Fire-and-forget; cacheStatic never throws to the caller.
      cacheStatic(request, response);
    }
    return response;
  } catch {
    // Real network failure (offline): fall back to the cached app shell.
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = request.url;

  // Model files: cache-first.
  if (MODEL_URL_PATTERNS.some((p) => url.includes(p))) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }

  // Only GET, same-origin requests are intercepted + cached. Caching every
  // cross-origin response is what filled the static cache and caused the
  // false-offline 503s.
  if (request.method !== 'GET') return;
  if (new URL(url).origin !== self.location.origin) return;

  event.respondWith(networkFirst(request));
});
