// sw.js
// Service Worker for Mitishirube App

const CACHE_NAME = 'mitishirube-cache-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/home.css',
    '/home.js',
    '/posts.css',
    '/posts.js',
    '/posts.html',
    '/schedule.js',
    '/schedule.html',
    '/event.html',
    '/admin.html',
    '/admin.js',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('fetch', (event) => {
    // API requests should not be cached or should be network-first
    if (event.request.url.includes('/api/')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Static assets: Cache First, falling back to Network
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (!cacheWhitelist.includes(cacheName)) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
