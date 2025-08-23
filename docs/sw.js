importScripts("https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js");
const THREADS_KEY = "threads_v1";
const TARGET_SUBSTRING = "openrouter.ai/api/v1/chat/completions";
const LOG = (...a) => {
  console.log("[sw-debug]", ...a);
};
const gid = () => Math.random().toString(36).slice(2, 9) + "-" + Date.now().toString(36);
async function readThreads() {
  try {
    const v = await localforage.getItem(THREADS_KEY);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    LOG("readThreads err", e);
    return [];
  }
}
async function writeThreads(arr) {
  try {
    await localforage.setItem(THREADS_KEY, arr);
  } catch (e) {
    LOG("writeThreads err", e);
    throw e;
  }
}
function pickThread(threads) {
  if (!threads || !threads.length) return null;
  threads.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return threads[0];
}
async function upsertStreamMessage(streamId, text, meta = {}) {
  const threads = await readThreads();
  let th = pickThread(threads);
  const now = Date.now();
  if (!th) {
    th = { id: "sw-" + gid(), title: "Missed while backgrounded", pinned: false, updatedAt: now, messages: [] };
    threads.unshift(th);
  }
  let msgIndex = -1;
  for (let i = th.messages.length - 1; i >= 0; i--) {
    if (th.messages[i] && th.messages[i].sw_streamId === streamId) {
      msgIndex = i;
      break;
    }
  }
  const contentParts = [{ type: "text", text }];
  if (msgIndex >= 0) {
    const ex = th.messages[msgIndex];
    ex.content = text;
    ex.contentParts = contentParts;
    ex.updatedAt = now;
    ex._sw_lastSave = now;
    ex._sw_meta = Object.assign({}, ex._sw_meta || {}, meta);
  } else {
    th.messages.push({
      id: "swmsg-" + gid(),
      role: "assistant",
      content: text,
      contentParts,
      kind: "assistant",
      sw_saved: true,
      sw_streamId: streamId,
      createdAt: now,
      updatedAt: now,
      _sw_meta: meta
    });
  }
  th.updatedAt = now;
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
      m._sw_meta = Object.assign({}, m._sw_meta || {}, meta, { completeAt: Date.now() });
      m.updatedAt = Date.now();
      th.updatedAt = Date.now();
      break;
    }
  }
  await writeThreads(threads);
  const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const c of clientsList) {
    try {
      c.postMessage({ type: "stream-saved", streamId, meta });
    } catch (e) {
    }
  }
}
async function listSwStreams() {
  const threads = await readThreads();
  const found = [];
  for (const t of threads || []) {
    for (const m of t.messages || []) {
      if (m && m.sw_streamId) found.push({
        threadId: t.id,
        threadTitle: t.title,
        messageId: m.id,
        sw_streamId: m.sw_streamId,
        snippet: (m.content || "").slice(0, 200),
        updatedAt: m.updatedAt
      });
    }
  }
  return found;
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
    LOG("notifyClients err", e);
  }
}
self.addEventListener("install", (e) => {
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  const reqUrl = event.request.url || "";
  if (new URL(reqUrl).pathname === "/__sw_tee_test") {
    event.respondWith((async () => {
      const probeId = new URL(reqUrl).searchParams.get("probeId") || gid();
      LOG("Received tee-test probe", probeId);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(ctrl) {
          let count = 0;
          const id = setInterval(() => {
            count++;
            const chunk = `probe(${probeId}) chunk ${count}
`;
            ctrl.enqueue(encoder.encode(chunk));
            if (count >= 6) {
              clearInterval(id);
              ctrl.close();
            }
          }, 300);
        }
      });
      const [clientBranch, swBranch] = stream.tee();
      (async () => {
        try {
          const reader = swBranch.getReader();
          const dec = new TextDecoder("utf-8");
          let collected = "";
          let bytes = 0;
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunkText = dec.decode(value, { stream: true });
            collected += chunkText;
            bytes += value && value.byteLength ? value.byteLength : chunkText.length;
            await upsertStreamMessage("probe-" + probeId, collected, { probeId, bytesSoFar: bytes });
            await notifyClients({ type: "tee-probe-chunk", probeId, bytes, snippet: chunkText.slice(0, 200) });
          }
          await finalizeStream("probe-" + probeId, { totalBytes: bytes, probeId });
          LOG("tee-probe: save complete", probeId, "bytes", bytes);
          await notifyClients({ type: "tee-probe-complete", probeId, totalBytes: bytes });
        } catch (err) {
          LOG("tee-probe save error", err);
          await notifyClients({ type: "tee-probe-error", probeId, error: String(err) });
        }
      })();
      return new Response(clientBranch, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    })());
    return;
  }
  if (reqUrl.includes(TARGET_SUBSTRING)) {
    event.respondWith(fetch(event.request));
    return;
  }
});
self.addEventListener("message", (event) => {
  const data = event.data || {};
  try {
    if (data && data.type === "PING") {
      (async () => {
        const streams = await listSwStreams();
        const info = {
          type: "PONG",
          ts: Date.now(),
          ok: true,
          canTeeProbe: true,
          savedStreamCount: streams.length,
          lastSaved: streams[0] || null
        };
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage(info);
        } else if (event.source && typeof event.source.postMessage === "function") {
          event.source.postMessage(info);
        } else {
          await notifyClients(info);
        }
      })();
      return;
    }
    if (data && data.type === "list-sw-streams") {
      (async () => {
        const streams = await listSwStreams();
        const payload = { type: "sw-streams-list", streams };
        if (event.ports && event.ports[0]) event.ports[0].postMessage(payload);
        else if (event.source && typeof event.source.postMessage === "function") event.source.postMessage(payload);
        else await notifyClients(payload);
      })();
      return;
    }
    if (data && data.type === "run-tee-probe" && data.probeId) {
      (async () => {
        try {
          const probeUrl = "/__sw_tee_test?probeId=" + encodeURIComponent(data.probeId);
          if (event.ports && event.ports[0]) event.ports[0].postMessage({ type: "run-tee-probe-ok", probeId: data.probeId, probeUrl });
          else if (event.source && typeof event.source.postMessage === "function") event.source.postMessage({ type: "run-tee-probe-ok", probeId: data.probeId, probeUrl });
        } catch (e) {
          if (event.ports && event.ports[0]) event.ports[0].postMessage({ type: "run-tee-probe-error", error: String(e) });
        }
      })();
      return;
    }
  } catch (err) {
    LOG("message handler error", err);
  }
});
