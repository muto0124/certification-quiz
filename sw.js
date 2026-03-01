// Service Worker — キャッシュファースト戦略
const CACHE_VERSION = '20260301132407';
const CACHE_NAME = `quiz-cache-${CACHE_VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './data/index.json',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// インストール: 静的アセットをプリキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// アクティベート: 古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// フェッチ: キャッシュファースト → ネットワークフォールバック
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // data/ 配下の JSON はキャッシュに追加（オンデマンドキャッシュ）
        if (event.request.url.includes('/data/') && event.request.url.endsWith('.json')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
