const TARGET_SUBSTRING = "openrouter.ai/api/v1/chat/completions";
const STATE_TTL_MS = 24 * 60 * 60 * 1e3;
const state = {
  totalIntercepted: 0,
  activeStreams: {},
  // streamId -> { url, startedAt, bytes, lastProgressAt, status }
  lastStreamSummary: null
  // summary of last finished stream
};
const gid = () => Math.random().toString(36).slice(2, 9) + "-" + Date.now().toString(36);
async function broadcast(msg) {
  try {
    const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    for (const c of clientsList) {
      try {
        c.postMessage(msg);
      } catch (e) {
      }
    }
  } catch (e) {
  }
}
function cleanupState() {
  const now = Date.now();
  for (const k of Object.keys(state.activeStreams)) {
    if (now - (state.activeStreams[k].lastProgressAt || state.activeStreams[k].startedAt) > STATE_TTL_MS) {
      delete state.activeStreams[k];
    }
  }
}
self.addEventListener("install", (e) => {
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  try {
    const url = String(event.request.url || "");
    if (!url.includes(TARGET_SUBSTRING)) return;
    event.respondWith((async () => {
      const upstream = await fetch(event.request);
      if (!upstream || !upstream.body) return upstream;
      const streamId = "sw-" + gid();
      const meta = { url, startedAt: Date.now(), bytes: 0, lastProgressAt: Date.now(), status: "started" };
      state.totalIntercepted = (state.totalIntercepted || 0) + 1;
      state.activeStreams[streamId] = meta;
      broadcast({ type: "sw-intercept-start", streamId, meta });
      const [clientStream, swStream] = upstream.body.tee();
      const savePromise = (async () => {
        try {
          const reader = swStream.getReader();
          const decoder = new TextDecoder("utf-8");
          let decodedSoFar = "";
          let chunkCount = 0;
          let lastBroadcastMs = 0;
          const BROADCAST_THROTTLE_MS = 800;
          const BROADCAST_BYTES = 16 * 1024;
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunkCount++;
            const bytes = value ? value.byteLength || 0 : 0;
            meta.bytes += bytes;
            meta.lastProgressAt = Date.now();
            try {
              decodedSoFar += decoder.decode(value, { stream: true });
            } catch (e) {
            }
            const now = Date.now();
            if (now - lastBroadcastMs > BROADCAST_THROTTLE_MS || meta.bytes >= (meta._lastBroadcastBytes || 0) + BROADCAST_BYTES) {
              meta._lastBroadcastBytes = meta.bytes;
              lastBroadcastMs = now;
              broadcast({
                type: "sw-intercept-progress",
                streamId,
                meta: { bytes: meta.bytes, lastProgressAt: meta.lastProgressAt, snippet: decodedSoFar.slice(-1024) }
              });
            }
          }
          meta.status = "finished";
          meta.endedAt = Date.now();
          state.lastStreamSummary = {
            streamId,
            url,
            startedAt: meta.startedAt,
            endedAt: meta.endedAt,
            totalBytes: meta.bytes
          };
          delete state.activeStreams[streamId];
          broadcast({ type: "sw-intercept-end", streamId, meta: { totalBytes: meta.bytes, endedAt: meta.endedAt } });
        } catch (err) {
          meta.status = "error";
          meta.error = String(err && err.message ? err.message : err);
          meta.lastProgressAt = Date.now();
          delete state.activeStreams[streamId];
          broadcast({ type: "sw-intercept-error", streamId, meta: { error: meta.error } });
          console.error("sw: stream save error", err);
        }
      })();
      event.waitUntil(savePromise);
      return new Response(clientStream, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers
      });
    })());
  } catch (e) {
    console.error("sw: fetch handler error", e);
  } finally {
    cleanupState();
  }
});
self.addEventListener("message", (event) => {
  const data = event.data || {};
  try {
    if (data && data.type === "PING") {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ type: "PONG", ts: Date.now(), ok: true });
      } else if (event.source && typeof event.source.postMessage === "function") {
        try {
          event.source.postMessage({ type: "PONG", ts: Date.now(), ok: true });
        } catch (e) {
        }
      } else {
        broadcast({ type: "PONG", ts: Date.now(), ok: true });
      }
      return;
    }
    if (data && data.type === "PING_STATUS") {
      const reply = {
        type: "PONG_STATUS",
        ts: Date.now(),
        totalIntercepted: state.totalIntercepted || 0,
        activeStreams: Object.entries(state.activeStreams).map(([id, m]) => ({ streamId: id, url: m.url, bytes: m.bytes, status: m.status, startedAt: m.startedAt })),
        lastStreamSummary: state.lastStreamSummary || null
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
    if (data && data.type === "GET_STATE") {
      const snapshot = { totalIntercepted: state.totalIntercepted || 0, activeCount: Object.keys(state.activeStreams).length, last: state.lastStreamSummary || null };
      if (event.ports && event.ports[0]) event.ports[0].postMessage({ type: "STATE", snapshot });
      else if (event.source && event.source.postMessage) event.source.postMessage({ type: "STATE", snapshot });
      return;
    }
  } catch (e) {
    console.error("sw: message handler error", e);
  }
});
