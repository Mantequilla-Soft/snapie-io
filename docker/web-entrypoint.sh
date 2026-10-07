#!/bin/sh
# web shares the mongo service network namespace, so mongod is on 127.0.0.1.
# Docker's hosts entry for the name "mongo" is the bridge address, and mongoose
# times out on it. Rewrite MONGODB_URI before Next starts. No .env edit required.
set -eu

MONGODB_URI="$(node -e '
const fallback = "mongodb://127.0.0.1:27017/snapiechat?directConnection=true";
const raw = process.env.MONGODB_URI || "";
function rewrite(uri) {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "mongodb:") return fallback;
    parsed.hostname = "127.0.0.1";
    if (!parsed.port) parsed.port = "27017";
    parsed.searchParams.set("directConnection", "true");
    return parsed.toString();
  } catch {
    return fallback;
  }
}
process.stdout.write(rewrite(raw));
')"
export MONGODB_URI

node -e '
const parsed = new URL(process.env.MONGODB_URI);
if (parsed.username) parsed.username = "***";
if (parsed.password) parsed.password = "***";
console.log("[snapie] effective MONGODB_URI=" + parsed.toString());
'

node <<'JS'
const net = require('net');

const host = '127.0.0.1';
const port = 27017;

function once() {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port, family: 4 });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('timeout'));
    }, 2000);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

(async () => {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await once();
      console.log(`[snapie] mongo ${host}:${port} reachable over IPv4`);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[snapie] waiting for mongo (${attempt}/30): ${message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  console.error('[snapie] web container cannot reach 127.0.0.1:27017 over IPv4');
  process.exit(1);
})();
JS

exec pnpm exec next dev -p 3310 -H 0.0.0.0
