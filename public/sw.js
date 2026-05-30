const CACHE_NAME = 'toutiao-v2';
const STATIC_ASSETS = ['/manifest.json', '/icon-192.png', '/icon-512.png', '/topic-keywords.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  // 立即接管所有页面，不等用户刷新
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // API 请求不缓存，直接走网络
  if (url.includes('/api/')) {
    return;
  }

  // JS/CSS 文件：网络优先 + 回退缓存（确保部署后能拿到新版本）
  if (url.match(/\.(js|css)(\?|$)/)) {
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // index.html 和根路径 网络优先，确保版本更新自动生效
  if (url.includes('/index.html') || url.endsWith('/') || url.match(/\/\?v=\d+$/)) {
    e.respondWith(
      fetch(e.request).then(resp => {
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, resp.clone()));
        return resp;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 其他静态资源缓存优先
  e.respondWith(
    caches.match(e.request).then(resp => resp || fetch(e.request))
  );
});