const CACHE_NAME = 'hotapp-v2';
const STATIC_ASSETS = ['/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // API 请求不缓存，直接走网络
  if (url.includes('/api/')) {
    return;
  }

  // index.html 网络优先，确保版本更新自动生效
  if (url.includes('/index.html') || url.endsWith('/') || url.match(/\/\?v=\d+$/)) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 其他静态资源缓存优先
  e.respondWith(
    caches.match(e.request).then(resp => resp || fetch(e.request))
  );
});