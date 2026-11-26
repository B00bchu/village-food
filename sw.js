const cacheName = 'village-food-shell-v3';
const assets = ['./', './index.html', './style.css', './app.mjs', './model.mjs', './app.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets)));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !assets.some(asset => new URL(asset, self.location.href).href === event.request.url)) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('village-food-shell-') && key !== cacheName)
    .map(key => caches.delete(key)))));
});
