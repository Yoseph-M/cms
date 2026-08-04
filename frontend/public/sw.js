const CACHE_NAME = 'mern-pos-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Background Sync Listener
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(triggerBackgroundSyncToWindow());
  }
});

async function triggerBackgroundSyncToWindow() {
  const allClients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of allClients) {
    client.postMessage({ type: 'PROCESS_OFFLINE_SYNC_QUEUE' });
  }
}
