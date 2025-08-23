// /sw.js
// Service worker that uses localforage inside the worker to read/write 'threads_v1'.
// It tees streaming responses and continuously overwrites the last thread with accumulated assistant text.

try {
  importScripts('https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js');
} catch (e) {
  // importScripts may throw if blocked by CSP — we'll detect later and broadcast error
}

// Config / constants
const TARGET_SUBSTRING = 'openrouter.ai/api/v1/chat/completions';
const THREADS_KEY = 'threads_v1';
const SAVE_BYTES_THRESHOLD = 6 * 1024;
const SAVE_TIME_THRESHOLD = 800;
const BROADCAST_THROTTLE_MS = 600;

const gid = () => Math.random().toString(36).slice(2,9) + '-' + Date.now().toString(36);
const now = () => Date.now();

let lfAvailable = (typeof localforage !== 'undefined');
let lfLoadError = lfAvailable ? null : 'localforage not loaded (importScripts failed or blocked)';

async function broadcast(msg) {
  try {
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    for (const c of clients) {
      try { c.postMessage(msg); } catch (_) {}
    }
  } catch (_) {}
}

function logDebug(text) {
  // console and broadcast
  try { console.log('[sw] ' + text); } catch {}
  broadcast({ type: 'sw-debug-log', ts: now(), text: String(text) });
}

/** sanitize to structured-cloneable value */
function sanitizeForIDB(v) {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch (e) {
    // shallow fallback - keep minimal properties
    try {
      if (!Array.isArray(v)) return [];
      return v.map(t => ({
        id: t && t.id,
        title: t && t.title,
        updatedAt: t && t.updatedAt,
        messages: Array.isArray(t && t.messages) ? t.messages.map(m => ({ id: m && m.id, role: m && m.role, content: String((m && m.content) || '') })) : []
      }));
    } catch (_) {
      return [];
    }
  }
}

/** write threads with localforage.setItem and fallback to string if needed */
async function writeThreadsViaLocalForage(threadsArr) {
  if (!lfAvailable) throw new Error('localforage unavailable: ' + lfLoadError);
  const safeVal = sanitizeForIDB(threadsArr || []);
  try {
    await localforage.setItem(THREADS_KEY, safeVal);
    return { ok: true, method: 'localforage.setItem', storedAs: 'object' };
  } catch (err1) {
    // fallback: store as JSON string (always cloneable)
    try {
      await localforage.setItem(THREADS_KEY, JSON.stringify(safeVal));
      return { ok: true, method: 'localforage.setItem(stringified)', storedAs: 'string' };
    } catch (err2) {
      // both failed
      throw new Error('setItem failed: ' + (err2 && err2.message ? err2.message : String(err1)));
    }
  }
}

async function readThreadsViaLocalForage() {
  if (!lfAvailable) throw new Error('localforage unavailable: ' + lfLoadError);
  try {
    const v = await localforage.getItem(THREADS_KEY);
    // if value is a JSON string (fallback), try parse
    if (typeof v === 'string') {
      try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
    }
    return Array.isArray(v) ? v : [];
  } catch (err) {
    throw err;
  }
}

/* pick last thread heuristic (newest updatedAt) */
function pickLastThread(threads) {
  if (!threads || threads.length === 0) return null;
  const sorted = [...threads].sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
  return sorted[0];
}

