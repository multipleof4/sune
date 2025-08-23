// /sw.js - minimal worker that reports if it was restarted (killed)
'use strict';

const DB_NAME = 'sune-sw-db';
const STORE = 'kv';
const KEY = 'lastSession';

// tiny IndexedDB helpers
function idbOpen() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('idb open error'));
  });
}
function idbGet(key) {
  return idbOpen().then(db => new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
}
function idbSet(key, val) {
  return idbOpen().then(db => new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(val, key);
    req.onsuccess = () => res(true);
    req.onerror = () => rej(req.error);
  }));
}

// lightweight session identity
const SESSION_ID = Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
const STARTED_AT = Date.now();

self.addEventListener('install', ev => {
  // activate immediately so the page can become controlled quickly
  self.skipWaiting();
});

self.addEventListener('activate', ev => {
  // claim clients so the page becomes controlled without reload where possible
  ev.waitUntil(self.clients.claim());
});

// respond to messages (works with MessageChannel from the sune)
self.addEventListener('message', ev => {
  const data = ev.data || {};
  // only handle PING to keep this tiny
  if (data.type !== 'PING') return;

  const respond = async () => {
    try {
      const last = await idbGet(KEY); // may be undefined on first run
      const restarted = !!last && last !== SESSION_ID; // true if there was a previous session different than this one
      // store current session id for subsequent comparisons
      await idbSet(KEY, SESSION_ID);

      const payload = {
        type: 'PONG',
        ts: Date.now(),
        sessionId: SESSION_ID,
        lastSessionId: last || null,
        restarted: restarted,
        uptimeMs: Date.now() - STARTED_AT,
        ok: true
      };

      // prefer replying on the provided port
      if (ev.ports && ev.ports[0]) {
        ev.ports[0].postMessage(payload);
      } else {
        // fallback: postMessage to all clients
        const clients = await self.clients.matchAll({includeUncontrolled: true});
        clients.forEach(c => c.postMessage(payload));
      }
    } catch (err) {
      const errPayload = {type:'PONG', ok:false, error: String(err), ts: Date.now()};
      if (ev.ports && ev.ports[0]) ev.ports[0].postMessage(errPayload);
    }
  };

  // ensure the work completes even if the worker might otherwise be stopped
  if (ev.waitUntil) ev.waitUntil(Promise.resolve(respond()));
  else respond();
});
