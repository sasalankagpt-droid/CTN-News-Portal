self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('ctn-shell-')).map(k => caches.delete(k)));
    await self.registration.unregister();
  })());
});
