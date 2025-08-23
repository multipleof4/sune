// /sw.js (simple test worker)
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data?.type === 'PING') {
    // prefer replying on the message port if provided
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({type: 'PONG', ts: Date.now(), ok: true});
    } else {
      // fallback: broadcast to all clients
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({type: 'PONG', ts: Date.now(), ok: true}));
      });
    }
  }
});
