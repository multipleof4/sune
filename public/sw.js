// /sw.js  (drop in at root)
// Debug service worker — tee & write to localforage and expose debug commands.

const LF_CDN = 'https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js';
const THREADS_KEY = 'threads_v1';
const TARGET_SUBSTRING = 'openrouter.ai/api/v1/chat/completions'; // adjust if needed
const SAVE_BYTES_THRESHOLD = 6 * 1024; // ~6KB
const SAVE_TIME_THRESHOLD = 800; // ms
const BROADCAST_THROTTLE_MS = 600;

const gid = () => Math.random().toString(36).slice(2,9) + '-' + Date.now().toString(36);
const now = () => Date.now();

let localforageAvailable = false;
let lfLoadError = null;

// Attempt to import localforage
try {
  importScripts(LF_CDN);
  if (self.localforage) {
    localforageAvailable = true;
    // configure a name to avoid collisions (optional)
    try {
      localforage.config({ name: 'sw-localforage' });
    } catch(e){}
  } else {
    lfLoadError = 'localforage not present after importScripts';
  }
} catch (e) {
  lfLoadError = String(e && e.message ? e.message : e);
}

// in-memory state for debug/status
const state = {
  totalIntercepted: 0,
  activeStreams: {}, // streamId -> meta
  lastStreamSummary: null,
  debugWrites: [] // ids of test threads written by SW
};

async function safeReadThreads() {
  if (!localforageAvailable) throw new Error('localforage not available: ' + lfLoadError);
  try {
    const v = await localforage.getItem(THREADS_KEY);
    return Array.isArray(v) ? v : [];
  } catch (err) {
    throw err;
  }
}
async function safeWriteThreads(arr) {
  if (!localforageAvailable) throw new Error('localforage not available: ' + lfLoadError);
  try {
    await localforage.setItem(THREADS_KEY, arr);
  } catch (err) {
    throw err;
  }
}

// pick last thread heuristic: newest updatedAt
function pickLastThread(threads) {
  if (!threads || threads.length === 0) return null;
  const copy = [...threads].sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
  return copy[0] || null;
}