/* upsert assistant message with sw_streamId into thread object */
function upsertAssistantInThreadObj(threadObj, streamId, text) {
  threadObj.updatedAt = now();
  threadObj.messages = threadObj.messages || [];
  for (let i = threadObj.messages.length - 1; i >= 0; i--) {
    const m = threadObj.messages[i];
    if (m && m.sw_streamId === streamId) {
      m.content = text;
      m.contentParts = [{ type:'text', text }];
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
    contentParts: [{ type:'text', text }],
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

/* write helper used while streaming */
async function flushToLastThreadUsingLF(streamId, accumulated, meta) {
  // read threads via localforage, update last thread, write back via localforage
  try {
    const threads = await readThreadsViaLocalForage();
    let thread = pickLastThread(threads);
    const createdAt = now();
    if (!thread) {
      thread = { id: 'sw-thread-' + gid(), title: 'Missed while backgrounded', pinned:false, updatedAt: createdAt, messages: [] };
      threads.unshift(thread);
    }
    upsertAssistantInThreadObj(thread, streamId, accumulated);
    const writeRes = await writeThreadsViaLocalForage(threads);
    return { ok: true, threadId: thread.id, writeRes };
  } catch (err) {
    // propagate error
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

/* lifecycle */
self.addEventListener('install', ev => { self.skipWaiting(); });
self.addEventListener('activate', ev => { ev.waitUntil(self.clients.claim()); });

/* in-memory state */
const state = { totalIntercepted: 0, activeStreams: {}, lastStream: null };

/* fetch handler */
self.addEventListener('fetch', event => {
  try {
    const url = String(event.request.url || '');
    if (!url.includes(TARGET_SUBSTRING)) return; // not relevant
    event.respondWith((async () => {
      const upstream = await fetch(event.request);
      if (!upstream || !upstream.body) return upstream;

      const streamId = 'sw-' + gid();
      const meta = { url, startedAt: now(), bytes: 0, status: 'started' };
      state.totalIntercepted = (state.totalIntercepted || 0) + 1;
      state.activeStreams[streamId] = meta;
      broadcast({ type: 'sw-intercept-start', streamId, meta });

      const [clientStream, swStream] = upstream.body.tee();

      const saveTask = (async () => {
        const reader = swStream.getReader();
        const decoder = new TextDecoder('utf-8');
        let acc = '';
        let sinceBytes = 0;
        let lastSaveAt = 0;
        let lastBroadcastAt = 0;

        async function maybeFlush(force = false) {
          const nowMs = now();
          if (!force && sinceBytes < SAVE_BYTES_THRESHOLD && (nowMs - lastSaveAt) < SAVE_TIME_THRESHOLD) return;
          // attempt localforage write
          const res = await flushToLastThreadUsingLF(streamId, acc, { bytes: meta.bytes });
          lastSaveAt = nowMs;
          sinceBytes = 0;
          if (res.ok) {
            const now2 = Date.now();
            if (now2 - lastBroadcastAt > BROADCAST_THROTTLE_MS) {
              lastBroadcastAt = now2;
              broadcast({ type:'sw-intercept-progress', streamId, meta: { bytes: meta.bytes, savedAt: lastSaveAt, snippet: acc.slice(-1024), threadId: res.threadId, writeRes: res.writeRes } });
            }
          } else {
            broadcast({ type:'sw-intercept-error', streamId, meta: { error: res.error } });
          }
        }

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            let chunk = '';
            try { chunk = decoder.decode(value, { stream: true }); } catch (e) { chunk = ''; }
            acc += chunk;
            const bytes = value ? (value.byteLength || 0) : chunk.length;
            meta.bytes += bytes;
            sinceBytes += bytes;
            // flush according to thresholds
            await maybeFlush(false);
          }
          // final flush
          await maybeFlush(true);
          meta.status = 'finished';
          meta.endedAt = now();
          state.lastStream = { streamId, url: meta.url, startedAt: meta.startedAt, endedAt: meta.endedAt, totalBytes: meta.bytes };
          delete state.activeStreams[streamId];
          broadcast({ type:'sw-intercept-end', streamId, meta: { totalBytes: meta.bytes, endedAt: meta.endedAt } });
        } catch (err) {
          meta.status = 'error';
          meta.error = String(err && err.message ? err.message : err);
          delete state.activeStreams[streamId];
          broadcast({ type:'sw-intercept-error', streamId, meta: { error: meta.error } });
        }
      })();

      // keep alive while saving
      event.waitUntil(saveTask);

      return new Response(clientStream, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers
      });
    })());
  } catch (err) {
    logDebug('fetch handler top-level error: ' + (err && err.message ? err.message : String(err)));
  }
});

/* message handler for debug commands */
self.addEventListener('message', event => {
  const data = event.data || {};
  (async () => {
    try {
      if (data && data.type === 'PING') {
        if (event.ports && event.ports[0]) event.ports[0].postMessage({ type:'PONG', ts: now(), ok:true });
        else broadcast({ type:'PONG', ts: now(), ok:true });
        return;
      }
      if (data && data.type === 'PING_STATUS') {
        const reply = { type:'PONG_STATUS', ts: now(), lfAvailable, lfLoadError, totalIntercepted: state.totalIntercepted||0, lastStream: state.lastStream || null };
        if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
        else broadcast(reply);
        return;
      }

      if (data && data.type === 'TEST_WRITE') {
        if (!lfAvailable) {
          const res = { type:'TEST_WRITE_RESULT', ok:false, error: 'localforage unavailable: ' + lfLoadError };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res); else broadcast(res);
          return;
        }
        try {
          const threads = await readThreadsViaLocalForage();
          const tid = 'sw-test-' + gid();
          const nowMs = now();
          const t = { id: tid, title: 'SW test ' + new Date(nowMs).toISOString(), pinned:false, updatedAt: nowMs, messages: [ { id:'swtest-'+gid(), role:'assistant', content:'sw test write @ ' + new Date(nowMs).toISOString(), contentParts:[{type:'text',text:'sw test write'}], createdAt: nowMs, updatedAt: nowMs } ] };
          threads.unshift(t);
          const writeRes = await writeThreadsViaLocalForage(threads);
          const out = { type:'TEST_WRITE_RESULT', ok:true, tid, writeRes };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(out); else broadcast(out);
        } catch (err) {
          const out = { type:'TEST_WRITE_RESULT', ok:false, error: String(err && err.message ? err.message : err) };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(out); else broadcast(out);
        }
        return;
      }

      if (data && data.type === 'READ_KEY') {
        const key = data.key || THREADS_KEY;
        if (!lfAvailable) {
          const res = { type:'READ_KEY_RESULT', ok:false, key, error: 'localforage unavailable: ' + lfLoadError };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res); else broadcast(res);
          return;
        }
        try {
          const val = await localforage.getItem(key);
          const parsed = (typeof val === 'string') ? ( (() => { try { return JSON.parse(val); } catch { return val; } })() ) : val;
          const out = { type:'READ_KEY_RESULT', ok:true, key, value: parsed };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(out); else broadcast(out);
        } catch (err) {
          const out = { type:'READ_KEY_RESULT', ok:false, key, error: String(err && err.message ? err.message : err) };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(out); else broadcast(out);
        }
        return;
      }

      if (data && data.type === 'LIST_SW_SAVED') {
        if (!lfAvailable) {
          const res = { type:'LIST_SW_SAVED_RESULT', ok:false, error: 'localforage unavailable: ' + lfLoadError };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res); else broadcast(res);
          return;
        }
        try {
          const threads = await readThreadsViaLocalForage();
          const found = [];
          for (const t of (threads||[])) {
            for (const m of (t.messages||[])) {
              if (m && m.sw_streamId) found.push({ threadId: t.id, threadTitle: t.title, messageId: m.id, sw_streamId: m.sw_streamId, snippet: (m.content||'').slice(0,200), updatedAt: m.updatedAt });
            }
          }
          const out = { type:'LIST_SW_SAVED_RESULT', ok:true, found };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(out); else broadcast(out);
        } catch (err) {
          const out = { type:'LIST_SW_SAVED_RESULT', ok:false, error: String(err && err.message ? err.message : err) };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(out); else broadcast(out);
        }
        return;
      }

      if (data && data.type === 'CLEAR_TESTS') {
        if (!lfAvailable) {
          const res = { type:'CLEAR_TESTS_RESULT', ok:false, error: 'localforage unavailable: ' + lfLoadError };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res); else broadcast(res);
          return;
        }
        try {
          const threads = await readThreadsViaLocalForage();
          const before = threads.length;
          const cleaned = threads.filter(t => !(t.id && String(t.id).startsWith('sw-test-')));
          await writeThreadsViaLocalForage(cleaned);
          const removed = before - cleaned.length;
          const out = { type:'CLEAR_TESTS_RESULT', ok:true, removed };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(out); else broadcast(out);
        } catch (err) {
          const out = { type:'CLEAR_TESTS_RESULT', ok:false, error: String(err && err.message ? err.message : err) };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(out); else broadcast(out);
        }
        return;
      }

    } catch (err) {
      const r = { type:'SW_ERROR', error: String(err && err.message ? err.message : err) };
      if (event.ports && event.ports[0]) event.ports[0].postMessage(r); else broadcast(r);
    }
  })();
});
