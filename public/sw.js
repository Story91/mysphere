// Kill-switch service worker: nic nie cachuje, wyrejestrowuje się i czyści
// stare cache. Zatrzymuje pętlę 404 po /sw.js (stara rejestracja SW na tym
// originie) bez wprowadzania własnego cachowania.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    })()
  );
});
