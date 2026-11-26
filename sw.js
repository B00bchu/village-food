const cacheName = 'village-food-shell-v16';
const assets = ['./', './index.html', './style.css', './app.mjs', './market-api.mjs', './account.mjs', './supabase-config.mjs', './model.mjs', './app.webmanifest', './icon-192.png', './icon-512.png',
  './market-hero.webp', './food-rice.webp', './food-noodles.webp', './food-dessert.webp', './food-tea.webp',
  './village-art.webp', './food-pad-thai.webp', './food-green-curry.webp', './food-grilled-pork.webp', './food-coconut-pancakes.webp'];
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
