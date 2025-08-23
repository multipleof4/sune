// /sw.js
// Service worker that tees streaming responses and continuously overwrites the latest
// thread in localForage (key: 'threads_v1') with the accumulating assistant text.
// Keeps ping/pong and PING_STATUS support and broadcasts live events.
//
// Requirements: place this at root (/sw.js). No changes to index required.

importScripts('https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js');

const TARGET_SUBSTRING = 'openrouter.ai/api/v1/chat/completions'; // change if needed
const THREADS_KEY = 'threads_v1';
const SAVE_BYTES_THRESHOLD = 8 * 1024;   // flush every ~8KB of new text
const SAVE_TIME_THRESHOLD = 1000;        // or at least every 1s
const BROADCAST_THROTTLE_MS = 700;       // throttle progress broadcasts

/* --- Utilities --- */
const gid = () => Math.random().toString(36).slice(2,9) + '-' + Date.now().toString(36);
const now = () => Date.now();

async function readThreads() {
  try {
    const v = await localforage.getItem(THREADS_KEY);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    console.error('sw: readThreads error', e);
    return [];
  }
}
async function writeThreads(arr) {
  try {
    await localforage.setItem(THREADS_KEY, arr);
  } catch (e) {
    console.error('sw: writeThreads error', e);
    throw e;
  }
}

/* pick last thread heuristic: newest updatedAt, fallback to first */
function pickLastThread(threads) {
  if (!threads || threads.length === 0) return null;
  let sorted = [...threads].sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
  return sorted[0];
}

/* Upsert assistant message in a thread by sw_streamId (overwrite content) */
function upsertAssistantInThreadObj(threadObj, streamId, text) {
  threadObj.updatedAt = now();
  // look for existing message with sw_streamId (search from end)
  for (let i = threadObj.messages.length - 1; i >= 0; i--) {
    const m = threadObj.messages[i];
    if (m && m.sw_streamId === streamId) {
      m.content = text;
      m.contentParts = [{ type: 'text', text }];
      m.updatedAt = now();
      m._sw_savedAt = now();
      return threadObj;
    }
  }
  // not found: append a new assistant message
  const msg = {
    id: 'swmsg-' + gid(),
    role: 'assistant',
    content: text,
    contentParts: [{ type: 'text', text }],
    kind: 'assistant',
    sw_saved: true,
    sw_streamId: streamId,
    createdAt: now(),
    updatedAt: now(),
    _sw_savedAt: now()
  };
  threadObj.messages.push(msg);
  return threadObj;
}

