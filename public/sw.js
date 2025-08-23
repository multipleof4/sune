// /sw.js
// Service worker that detects if it was restarted (killed) between pings.
// - Uses IndexedDB to persist restartCount and lastPingRestartCount
// - Replies to message {type: 'PING'} by responding on the provided MessagePort
//   with a {type:'PONG', ...} payload the sune logs already.

// Basic small IDB helper (promisified key-value store)
const DB_NAME = 'sune-sw-test-db';
const STORE = 'kv';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'k' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const s = tx.objectStore(STORE);
    const r = s.get(key);
    r.onsuccess = () => resolve(r.result ? r.result.v : undefined);
    r.onerror = () => reject(r.error);
  });
}

async function idbPut(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const s = tx.objectStore(STORE);
    const r = s.put({ k: key, v: value });
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

// Instance info set at startup
const INSTANCE_ID = (self.crypto && self.crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()).slice(2);
const STARTED_AT = Date.now();
const VERSION = '1.0.0'; // bump if you change behavior

// Keys used in IDB
const KEY_RESTART_COUNT = 'restartCount';
const KEY_LAST_PING_RESTART_COUNT = 'lastPingRestartCount';
const KEY_LAST_PING_TIME = 'lastPingTime';

// On install/activate: increment persistent restart counter so we can detect restarts.
self.addEventListener('install', (ev) => {
  // activate immediately so testing is easier
  self.skipWaiting();
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    // claim clients quickly
    await self.clients.claim();

    try {
      const current = (await idbGet(KEY_RESTART_COUNT)) || 0;
      const next = current + 1;
      await idbPut(KEY_RESTART_COUNT, next);
      console.log(`[sw] activated — instance=${INSTANCE_ID} start=${new Date(STARTED_AT).toISOString()} restartCount=${next}`);
    } catch (err) {
      console.error('[sw] activate idb error', err);
    }
  })());
});

// Helper to reply on message port or broadcast fallback
async function replyToMessage(event, payload) {
  // Prefer using provided MessagePort (sune sends one)
  if (event.ports && event.ports[0]) {
    try {
      event.ports[0].postMessage(payload);
      return;
    } catch (err) {
      console.warn('[sw] reply via port failed', err);
    }
  }

  // Fallback: send to the client who sent the message (if event.source) or broadcast
  try {
    if (event.source && typeof event.source.postMessage === 'function') {
      event.source.postMessage(payload);
      return;
    }
  } catch (err) {
    // ignore
  }

  // Last resort: broadcast to all clients
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of clients) {
    try { c.postMessage(payload); } catch (e) { /* ignore per-client errors */ }
  }
}

// Message handler
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data && data.type === 'PING') {
    (async () => {
      try {
        const now = Date.now();
        const restartCount = (await idbGet(KEY_RESTART_COUNT)) || 0;
        const lastPingRestartCount = (await idbGet(KEY_LAST_PING_RESTART_COUNT));
        const lastPingTime = (await idbGet(KEY_LAST_PING_TIME)) || null;

        // If there was a previously-recorded lastPingRestartCount and current restartCount
        // is greater, that means the worker was restarted since the last ping.
        const lostConnection = (typeof lastPingRestartCount !== 'undefined') && (restartCount > lastPingRestartCount);

        // Build response payload
        const payload = {
          type: 'PONG',
          ts: data.ts || null,
          now,
          sw: {
            version: VERSION,
            instanceId: INSTANCE_ID,
            startedAt: STARTED_AT,
            restartCount,
          },
          lastPing: {
            time: lastPingTime,
            lastPingRestartCount: lastPingRestartCount
          },
          lostConnectionSinceLastPing: !!lostConnection,
          note: lostConnection ? '
