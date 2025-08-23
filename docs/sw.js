importScripts("https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js");
const TARGET_SUBSTRING = "openrouter.ai/api/v1/chat/completions";
const THREADS_KEY = "threads_v1";
const BUFFER_SAVE_BYTES = 32 * 1024;
const SAVE_INTERVAL_MS = 2e3;
const gid = () => Math.random().toString(36).slice(2, 9) + "-" + Date.now().toString(36);
function now() {
  return Date.now();
}
async function readThreads() {
  try {
    const v = await localforage.getItem(THREADS_KEY);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    console.error("sw: idb read error", e);
    return [];
  }
}
async function writeThreads(arr) {
  try {
    await localforage.setItem(THREADS_KEY, arr);
  } catch (e) {
    console.error("sw: idb write error", e);
    throw e;
  }
}
function pickThread(threads) {
  if (!threads || threads.length === 0) return null;
  threads.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return threads[0];
}
async function upsertStreamMessage(streamId, text, meta = {}) {
  const threads = await readThreads();
  let th = pickThread(threads);
  const createdNow = now();
  if (!th) {
    th = {
      id: "sw-" + gid(),
      title: "Missed while backgrounded",
      pinned: false,
      updatedAt: createdNow,
      messages: []
    };
    threads.unshift(th);
  }
  let msgIndex = -1;
  for (let i = th.messages.length - 1; i >= 0; i--) {
    const m = th.messages[i];
    if (m && m.sw_streamId === streamId) {
      msgIndex = i;
      break;
    }
  }
  const contentParts = [{ type: "text", text }];
  if (msgIndex >= 0) {
    const existing = th.messages[msgIndex];
    existing.content = text;
    existing.contentParts = contentParts;
    existing.updatedAt = createdNow;
    existing._sw_lastSave = createdNow;
    existing._sw_meta = Object.assign({}, existing._sw_meta || {}, meta);
  } else {
    const msg = {
      id: "swmsg-" + gid(),
      role: "assistant",
      content: text,
      contentParts,
      kind: "assistant",
      sw_saved: true,
      sw_streamId: streamId,
      createdAt: createdNow,
      updatedAt: createdNow,
      _sw_meta: Object.assign({}, meta)
    };
    th.messages.push(msg);
  }
  th.updatedAt = createdNow;
  await writeThreads(threads);
  return { threadId: th.id };
}
async function finalizeStream(streamId, meta = {}) {
  const threads = await readThreads();
  const th = pickThread(threads);
  if (!th) return;
  for (let i = th.messages.length - 1; i >= 0; i--) {
    const m = th.messages[i];
    if (m && m.sw_streamId === streamId) {
      m._sw_meta = Object.assign({}, m._sw_meta || {}, meta, { completeAt: now() });
      m.updatedAt = now();
      th.updatedAt = now();
      break;
    }
  }
  await writeThreads(threads);
  const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  clientsList.forEach((c) => {
    try {
      c.postMessage({ type: "stream-saved", streamId, meta });
    } catch (e) {
    }
  });
}
async function notifyClients(msg) {
  try {
    const list = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    for (const c of list) {
      try {
        c.postMessage(msg);
      } catch (e) {
      }
    }
  } catch (e) {
  }
}
self.addEventListener("fetch", (event) => {
  try {
    const url = event.request.url || "";
    if (!url.includes(TARGET_SUBSTRING)) {
      return;
    }
    event.respondWith((async () => {
      const upstream = await fetch(event.request);
      if (!upstream || !upstream.body) return upstream;
      const streamId = "swstream-" + gid();
      const headers = new Headers(upstream.headers);
      const [clientStream, swStream] = upstream.body.tee();
      const savePromise = (async () => {
        try {
          const reader = swStream.getReader();
          const dec = new TextDecoder("utf-8");
          let bufferText = "";
          let bufferedBytes = 0;
          let lastSaveAt = 0;
          const saveIfNeeded = async (force = false) => {
            const nowMs = Date.now();
            if (!force && bufferedBytes < BUFFER_SAVE_BYTES && nowMs - lastSaveAt < SAVE_INTERVAL_MS) return;
            try {
              await upsertStreamMessage(streamId, bufferText, { partialBytes: bufferedBytes, savedAt: Date.now() });
              lastSaveAt = nowMs;
            } catch (e) {
              console.error("sw: upsert save error", e);
            }
          };
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunkText = dec.decode(value, { stream: true });
            bufferText += chunkText;
            bufferedBytes += value && value.byteLength ? value.byteLength : chunkText.length;
            await saveIfNeeded(false);
          }
          await saveIfNeeded(true);
          await finalizeStream(streamId, { totalBytes: bufferedBytes });
        } catch (err) {
          console.error("sw: error saving stream", err);
          try {
            await finalizeStream(streamId, { error: String(err) });
          } catch (e) {
          }
        }
      })();
      event.waitUntil(savePromise);
      return new Response(clientStream, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers
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
        try {
          event.ports[0].postMessage({ type: "PONG", ts: Date.now(), ok: true });
        } catch (e) {
        }
      } else {
        if (event.source && typeof event.source.postMessage === "function") {
          try {
            event.source.postMessage({ type: "PONG", ts: Date.now(), ok: true });
          } catch (e) {
          }
        } else {
          notifyClients({ type: "PONG", ts: Date.now(), ok: true });
        }
      }
      return;
    }
    if (data && data.type === "list-sw-streams") {
      (async () => {
        const threads = await readThreads();
        const found = [];
        for (const t of threads || []) {
          for (const m of t.messages || []) {
            if (m && m.sw_streamId) found.push({ threadId: t.id, threadTitle: t.title, messageId: m.id, sw_streamId: m.sw_streamId, summary: (m.content || "").slice(0, 200), updatedAt: m.updatedAt });
          }
        }
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ type: "sw-streams-list", streams: found });
        } else if (event.source && typeof event.source.postMessage === "function") {
          event.source.postMessage({ type: "sw-streams-list", streams: found });
        } else {
          notifyClients({ type: "sw-streams-list", streams: found });
        }
      })();
      return;
    }
  } catch (e) {
    console.error("sw: message handler error", e);
  }
});
self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      await self.clients.claim();
    } catch (e) {
    }
  })());
});
