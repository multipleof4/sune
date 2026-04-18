# Security & Privacy

Sune is client-side. Your threads, sunes, settings, API keys, and GitHub PAT live in your browser's `localStorage` / `IndexedDB` — never on our servers. GitHub sync (if enabled) goes browser → your repo with your PAT. No accounts, no tracking.

## The Proxy

Streaming is relayed through [`us.proxy.sune.chat`](https://github.com/sune-org/us.proxy.sune.chat) so mobile generations survive screen locks. Your browser opens a WebSocket, the proxy forwards to the provider with the API key **you** supplied, and streams tokens back.

**What it doesn't do:** no prompt logging (messages sit in `:memory:` SQLite with a 20-min TTL for reconnects, never written to disk), no reading your chats, no storing keys, no third-party sharing.

**What I see:** an [ntfy](https://ntfy.sh) ping when a run ends/fails, containing only: run ID, `[provider/model]`, duration, and error message (if any). No prompts, no responses, no IP, no key. Source is public — audit it [here](https://github.com/sune-org/us.proxy.sune.chat).
