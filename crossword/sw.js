/* Offline support: keep a copy of every file the app needs and serve it when there's no
   connection. Files are refreshed in the background, so updates appear on the next visit.
   Bump VERSION whenever FILES changes. */
const VERSION = "spelling-games-v1";
const FILES = [
    "./",
    "index.html",
    "styles.css",
    "fonts.css",
    "words.js",
    "app.js",
    "wordsearch.js",
    "crossword.js",
    "panels.js",
    "manifest.webmanifest",
    "fonts/andika-400.woff2",
    "fonts/andika-700.woff2",
    "fonts/baloo2.woff2",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-maskable-512.png",
    "icons/apple-touch-icon.png",
    "icons/favicon-64.png"
];

self.addEventListener("install", event => {
    event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const req = event.request;
    if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

    event.respondWith(caches.open(VERSION).then(async cache => {
        const cached = await cache.match(req, { ignoreSearch: true });
        const fresh = fetch(req).then(res => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
        }).catch(() => null);

        if (cached) {
            event.waitUntil(fresh);
            return cached;
        }
        const res = await fresh;
        if (res) return res;
        if (req.mode === "navigate") return cache.match("index.html");
        return Response.error();
    }));
});
