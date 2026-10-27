/* California Meal Planner — service worker
   1) Monetag push notifications (importScripts)
   2) PWA offline caching
   Only ONE service worker can control this site, so both live in this one file. */

// ---- Monetag push ------------------------------------------------------

// Monetag push zone. It must match the push tag in index.html and meals.html
// (https://5gvci.com/act/files/tag.min.js?z=12133822).
// Wrapped so a blocked or unreachable Monetag domain can't break the PWA caching below.
try {
    self.options = { "domain": "5gvci.com", "zoneId": 12133822 };
    self.lary = "";
    importScripts('https://5gvci.com/act/files/service-worker.min.js?r=sw');
} catch (e) {}

// ---- PWA offline cache ---------------------------------------------------
const CACHE = 'mp-cache-v8';
const SHELL = [
    './',
    'index.html',
    'meals.html',
    'css/style.css',
    'pwa.js',
    'manifest.webmanifest',
    'icons/icon-192.png',
    'icons/icon-512.png'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE)
            .then(function (cache) {
                // allSettled so one missing file doesn't break the whole install
                return Promise.allSettled(SHELL.map(function (url) { return cache.add(url); }));
            })
            .then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys()
            .then(function (keys) {
                return Promise.all(keys.filter(function (k) { return k !== CACHE; })
                    .map(function (k) { return caches.delete(k); }));
            })
            .then(function () { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function (event) {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    const sameOrigin = url.origin === self.location.origin;
    const isCdn = url.hostname === 'cdnjs.cloudflare.com';

    // Everything else (ad networks, analytics, etc.) is left completely alone
    if (!sameOrigin && !isCdn) return;

    if (isCdn) {
        // Icons/fonts library: serve cached copy fast, refresh in background
        event.respondWith(
            caches.open(CACHE).then(function (cache) {
                return cache.match(req).then(function (cached) {
                    const network = fetch(req).then(function (res) {
                        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
                        return res;
                    }).catch(function () { return cached; });
                    return cached || network;
                });
            })
        );
        return;
    }

    // Your own files: network first (so updates always arrive), cache as the offline fallback
    event.respondWith(
        fetch(req).then(function (res) {
            if (res && res.ok) {
                const copy = res.clone();
                caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
            }
            return res;
        }).catch(function () {
            return caches.match(req, { ignoreSearch: true }).then(function (cached) {
                return cached || (req.mode === 'navigate' ? caches.match('index.html') : undefined);
            });
        })
    );
});