function upsertAssistantInThreadObj(threadObj, streamId, text) {
  threadObj.updatedAt = now();
  for (let i = threadObj.messages.length - 1; i >= 0; i--) {
    const m = threadObj.messages[i];
    if (m && m.sw_streamId === streamId) {
      m.content = text;
      m.contentParts = [{type:'text', text}];
      m.updatedAt = now();
      m._sw_savedAt = now();
      return threadObj;
    }
  }
  // append
  const msg = {
    id: 'swmsg-' + gid(),
    role: 'assistant',
    content: text,
    contentParts: [{type:'text', text}],
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

async function broadcast(msg) {
  try {
    const cl = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    for (const c of cl) {
      try { c.postMessage(msg); } catch(e) {}
    }
  } catch(e) {}
}

function logDebug(text) { // also broadcast small logs
  console.log('[sw-debug]', text);
  broadcast({ type: 'sw-debug-log', ts: now(), text: String(text) });
}

/* lifecycle */
self.addEventListener('install', (ev) => { self.skipWaiting(); });
self.addEventListener('activate', (ev) => { ev.waitUntil(self.clients.claim()); });

/* fetch handler: tee, accumulate, and repeatedly overwrite last thread */
self.addEventListener('fetch', (event) => {
  try {
    const url = String(event.request.url || '');
    if (!url.includes(TARGET_SUBSTRING)) return; // not target

    event.respondWith((async () => {
      const upstream = await fetch(event.request);

      if (!upstream || !upstream.body) return upstream;

      const streamId = 'sw-' + gid();
      const meta = { url, startedAt: now(), bytes: 0, status: 'started' };
      state.totalIntercepted = (state.totalIntercepted || 0) + 1;
      state.activeStreams[streamId] = meta;
      broadcast({ type: 'sw-intercept-start', streamId, meta });

      const [clientStream, swStream] = upstream.body.tee();

      // save task
      const savePromise = (async () => {
        const reader = swStream.getReader();
        const decoder = new TextDecoder('utf-8');
        let accumulated = '';
        let sinceLastSaveBytes = 0;
        let lastSaveAt = 0;
        let lastBroadcastAt = 0;

        async function flushToLastThread(force = false) {
          try {
            const nowMs = now();
            if (!force && sinceLastSaveBytes < SAVE_BYTES_THRESHOLD && (nowMs - lastSaveAt) < SAVE_TIME_THRESHOLD) return;
            if (!localforageAvailable) {
              logDebug('flushToLastThread: localforage not available: ' + lfLoadError);
              return;
            }
            const threads = await safeReadThreads();
            let thread = pickLastThread(threads);
            if (!thread) {
              thread = { id: 'sw-thread-' + gid(), title: 'Missed while backgrounded', pinned:false, updatedAt: nowMs, messages: [] };
              threads.unshift(thread);
              logDebug('flush: created fallback thread ' + thread.id);
            }
            upsertAssistantInThreadObj(thread, streamId, accumulated);
            // write back (overwrite entire array)
            await safeWriteThreads(threads);
            sinceLastSaveBytes = 0;
            lastSaveAt = nowMs;
            // throttle broadcasts
            const now2 = Date.now();
            if (now2 - lastBroadcastAt > BROADCAST_THROTTLE_MS) {
              lastBroadcastAt = now2;
              broadcast({ type: 'sw-intercept-progress', streamId, meta: { bytes: meta.bytes, savedAt: lastSaveAt, snippet: accumulated.slice(-1024) } });
            }
          } catch (err) {
            logDebug('flushToLastThread error: ' + (err && err.message ? err.message : String(err)));
          }
        }

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            let chunkText = '';
            try { chunkText = decoder.decode(value, { stream: true }); } catch(e) { try { chunkText = String(value); } catch(_) { chunkText = ''; } }
            accumulated += chunkText;
            const bytes = value ? (value.byteLength || 0) : chunkText.length;
            meta.bytes += bytes;
            meta.lastProgressAt = now();
            sinceLastSaveBytes += bytes;
            // flush if thresholds met
            await flushToLastThread(false);
          }

          // final flush
          await flushToLastThread(true);

          // finalize
          meta.status = 'finished';
          meta.endedAt = now();
          state.lastStreamSummary = { streamId, url: meta.url, startedAt: meta.startedAt, endedAt: meta.endedAt, totalBytes: meta.bytes };
          delete state.activeStreams[streamId];
          broadcast({ type: 'sw-intercept-end', streamId, meta: { totalBytes: meta.bytes, endedAt: meta.endedAt } });
        } catch (err) {
          meta.status = 'error';
          meta.error = String(err && err.message ? err.message : err);
          delete state.activeStreams[streamId];
          broadcast({ type: 'sw-intercept-error', streamId, meta: { error: meta.error } });
          logDebug('savePromise error: ' + meta.error);
        }
      })();

      event.waitUntil(savePromise);

      return new Response(clientStream, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers
      });
    })());
  } catch (err) {
    logDebug('fetch handler error: ' + (err && err.message ? err.message : String(err)));
  }
});

