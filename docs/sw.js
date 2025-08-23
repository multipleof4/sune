const TARGET_SUBSTRING = "openrouter.ai/api/v1/chat/completions";
const THREADS_KEY = "threads_v1";
const SAVE_BYTES_THRESHOLD = 6 * 1024;
const SAVE_TIME_THRESHOLD = 800;
const BROADCAST_THROTTLE_MS = 600;
const DB_NAME = "localforage";
const STORE_NAME = "keyvaluepairs";
const gid = () => Math.random().toString(36).slice(2, 9) + "-" + Date.now().toString(36);
const now = () => Date.now();
function openLFDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error || new Error("open error"));
  });
}
async function idbGetRaw(key) {
  const db = await openLFDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  return await new Promise((res, rej) => {
    const r = store.get(key);
    r.onsuccess = (ev) => res(ev.target.result);
    r.onerror = (ev) => rej(ev.target.error || new Error("get error"));
  });
}
async function idbPutRaw(key, value) {
  const db = await openLFDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  return await new Promise((res, rej) => {
    const r = store.put({ key, value });
    r.onsuccess = () => res(true);
    r.onerror = (ev) => rej(ev.target.error || new Error("put error"));
  });
}
async function idbGetThreads() {
  const rec = await idbGetRaw(THREADS_KEY).catch((err) => {
    throw err;
  });
  if (!rec) return [];
  return Array.isArray(rec.value) ? rec.value : [];
}
async function idbWriteThreads(arr) {
  await idbPutRaw(THREADS_KEY, arr);
}
function pickLastThread(threads) {
  if (!threads || threads.length === 0) return null;
  const sorted = [...threads].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return sorted[0];
}
function upsertAssistantInThreadObj(threadObj, streamId, text) {
  threadObj.updatedAt = now();
  for (let i = threadObj.messages.length - 1; i >= 0; i--) {
    const m = threadObj.messages[i];
    if (m && m.sw_streamId === streamId) {
      m.content = text;
      m.contentParts = [{ type: "text", text }];
      m.updatedAt = now();
      m._sw_savedAt = now();
      return threadObj;
    }
  }
  const msg = {
    id: "swmsg-" + gid(),
    role: "assistant",
    content: text,
    contentParts: [{ type: "text", text }],
    kind: "assistant",
    sw_saved: true,
    sw_streamId: streamId,
    createdAt: now(),
    updatedAt: now(),
    _sw_savedAt: now()
  };
  threadObj.messages.push(msg);
  return threadObj;
}
async function safeFlushLastThread(streamId, accumulated, meta = {}) {
  const threads = await idbGetThreads();
  let thread = pickLastThread(threads);
  const ts = now();
  if (!thread) {
    thread = { id: "sw-thread-" + gid(), title: "Missed while backgrounded", pinned: false, updatedAt: ts, messages: [] };
    threads.unshift(thread);
  }
  upsertAssistantInThreadObj(thread, streamId, accumulated);
  await idbWriteThreads(threads);
  return { ok: true, threadId: thread.id };
}
async function broadcast(msg) {
  try {
    const cl = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    for (const c of cl) {
      try {
        c.postMessage(msg);
      } catch (_) {
      }
    }
  } catch (_) {
  }
}
self.addEventListener("install", (ev) => self.skipWaiting());
self.addEventListener("activate", (ev) => ev.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  try {
    const url = String(event.request.url || "");
    if (!url.includes(TARGET_SUBSTRING)) return;
    event.respondWith((async () => {
      const upstream = await fetch(event.request);
      if (!upstream || !upstream.body) return upstream;
      const streamId = "sw-" + gid();
      const meta = { url, startedAt: now(), bytes: 0, status: "started" };
      broadcast({ type: "sw-intercept-start", streamId, meta });
      const [clientStream, swStream] = upstream.body.tee();
      const savePromise = (async () => {
        const reader = swStream.getReader();
        const decoder = new TextDecoder("utf-8");
        let accumulated = "";
        let sinceSaveBytes = 0;
        let lastSaveAt = 0;
        let lastBroadcastAt = 0;
        async function maybeFlush(force = false) {
          try {
            const nowMs = now();
            if (!force && sinceSaveBytes < SAVE_BYTES_THRESHOLD && nowMs - lastSaveAt < SAVE_TIME_THRESHOLD) return;
            await safeFlushLastThread(streamId, accumulated, { bytes: meta.bytes });
            sinceSaveBytes = 0;
            lastSaveAt = nowMs;
            if (nowMs - lastBroadcastAt > BROADCAST_THROTTLE_MS) {
              lastBroadcastAt = nowMs;
              broadcast({ type: "sw-intercept-progress", streamId, meta: { bytes: meta.bytes, savedAt: lastSaveAt, snippet: accumulated.slice(-1024) } });
            }
          } catch (err) {
            broadcast({ type: "sw-intercept-error", streamId, meta: { error: String(err && err.message ? err.message : err) } });
          }
        }
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            let chunk = "";
            try {
              chunk = decoder.decode(value, { stream: true });
            } catch (e) {
              chunk = "";
            }
            accumulated += chunk;
            const bytes = value ? value.byteLength || 0 : chunk.length;
            meta.bytes += bytes;
            sinceSaveBytes += bytes;
            await maybeFlush(false);
          }
          await maybeFlush(true);
          meta.status = "finished";
          meta.endedAt = now();
          broadcast({ type: "sw-intercept-end", streamId, meta: { totalBytes: meta.bytes, endedAt: meta.endedAt } });
        } catch (err) {
          meta.status = "error";
          meta.error = String(err && err.message ? err.message : err);
          broadcast({ type: "sw-intercept-error", streamId, meta: { error: meta.error } });
        }
      })();
      event.waitUntil(savePromise);
      return new Response(clientStream, { status: upstream.status, statusText: upstream.statusText, headers: upstream.headers });
    })());
  } catch (err) {
    broadcast({ type: "sw-debug", text: "fetch handler error: " + String(err && err.message ? err.message : err) });
  }
});
self.addEventListener("message", (event) => {
  const data = event.data || {};
  (async () => {
    try {
      if (data.type === "PING") {
        if (event.ports && event.ports[0]) event.ports[0].postMessage({ type: "PONG", ts: now(), ok: true });
        else broadcast({ type: "PONG", ts: now(), ok: true });
        return;
      }
      if (data.type === "PING_STATUS") {
        const reply = { type: "PONG_STATUS", ts: now() };
        if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
        else broadcast(reply);
        return;
      }
      if (data.type === "TEST_WRITE") {
        try {
          const threads = await idbGetThreads();
          const tid = "sw-test-" + gid();
          const nowMs = now();
          const testThread = { id: tid, title: "SW test " + new Date(nowMs).toISOString(), pinned: false, updatedAt: nowMs, messages: [{ id: "swtest-" + gid(), role: "assistant", content: "sw test write @" + new Date(nowMs).toISOString(), contentParts: [{ type: "text", text: "sw test write" }], createdAt: nowMs, updatedAt: nowMs }] };
          threads.unshift(testThread);
          await idbWriteThreads(threads);
          const res = { type: "TEST_WRITE_RESULT", ok: true, tid };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res);
          else broadcast(res);
        } catch (err) {
          const res = { type: "TEST_WRITE_RESULT", ok: false, error: String(err && err.message ? err.message : err) };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res);
          else broadcast(res);
        }
        return;
      }
      if (data.type === "READ_KEY") {
        const key = data.key || THREADS_KEY;
        try {
          const rec = await idbGetRaw(key);
          const val = rec ? rec.value : null;
          const res = { type: "READ_KEY_RESULT", ok: true, key, value: val };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res);
          else broadcast(res);
        } catch (err) {
          const res = { type: "READ_KEY_RESULT", ok: false, key, error: String(err && err.message ? err.message : err) };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res);
          else broadcast(res);
        }
        return;
      }
      if (data.type === "LIST_SW_SAVED") {
        try {
          const threads = await idbGetThreads();
          const found = [];
          for (const t of threads || []) {
            for (const m of t.messages || []) {
              if (m && m.sw_streamId) found.push({ threadId: t.id, messageId: m.id, sw_streamId: m.sw_streamId, snippet: (m.content || "").slice(0, 200) });
            }
          }
          const res = { type: "LIST_SW_SAVED_RESULT", ok: true, found };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res);
          else broadcast(res);
        } catch (err) {
          const res = { type: "LIST_SW_SAVED_RESULT", ok: false, error: String(err && err.message ? err.message : err) };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res);
          else broadcast(res);
        }
        return;
      }
    } catch (err) {
      const r = { type: "SW_ERROR", error: String(err && err.message ? err.message : err) };
      if (event.ports && event.ports[0]) event.ports[0].postMessage(r);
      else broadcast(r);
    }
  })();
});
