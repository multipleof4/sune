importScripts("https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js");
const TARGET_SUBSTRING = "openrouter.ai/api/v1/chat/completions";
const THREADS_KEY = "threads_v1";
const SAVE_BYTES_THRESHOLD = 8 * 1024;
const SAVE_TIME_THRESHOLD = 1e3;
const BROADCAST_THROTTLE_MS = 700;
const gid = () => Math.random().toString(36).slice(2, 9) + "-" + Date.now().toString(36);
const now = () => Date.now();
async function readThreads() {
  try {
    const v = await localforage.getItem(THREADS_KEY);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    console.error("sw: readThreads error", e);
    return [];
  }
}
async function writeThreads(arr) {
  try {
    await localforage.setItem(THREADS_KEY, arr);
  } catch (e) {
    console.error("sw: writeThreads error", e);
    throw e;
  }
}
function pickLastThread(threads) {
  if (!threads || threads.length === 0) return null;
  let sorted = [...threads].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
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
async function broadcast(msg) {
  try {
    const cl = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    for (const c of cl) {
      try {
        c.postMessage(msg);
      } catch (e) {
      }
    }
  } catch (e) {
  }
}
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
const state = {
  totalIntercepted: 0,
  activeStreams: {},
  // streamId => meta
  lastStream: null
};
self.addEventListener("fetch", (event) => {
  try {
    const url = String(event.request.url || "");
    if (!url.includes(TARGET_SUBSTRING)) return;
    event.respondWith((async () => {
      const upstream = await fetch(event.request);
      if (!upstream || !upstream.body) return upstream;
      const streamId = "sw-" + gid();
      const meta = { url, startedAt: now(), bytes: 0, status: "started" };
      state.totalIntercepted = (state.totalIntercepted || 0) + 1;
      state.activeStreams[streamId] = meta;
      broadcast({ type: "sw-intercept-start", streamId, meta });
      const [clientStream, swStream] = upstream.body.tee();
      const savePromise = (async () => {
        const reader = swStream.getReader();
        const decoder = new TextDecoder("utf-8");
        let accumulated = "";
        let sinceLastSaveBytes = 0;
        let lastSaveAt = 0;
        let lastBroadcastAt = 0;
        async function flushToLastThread(force = false) {
          try {
            const nowMs = now();
            if (!force && sinceLastSaveBytes < SAVE_BYTES_THRESHOLD && nowMs - lastSaveAt < SAVE_TIME_THRESHOLD) return;
            const threads = await readThreads();
            let thread = pickLastThread(threads);
            const createdAt = nowMs;
            if (!thread) {
              thread = {
                id: "sw-thread-" + gid(),
                title: "Missed while backgrounded",
                pinned: false,
                updatedAt: createdAt,
                messages: []
              };
              threads.unshift(thread);
            }
            upsertAssistantInThreadObj(thread, streamId, accumulated);
            await writeThreads(threads);
            sinceLastSaveBytes = 0;
            lastSaveAt = nowMs;
            const now2 = Date.now();
            if (now2 - lastBroadcastAt > BROADCAST_THROTTLE_MS) {
              lastBroadcastAt = now2;
              broadcast({
                type: "sw-intercept-progress",
                streamId,
                meta: { bytes: meta.bytes, savedAt: lastSaveAt, snippet: accumulated.slice(-1024) }
              });
            }
          } catch (err) {
            console.error("sw: flushToLastThread error", err);
          }
        }
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            let chunkText = "";
            try {
              chunkText = decoder.decode(value, { stream: true });
            } catch (e) {
              try {
                chunkText = String(value);
              } catch (ee) {
                chunkText = "";
              }
            }
            accumulated += chunkText;
            const bytes = value ? value.byteLength || 0 : chunkText.length;
            meta.bytes += bytes;
            meta.lastProgressAt = now();
            sinceLastSaveBytes += bytes;
            await flushToLastThread(false);
          }
          await flushToLastThread(true);
          meta.status = "finished";
          meta.endedAt = now();
          state.lastStream = { streamId, url: meta.url, startedAt: meta.startedAt, endedAt: meta.endedAt, totalBytes: meta.bytes };
          delete state.activeStreams[streamId];
          broadcast({ type: "sw-intercept-end", streamId, meta: { totalBytes: meta.bytes, endedAt: meta.endedAt } });
        } catch (err) {
          meta.status = "error";
          meta.error = String(err && err.message ? err.message : err);
          delete state.activeStreams[streamId];
          broadcast({ type: "sw-intercept-error", streamId, meta: { error: meta.error } });
          console.error("sw: savePromise error", err);
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
    console.error("sw: fetch handler error", err);
  }
});
self.addEventListener("message", (event) => {
  const data = event.data || {};
  try {
    if (data && data.type === "PING") {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ type: "PONG", ts: now(), ok: true });
      } else if (event.source && typeof event.source.postMessage === "function") {
        try {
          event.source.postMessage({ type: "PONG", ts: now(), ok: true });
        } catch (e) {
        }
      } else {
        broadcast({ type: "PONG", ts: now(), ok: true });
      }
      return;
    }
    if (data && data.type === "PING_STATUS") {
      const reply = {
        type: "PONG_STATUS",
        ts: now(),
        totalIntercepted: state.totalIntercepted || 0,
        activeStreams: Object.entries(state.activeStreams).map(([id, m]) => ({ streamId: id, url: m.url, bytes: m.bytes, status: m.status, startedAt: m.startedAt })),
        lastStream: state.lastStream || null
      };
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage(reply);
      } else if (event.source && typeof event.source.postMessage === "function") {
        try {
          event.source.postMessage(reply);
        } catch (e) {
        }
      } else {
        broadcast(reply);
      }
      return;
    }
    if (data && data.type === "LIST_SW_SAVED") {
      (async () => {
        const threads = await readThreads();
        const found = [];
        for (const t of threads || []) {
          for (const m of t.messages || []) {
            if (m && m.sw_streamId) found.push({ threadId: t.id, threadTitle: t.title, messageId: m.id, sw_streamId: m.sw_streamId, snippet: (m.content || "").slice(0, 200), updatedAt: m.updatedAt });
          }
        }
        if (event.ports && event.ports[0]) event.ports[0].postMessage({ type: "LIST_SW_SAVED_RESULT", streams: found });
        else if (event.source && typeof event.source.postMessage === "function") event.source.postMessage({ type: "LIST_SW_SAVED_RESULT", streams: found });
        else broadcast({ type: "LIST_SW_SAVED_RESULT", streams: found });
      })();
      return;
    }
  } catch (e) {
    console.error("sw: message handler error", e);
  }
});
