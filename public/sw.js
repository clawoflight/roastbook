const BUILD_ID = '__BUILD_ID__'
const PRECACHE_CACHE = `roastbook-precache-${BUILD_ID}`
const ASSET_CACHE = 'roastbook-assets'
const OFFLINE_URL = '/offline.html'
const MAX_ASSET_ENTRIES = 100
const EXCLUDED_PATHS = new Set(['/sw.js'])
const EXCLUDED_PREFIXES = ['/api/', '/_serverFn/', '/_gate/', '/media/']
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.json',
  '/logo192.png',
  '/logo512.png',
  '/logo-maskable-192.png',
  '/logo-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
]
const PRECACHE_PATHS = new Set(PRECACHE_URLS)

self.addEventListener('install', (event) => {
  event.waitUntil(precache())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(activate())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (isExcludedPath(url.pathname)) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (PRECACHE_PATHS.has(url.pathname)) {
    event.respondWith(cacheFirstPrecache(request))
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirstAsset(request))
  }
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

async function precache() {
  const cache = await caches.open(PRECACHE_CACHE)
  await Promise.all(
    PRECACHE_URLS.map((url) =>
      cache.add(new Request(url, { cache: 'reload' })),
    ),
  )
}

async function activate() {
  const keys = await caches.keys()
  await Promise.all(
    keys
      .filter(
        (key) =>
          key.startsWith('roastbook-precache-') && key !== PRECACHE_CACHE,
      )
      .map((key) => caches.delete(key)),
  )
  await self.clients.claim()
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request)
  } catch {
    const cache = await caches.open(PRECACHE_CACHE)
    const offlinePage = await cache.match(OFFLINE_URL)
    if (offlinePage) return offlinePage

    return new Response(
      '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline</title><body style="font-family:system-ui,sans-serif;padding:2rem"><h1>You are offline</h1><p>Reconnect and try again.</p></body></html>',
      {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    )
  }
}

async function cacheFirstPrecache(request) {
  const cache = await caches.open(PRECACHE_CACHE)
  const cached = await cache.match(request, { ignoreSearch: true })
  if (cached) return cached

  return fetch(request)
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    try {
      await cache.put(request, response.clone())
      await trimCache(cache, MAX_ASSET_ENTRIES)
    } catch {
      // A cache write failure must not block the asset response.
    }
  }
  return response
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys()
  const excess = keys.length - maxEntries
  if (excess <= 0) return

  await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)))
}

function isExcludedPath(pathname) {
  return (
    EXCLUDED_PATHS.has(pathname) ||
    EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  )
}