/* Broadcast helpers */
async function broadcast(msg) {
  try {
    const cl = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    for (const c of cl) {
      try { c.postMessage(msg); } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }
}

/* --- Worker lifecycle --- */
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

/* --- Stream tracking state (in-memory) --- */
const state = {
  totalIntercepted: 0,
  activeStreams: {},      // streamId => meta
  lastStream: null
};

/* --- Main fetch handler: tee + continuously overwrite latest thread --- */
self.addEventListener('fetch', event => {
  try {
    const url = String(event.request.url || '');
    if (!url.includes(TARGET_SUBSTRING)) return; // not our target

    event.respondWith((async () => {
      const upstream = await fetch(event.request);

      // nothing to do if no stream body
      if (!upstream || !upstream.body) return upstream;

      const streamId = 'sw-' + gid();
      const meta = { url, startedAt: now(), bytes: 0, status: 'started' };
      state.totalIntercepted = (state.totalIntercepted || 0) + 1;
      state.activeStreams[streamId] = meta;
      broadcast({ type: 'sw-intercept-start', streamId, meta });

      // tee the stream
      const [clientStream, swStream] = upstream.body.tee();

      // background saving task (continually overwrite latest thread)
      const savePromise = (async () => {
        const reader = swStream.getReader();
        const decoder = new TextDecoder('utf-8');
        let accumulated = '';         // full text accumulated for this stream
        let sinceLastSaveBytes = 0;
        let lastSaveAt = 0;
        let lastBroadcastAt = 0;

        // Helper to save accumulated text into last thread
        async function flushToLastThread(force = false) {
          try {
            const nowMs = now();
            if (!force && sinceLastSaveBytes < SAVE_BYTES_THRESHOLD && (nowMs - lastSaveAt) < SAVE_TIME_THRESHOLD) return;
            // read latest threads
            const threads = await readThreads();
            let thread = pickLastThread(threads);
            const createdAt = nowMs;
            if (!thread) {
              // create fallback thread if none exists
              thread = {
                id: 'sw-thread-' + gid(),
                title: 'Missed while backgrounded',
                pinned: false,
                updatedAt: createdAt,
                messages: []
              };
              threads.unshift(thread);
            }
            // upsert message
            upsertAssistantInThreadObj(thread, streamId, accumulated);
            // write back (this will overwrite whole array, which matches page reading expectation)
            await writeThreads(threads);
            sinceLastSaveBytes = 0;
            lastSaveAt = nowMs;
            // broadcast progress summary
            const now2 = Date.now();
            if (now2 - lastBroadcastAt > BROADCAST_THROTTLE_MS) {
              lastBroadcastAt = now2;
              broadcast({
                type: 'sw-intercept-progress',
                streamId,
                meta: { bytes: meta.bytes, savedAt: lastSaveAt, snippet: accumulated.slice(-1024) }
              });
            }
          } catch (err) {
            console.error('sw: flushToLastThread error', err);
          }
        }

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            // value is Uint8Array (may be chunked). decode and append
            let chunkText = '';
            try {
              chunkText = decoder.decode(value, { stream: true });
            } catch (e) {
              // fallback: best-effort text conversion
              try { chunkText = String(value); } catch (ee) { chunkText = ''; }
            }
            accumulated += chunkText;
            const bytes = value ? (value.byteLength || 0) : chunkText.length;
            meta.bytes += bytes;
            meta.lastProgressAt = now();

            // accumulate for thresholded saves
            sinceLastSaveBytes += bytes;
            // flush condition: size or time
            await flushToLastThread(false);
          }

          // final flush and finalize
          await flushToLastThread(true);

          meta.status = 'finished';
          meta.endedAt = now();
          state.lastStream = { streamId, url: meta.url, startedAt: meta.startedAt, endedAt: meta.endedAt, totalBytes: meta.bytes };
          delete state.activeStreams[streamId];
          broadcast({ type: 'sw-intercept-end', streamId, meta: { totalBytes: meta.bytes, endedAt: meta.endedAt } });
        } catch (err) {
          meta.status = 'error';
          meta.error = String(err && err.message ? err.message : err);
          delete state.activeStreams[streamId];
          broadcast({ type: 'sw-intercept-error', streamId, meta: { error: meta.error } });
          console.error('sw: savePromise error', err);
        }
      })();

      // keep SW alive while saving
      event.waitUntil(savePromise);

      // respond to page
      return new Response(clientStream, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers
      });
    })());
  } catch (err) {
    console.error('sw: fetch handler error', err);
  }
});

/* --- Messaging: PING / PING_STATUS / GET_STATE --- */
self.addEventListener('message', event => {
  const data = event.data || {};
  try {
    // simple ping (original behavior)
    if (data && data.type === 'PING') {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ type: 'PONG', ts: now(), ok: true });
      } else if (event.source && typeof event.source.postMessage === 'function') {
        try { event.source.postMessage({ type: 'PONG', ts: now(), ok: true }); } catch(e) {}
      } else {
        broadcast({ type: 'PONG', ts: now(), ok: true });
      }
      return;
    }

    // status ping that returns internal state
    if (data && data.type === 'PING_STATUS') {
      const reply = {
        type: 'PONG_STATUS',
        ts: now(),
        totalIntercepted: state.totalIntercepted || 0,
        activeStreams: Object.entries(state.activeStreams).map(([id,m]) => ({ streamId: id, url: m.url, bytes: m.bytes, status: m.status, startedAt: m.startedAt })),
        lastStream: state.lastStream || null
      };
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage(reply);
      } else if (event.source && typeof event.source.postMessage === 'function') {
        try { event.source.postMessage(reply); } catch(e) {}
      } else {
        broadcast(reply);
      }
      return;
    }

    // optional: client requests list of SW-saved streams/messages
    if (data && data.type === 'LIST_SW_SAVED') {
      (async () => {
        const threads = await readThreads();
        const found = [];
        for (const t of (threads || [])) {
          for (const m of (t.messages || [])) {
            if (m && m.sw_streamId) found.push({ threadId: t.id, threadTitle: t.title, messageId: m.id, sw_streamId: m.sw_streamId, snippet: (m.content||'').slice(0,200), updatedAt: m.updatedAt });
          }
        }
        if (event.ports && event.ports[0]) event.ports[0].postMessage({ type: 'LIST_SW_SAVED_RESULT', streams: found });
        else if (event.source && typeof event.source.postMessage === 'function') event.source.postMessage({ type: 'LIST_SW_SAVED_RESULT', streams: found });
        else broadcast({ type: 'LIST_SW_SAVED_RESULT', streams: found });
      })();
      return;
    }
  } catch (e) {
    console.error('sw: message handler error', e);
  }
});
