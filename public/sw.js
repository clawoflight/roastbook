const BUILD_ID = '__BUILD_ID__'
const PRECACHE_CACHE = `roastbook-precache-${BUILD_ID}`
const DOCUMENT_CACHE = `roastbook-documents-${BUILD_ID}`
const ASSET_CACHE = 'roastbook-assets'
const OFFLINE_URL = '/offline.html'
const MAX_ASSET_ENTRIES = 100
const MAX_DOCUMENT_ENTRIES = 20
const EXCLUDED_PATHS = new Set(['/sw.js'])
const EXCLUDED_PREFIXES = ['/api/', '/_serverFn/', '/_gate/', '/media/']
const PRECACHE_ASSETS = __PRECACHE_ASSETS__
const PRECACHE_URLS = [
  '/offline.html',
  '/manifest.json',
  '/logo192.png',
  '/logo512.png',
  '/logo-maskable-192.png',
  '/logo-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
  '/navbar-logo.png',
  '/paper-grain-light.svg',
  '/paper-grain-dark.svg',
  '/coffee-stains-light.svg',
  '/coffee-stains-dark.svg',
  ...PRECACHE_ASSETS,
]
const PRECACHE_PATHS = new Set(PRECACHE_URLS)
const DOCUMENT_PRECACHE_URLS = ['/overview', '/brews/new', '/brews/pending']

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

  if (url.pathname === '/_gate/logout') {
    event.respondWith(fetch(request).finally(clearDocumentCaches))
    return
  }

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
  await Promise.allSettled(DOCUMENT_PRECACHE_URLS.map(cacheDocument))
}

async function cacheDocument(url) {
  try {
    const response = await fetch(
      new Request(url, {
        cache: 'reload',
        headers: { Accept: 'text/html' },
      }),
    )
    if (!isCacheableDocument(response)) return

    const cache = await caches.open(DOCUMENT_CACHE)
    await cache.put(url, response)
  } catch {
    // Offline readiness is best-effort; the app still works online.
  }
}

async function activate() {
  const keys = await caches.keys()
  await Promise.all(
    keys
      .filter(
        (key) =>
          (key.startsWith('roastbook-precache-') && key !== PRECACHE_CACHE) ||
          (key.startsWith('roastbook-documents-') && key !== DOCUMENT_CACHE),
      )
      .map((key) => caches.delete(key)),
  )
  await self.clients.claim()
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request)
    if (isCacheableDocument(response)) {
      try {
        const cache = await caches.open(DOCUMENT_CACHE)
        await cache.put(request, response.clone())
        await trimCache(cache, MAX_DOCUMENT_ENTRIES)
      } catch {
        // A cache write failure must not block the navigation.
      }
    }
    return response
  } catch {
    const documentCache = await caches.open(DOCUMENT_CACHE)
    const cachedDocument = await documentCache.match(request, {
      ignoreSearch: true,
    })
    if (cachedDocument) return cachedDocument

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

function isCacheableDocument(response) {
  if (!response.ok || response.redirected) return false
  if (response.headers.get('content-type')?.includes('text/html') !== true) {
    return false
  }

  const url = new URL(response.url)
  if (url.pathname.startsWith('/_gate/')) return false
  return true
}

async function clearDocumentCaches() {
  const keys = await caches.keys()
  await Promise.all(
    keys
      .filter((key) => key.startsWith('roastbook-documents-'))
      .map((key) => caches.delete(key)),
  )
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
