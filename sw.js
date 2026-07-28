/**
 * Service Worker for rag.always.tools
 *
 * - Model files (huggingface.co, cdn.jsdelivr.net for transformers/onnx): cache-first
 * - Everything else: network-first (app code always fresh)
 */

const CACHE_NAME = 'rag-tools-models-v1';
const STATIC_CACHE = 'rag-tools-static-v1';

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

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.open(cacheName).then((c) => c.match(request));
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (MODEL_URL_PATTERNS.some((p) => url.includes(p))) {
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Default: network-first for everything else
  event.respondWith(networkFirst(event.request));
});
