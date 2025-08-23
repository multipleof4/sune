// /sw.js
// Enhanced: tracks whether streaming fetches are being teed and reports status on ping.
// Drop this at the root: /sw.js

const TARGET_SUBSTRING = 'openrouter.ai/api/v1/chat/completions'; // adjust if different
const STATE_TTL_MS = 24 * 60 * 60 * 1000;

const state = {
  totalIntercepted: 0,
  activeStreams: {}, // streamId -> { url, startedAt, bytes, lastProgressAt, status }
  lastStreamSummary: null // summary of last finished stream
};

const gid = () => Math.random().toString(36).slice(2, 9) + '-' + Date.now().toString(36);

async function broadcast(msg) {
  try {
    const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    for (const c of clientsList) {
      try { c.postMessage(msg); } catch (e) { /* ignore client errors */ }
    }
  } catch(e) { /* ignore */ }
}

function cleanupState() {
  const now = Date.now();
  for (const k of Object.keys(state.activeStreams)) {
    if ((now - (state.activeStreams[k].lastProgressAt || state.activeStreams[k].startedAt)) > STATE_TTL_MS) {
      delete state.activeStreams[k];
    }
  }
}

// install/activate
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

// fetch: attempt to tee target streaming responses and track progress
self.addEventListener('fetch', (event) => {
  try {
    const url = String(event.request.url || '');
    if (!url.includes(TARGET_SUBSTRING)) return; // not our target

    event.respondWith((async () => {
      const upstream = await fetch(event.request);

      // if there's no body (or not a readable stream), just forward
      if (!upstream || !upstream.body) return upstream;

      // create a stream id and register active stream
      const streamId = 'sw-' + gid();
      const meta = { url, startedAt: Date.now(), bytes: 0, lastProgressAt: Date.now(), status: 'started' };
      state.totalIntercepted = (state.totalIntercepted || 0) + 1;
      state.activeStreams[streamId] = meta;
      // notify clients
      broadcast({ type: 'sw-intercept-start', streamId, meta });

      // tee the body: one goes to client, one we consume in SW
      const [clientStream, swStream] = upstream.body.tee();

      const savePromise = (async () => {
        try {
          const reader = swStream.getReader();
          const decoder = new TextDecoder('utf-8');
          let decodedSoFar = '';
          let chunkCount = 0;
          let lastBroadcastMs = 0;
          const BROADCAST_THROTTLE_MS = 800;
          const BROADCAST_BYTES = 16 * 1024; // also broadcast every ~16KB

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunkCount++;
            // count bytes
            const bytes = value ? value.byteLength || 0 : 0;
            meta.bytes += bytes;
            meta.lastProgressAt = Date.now();

            // append decoded snippet for quick preview
            try { decodedSoFar += decoder.decode(value, { stream: true }); } catch (e) { /* ignore decode */ }

            // occasional broadcasts (throttle)
            const now = Date.now();
            if (now - lastBroadcastMs > BROADCAST_THROTTLE_MS || meta.bytes >= (meta._lastBroadcastBytes || 0) + BROADCAST_BYTES) {
              meta._lastBroadcastBytes = meta.bytes;
              lastBroadcastMs = now;
              broadcast({
                type: 'sw-intercept-progress',
                streamId,
                meta: { bytes: meta.bytes, lastProgressAt: meta.lastProgressAt, snippet: decodedSoFar.slice(-1024) }
              });
            }
          }

          // finalize
          meta.status = 'finished';
          meta.endedAt = Date.now();
          state.lastStreamSummary = {
            streamId, url, startedAt: meta.startedAt, endedAt: meta.endedAt, totalBytes: meta.bytes
          };
          // remove from active
          delete state.activeStreams[streamId];
          broadcast({ type: 'sw-intercept-end', streamId, meta: { totalBytes: meta.bytes, endedAt: meta.endedAt } });
        } catch (err) {
          meta.status = 'error';
          meta.error = String(err && err.message ? err.message : err);
          meta.lastProgressAt = Date.now();
          delete state.activeStreams[streamId];
          broadcast({ type: 'sw-intercept-error', streamId, meta: { error: meta.error } });
          console.error('sw: stream save error', err);
        }
      })();

      // keep the SW alive while we process the swStream
      event.waitUntil(savePromise);

      // forward the response to the page using the clientStream
      return new Response(clientStream, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers
      });
    })());
  } catch (e) {
    console.error('sw: fetch handler error', e);
  } finally {
    cleanupState();
  }
});

// message handler: support PING (simple) and PING_STATUS (detailed)
self.addEventListener('message', (event) => {
  const data = event.data || {};
  try {
    if (data && data.type === 'PING') {
      // original ping behavior: support MessageChannel
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ type: 'PONG', ts: Date.now(), ok: true });
      } else if (event.source && typeof event.source.postMessage === 'function') {
        try { event.source.postMessage({ type: 'PONG', ts: Date.now(), ok: true }); } catch(e) {}
      } else {
        broadcast({ type: 'PONG', ts: Date.now(), ok: true });
      }
      return;
    }

    if (data && data.type === 'PING_STATUS') {
      // return current SW status: activeStreams summary + lastStreamSummary + totalIntercepted
      const reply = {
        type: 'PONG_STATUS',
        ts: Date.now(),
        totalIntercepted: state.totalIntercepted || 0,
        activeStreams: Object.entries(state.activeStreams).map(([id, m]) => ({ streamId: id, url: m.url, bytes: m.bytes, status: m.status, startedAt: m.startedAt })),
        lastStreamSummary: state.lastStreamSummary || null
      };
      // reply on MessageChannel port if present, else try source, else broadcast
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage(reply);
      } else if (event.source && typeof event.source.postMessage === 'function') {
        try { event.source.postMessage(reply); } catch(e) {}
      } else {
        broadcast(reply);
      }
      return;
    }

    // support a request for the sw to return its current state (no port)
    if (data && data.type === 'GET_STATE') {
      const snapshot = { totalIntercepted: state.totalIntercepted || 0, activeCount: Object.keys(state.activeStreams).length, last: state.lastStreamSummary || null };
      if (event.ports && event.ports[0]) event.ports[0].postMessage({ type:'STATE', snapshot });
      else if (event.source && event.source.postMessage) event.source.postMessage({ type:'STATE', snapshot });
      return;
    }
  } catch (e) {
    console.error('sw: message handler error', e);
  }
});
