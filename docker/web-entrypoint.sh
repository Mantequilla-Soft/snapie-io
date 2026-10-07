#!/bin/sh
# The web service shares Mongo's network namespace (see docker-compose.yml),
# so the bridge is not on the path. Map the compose hostname at 127.0.0.1,
# where mongod is listening, then wait for an IPv4 handshake.
set -eu

if ! grep -q '[[:space:]]mongo$' /etc/hosts; then
  printf '127.0.0.1 mongo\n' >> /etc/hosts
fi

node <<'JS'
const net = require('net');

const host = 'mongo';
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
  console.error('[snapie] web container cannot reach mongo:27017 over IPv4');
  process.exit(1);
})();
JS

exec pnpm exec next dev -p 3310 -H 0.0.0.0
