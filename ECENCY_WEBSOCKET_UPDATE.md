# WebSocket Still Failing - Token IS Being Sent

## Update

Following the docs, I'm now correctly:
1. Getting the `token` from bootstrap response ✅
2. Passing it via `?token=<mm_pat>` query parameter ✅

**But WebSocket still fails with 1006.**

---

## Console Proof

```
🔑 Bootstrap response: {ok: true, userId: '...', token: '84r8i9fabidjuphyg6oyf7z3xa'}
🔌 Token status: present (84r8i9fabidjuphyg6oy...)
🔌 Connecting to: wss://ecency.com/api/mattermost/websocket?token=84r8i9fabidjuphyg6oyf7z3xa

WebSocket connection FAILED:
   Code: 1006 - Abnormal closure (connection rejected before handshake)
   Reason: (none)
   Was clean: false
```

---

## My Code (exactly per docs)

```typescript
// Bootstrap returns token
const data = await bootstrapResponse.json();
// data.token = "84r8i9fabidjuphyg6oyf7z3xa" ✅

// Connect with token per docs
const wsUrl = `wss://ecency.com/api/mattermost/websocket?token=${data.token}`;
const socket = new WebSocket(wsUrl);
// Fails immediately with 1006 ❌
```

---

## Questions

1. Is the WebSocket endpoint actually parsing the `?token=` query param?
2. Is there an origin whitelist blocking `localhost:3000` / `beta.snapie.io`?
3. Can you check server logs for my connection attempts?

The token I'm using: `84r8i9fabidjuphyg6oyf7z3xa` (from bootstrap just now)

---

@meno on Hive | beta.snapie.io