/* Message handler: PING, PING_STATUS, TEST_WRITE, CHECK_LF, LIST_SW_SAVED, CLEAR_TESTS */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  try {
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

    if (data && data.type === 'PING_STATUS') {
      const reply = {
        type: 'PONG_STATUS',
        ts: now(),
        totalIntercepted: state.totalIntercepted || 0,
        activeStreams: Object.entries(state.activeStreams).map(([id,m]) => ({ streamId: id, url: m.url, bytes: m.bytes, status: m.status, startedAt: m.startedAt })),
        lastStreamSummary: state.lastStreamSummary || null,
        lfAvailable: localforageAvailable,
        lfLoadError: lfLoadError
      };
      if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
      else if (event.source && event.source.postMessage) event.source.postMessage(reply);
      else broadcast(reply);
      return;
    }

    if (data && data.type === 'TEST_WRITE') {
      (async () => {
        if (!localforageAvailable) {
          const res = { type:'TEST_WRITE_RESULT', ok:false, error: 'localforage not available: ' + lfLoadError };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res); else (event.source && event.source.postMessage ? event.source.postMessage(res) : broadcast(res));
          return;
        }
        try {
          const threads = await safeReadThreads();
          const tid = 'sw-test-' + gid();
          const nowMs = now();
          const testThread = {
            id: tid,
            title: 'SW test thread ' + nowMs,
            pinned: false,
            updatedAt: nowMs,
            messages: [
              { id: 'swtestmsg-' + gid(), role: 'assistant', content: 'sw test write @' + new Date(nowMs).toISOString(), contentParts: [{type:'text',text:'sw test write @' + new Date(nowMs).toISOString()}], createdAt: nowMs, updatedAt: nowMs }
            ]
          };
          threads.unshift(testThread);
          await safeWriteThreads(threads);
          state.debugWrites = (state.debugWrites||[]).concat(tid);
          const res = { type:'TEST_WRITE_RESULT', ok:true, tid, now: nowMs };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res); else (event.source && event.source.postMessage ? event.source.postMessage(res) : broadcast(res));
          logDebug('TEST_WRITE created ' + tid);
        } catch (err) {
          const res = { type:'TEST_WRITE_RESULT', ok:false, error: String(err && err.message ? err.message : err) };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res); else (event.source && event.source.postMessage ? event.source.postMessage(res) : broadcast(res));
          logDebug('TEST_WRITE error: ' + res.error);
        }
      })();
      return;
    }

    if (data && data.type === 'CHECK_LF') {
      (async () => {
        if (!localforageAvailable) {
          const res = { type:'CHECK_LF_RESULT', ok:false, error: 'localforage not available: ' + lfLoadError };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res); else (event.source && event.source.postMessage ? event.source.postMessage(res) : broadcast(res));
          return;
        }
        try {
          const threads = await safeReadThreads();
          const res = { type:'CHECK_LF_RESULT', ok:true, threadsCount: Array.isArray(threads)?threads.length:0, sample: (threads && threads[0]) ? threads[0] : null };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res); else (event.source && event.source.postMessage ? event.source.postMessage(res) : broadcast(res));
          logDebug('CHECK_LF returned ' + (Array.isArray(threads)?threads.length:'?') + ' threads');
        } catch (err) {
          const res = { type:'CHECK_LF_RESULT', ok:false, error: String(err && err.message ? err.message : err) };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res); else (event.source && event.source.postMessage ? event.source.postMessage(res) : broadcast(res));
          logDebug('CHECK_LF error: ' + res.error);
        }
      })();
      return;
    }

    if (data && data.type === 'LIST_SW_SAVED') {
      (async () => {
        if (!localforageAvailable) {
          const res = { type:'LIST_SW_SAVED_RESULT', ok:false, error: 'localforage not available: ' + lfLoadError };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res); else (event.source && event.source.postMessage ? event.source.postMessage(res) : broadcast(res));
          return;
        }
        try {
          const threads = await safeReadThreads();
          const found = [];
          for (const t of (threads || [])) {
            for (const m of (t.messages || [])) {
              if (m && m.sw_streamId) found.push({ threadId: t.id, threadTitle: t.title, messageId: m.id, sw_streamId: m.sw_streamId, snippet: (m.content||'').slice(0,200), updatedAt: m.updatedAt });
            }
          }
          const res = { type:'LIST_SW_SAVED_RESULT', ok:true, found };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res); else (event.source && event.source.postMessage ? event.source.postMessage(res) : broadcast(res));
          logDebug('LIST_SW_SAVED returned ' + found.length + ' messages');
        } catch (err) {
          const res = { type:'LIST_SW_SAVED_RESULT', ok:false, error: String(err && err.message ? err.message : err) };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res); else (event.source && event.source.postMessage ? event.source.postMessage(res) : broadcast(res));
          logDebug('LIST_SW_SAVED error: ' + res.error);
        }
      })();
      return;
    }

    if (data && data.type === 'CLEAR_TESTS') {
      (async () => {
        if (!localforageAvailable) {
          const res = { type:'CLEAR_TESTS_RESULT', ok:false, error: 'localforage not available: ' + lfLoadError };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res); else broadcast(res);
          return;
        }
        try {
          const threads = await safeReadThreads();
          const before = threads.length;
          const cleaned = threads.filter(t => !(t.id && (String(t.id).startsWith('sw-test-') || String(t.id).startsWith('sw-thread-') || state.debugWrites.includes(t.id))));
          await safeWriteThreads(cleaned);
          const removed = before - cleaned.length;
          state.debugWrites = [];
          const res = { type:'CLEAR_TESTS_RESULT', ok:true, removed };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res); else broadcast(res);
          logDebug('CLEAR_TESTS removed ' + removed);
        } catch (err) {
          const res = { type:'CLEAR_TESTS_RESULT', ok:false, error: String(err && err.message ? err.message : err) };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res); else broadcast(res);
        }
      })();
      return;
    }

  } catch (err) {
    logDebug('message handler error: ' + (err && err.message ? err.message : String(err)));
  }
});
