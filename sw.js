const CACHE_NAME = 'hotapp-v1';
const urlsToCache = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) {
    // API 请求不缓存，直接走网络
    return;
  }
  e.respondWith(
    caches.match(e.request).then(resp => resp || fetch(e.request))
  );
});