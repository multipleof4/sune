try {
  importScripts("https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js");
} catch (e) {
}
const TARGET_SUBSTRING = "openrouter.ai/api/v1/chat/completions";
const THREADS_KEY = "threads_v1";
const gid = () => Math.random().toString(36).slice(2, 9) + "-" + Date.now().toString(36);
const now = () => Date.now();
let lfAvailable = typeof localforage !== "undefined";
let lfLoadError = lfAvailable ? null : "localforage not present in SW";
async function broadcast(msg) {
  try {
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    for (const c of clients) {
      try {
        c.postMessage(msg);
      } catch (e) {
      }
    }
  } catch (e) {
  }
}
async function readThreads() {
  if (!lfAvailable) throw new Error("localforage unavailable: " + lfLoadError);
  const v = await localforage.getItem(THREADS_KEY);
  return Array.isArray(v) ? v : v ? v : [];
}
async function writeThreads(threads) {
  if (!lfAvailable) throw new Error("localforage unavailable: " + lfLoadError);
  return localforage.setItem(THREADS_KEY, threads);
}
function pickLastThread(threads) {
  if (!Array.isArray(threads) || threads.length === 0) return null;
  return threads.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
}
function upsertAssistantInThread(thread, text) {
  thread.updatedAt = now();
  thread.messages = thread.messages || [];
  const last = thread.messages.length ? thread.messages[thread.messages.length - 1] : null;
  if (last && last.role === "assistant") {
    last.content = text;
    last.contentParts = [{ type: "text", text }];
    last.updatedAt = now();
    return { threadId: thread.id, messageId: last.id || null, action: "updated" };
  } else {
    const msg = {
      // intentionally do not add extra custom ids/flags beyond minimal fields
      role: "assistant",
      content: text,
      contentParts: [{ type: "text", text }]
    };
    thread.messages.push(msg);
    return { threadId: thread.id, messageId: msg.id || null, action: "appended" };
  }
}
self.addEventListener("install", (ev) => self.skipWaiting());
self.addEventListener("activate", (ev) => ev.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  try {
    const url = String(event.request.url || "");
    if (!url.includes(TARGET_SUBSTRING)) return;
    event.respondWith((async () => {
      const resUp = await fetch(event.request);
      if (!resUp || !resUp.body) return resUp;
      const meta = { url, startedAt: now(), bytes: 0 };
      broadcast({ type: "INTERCEPT_START", meta });
      const [clientStream, swStream] = resUp.body.tee();
      const saveTask = (async () => {
        const reader = swStream.getReader();
        const decoder = new TextDecoder("utf-8");
        let acc = "";
        let lastSavedText = null;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            acc += chunk;
            meta.bytes += value ? value.byteLength || 0 : chunk.length;
            if (lastSavedText !== acc) {
              const p = (async () => {
                try {
                  const threads = await readThreads();
                  let thread = pickLastThread(threads);
                  if (!thread) {
                    thread = { id: "sw-thread-" + gid(), title: "Missed while backgrounded", pinned: false, updatedAt: now(), messages: [] };
                    threads.unshift(thread);
                  }
                  const res = upsertAssistantInThread(thread, acc);
                  await writeThreads(threads);
                  lastSavedText = acc;
                  broadcast({ type: "INTERCEPT_SAVE", meta: { threadId: res.threadId, action: res.action, bytes: meta.bytes, textLen: acc.length } });
                } catch (err) {
                  broadcast({ type: "INTERCEPT_ERROR", meta: { error: String(err && err.message ? err.message : err) } });
                }
              })();
              try {
                event.waitUntil(p);
              } catch (e) {
              }
            }
          }
          if (lastSavedText !== acc) {
            try {
              const threads = await readThreads();
              let thread = pickLastThread(threads);
              if (!thread) {
                thread = { id: "sw-thread-" + gid(), title: "Missed while backgrounded", pinned: false, updatedAt: now(), messages: [] };
                threads.unshift(thread);
              }
              const res = upsertAssistantInThread(thread, acc);
              await writeThreads(threads);
              broadcast({ type: "INTERCEPT_SAVE", meta: { threadId: res.threadId, action: res.action, bytes: meta.bytes, textLen: acc.length } });
            } catch (err) {
              broadcast({ type: "INTERCEPT_ERROR", meta: { error: String(err && err.message ? err.message : err) } });
            }
          }
          broadcast({ type: "INTERCEPT_END", meta: { bytes: meta.bytes, endedAt: now() } });
        } catch (err) {
          broadcast({ type: "INTERCEPT_ERROR", meta: { error: String(err && err.message ? err.message : err) } });
        }
      })();
      try {
        event.waitUntil(saveTask);
      } catch (e) {
      }
      return new Response(clientStream, {
        status: resUp.status,
        statusText: resUp.statusText,
        headers: resUp.headers
      });
    })());
  } catch (err) {
    broadcast({ type: "INTERCEPT_ERROR", meta: { error: String(err && err.message ? err.message : err) } });
  }
});
self.addEventListener("message", (event) => {
  const data = event.data || {};
  (async () => {
    try {
      if (data.type === "PING") {
        if (event.ports && event.ports[0]) event.ports[0].postMessage({ type: "PONG", ts: now() });
        else broadcast({ type: "PONG", ts: now() });
        return;
      }
      if (data.type === "PING_STATUS") {
        const reply = { type: "PONG_STATUS", ts: now(), lfAvailable, lfLoadError };
        if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
        else broadcast(reply);
        return;
      }
      if (data.type === "TEST_WRITE") {
        if (!lfAvailable) {
          const out = { type: "TEST_WRITE_RESULT", ok: false, error: "localforage unavailable: " + lfLoadError };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(out);
          else broadcast(out);
          return;
        }
        try {
          const threads = await readThreads();
          const tid = "sw-test-" + gid();
          const nowMs = now();
          const t = { id: tid, title: "SW test " + new Date(nowMs).toISOString(), pinned: false, updatedAt: nowMs, messages: [{ role: "assistant", content: "sw test write @ " + new Date(nowMs).toISOString(), contentParts: [{ type: "text", text: "sw test write" }] }] };
          threads.unshift(t);
          await writeThreads(threads);
          const out = { type: "TEST_WRITE_RESULT", ok: true, tid };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(out);
          else broadcast(out);
        } catch (err) {
          const out = { type: "TEST_WRITE_RESULT", ok: false, error: String(err && err.message ? err.message : err) };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(out);
          else broadcast(out);
        }
        return;
      }
      if (data.type === "READ_KEY") {
        const key = data.key || THREADS_KEY;
        if (!lfAvailable) {
          const res = { type: "READ_KEY_RESULT", ok: false, key, error: "localforage unavailable: " + lfLoadError };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res);
          else broadcast(res);
          return;
        }
        try {
          const value = await localforage.getItem(key);
          const out = { type: "READ_KEY_RESULT", ok: true, key, value };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(out);
          else broadcast(out);
        } catch (err) {
          const out = { type: "READ_KEY_RESULT", ok: false, key, error: String(err && err.message ? err.message : err) };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(out);
          else broadcast(out);
        }
        return;
      }
      if (data.type === "LIST_SW_SAVED") {
        if (!lfAvailable) {
          const res = { type: "LIST_SW_SAVED_RESULT", ok: false, error: "localforage unavailable: " + lfLoadError };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res);
          else broadcast(res);
          return;
        }
        try {
          const threads = await readThreads();
          const found = [];
          for (const t of threads || []) {
            for (const m of t.messages || []) {
              if (m && m.role === "assistant") {
                found.push({ threadId: t.id, snippet: (m.content || "").slice(0, 200) });
              }
            }
          }
          const out = { type: "LIST_SW_SAVED_RESULT", ok: true, found };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(out);
          else broadcast(out);
        } catch (err) {
          const out = { type: "LIST_SW_SAVED_RESULT", ok: false, error: String(err && err.message ? err.message : err) };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(out);
          else broadcast(out);
        }
        return;
      }
      if (data.type === "CLEAR_TESTS") {
        if (!lfAvailable) {
          const res = { type: "CLEAR_TESTS_RESULT", ok: false, error: "localforage unavailable: " + lfLoadError };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(res);
          else broadcast(res);
          return;
        }
        try {
          const threads = await readThreads();
          const before = threads.length;
          const cleaned = threads.filter((t) => !(t.id && String(t.id).startsWith("sw-test-")));
          await writeThreads(cleaned);
          const removed = before - cleaned.length;
          const out = { type: "CLEAR_TESTS_RESULT", ok: true, removed };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(out);
          else broadcast(out);
        } catch (err) {
          const out = { type: "CLEAR_TESTS_RESULT", ok: false, error: String(err && err.message ? err.message : err) };
          if (event.ports && event.ports[0]) event.ports[0].postMessage(out);
          else broadcast(out);
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
