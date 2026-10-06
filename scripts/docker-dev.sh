#!/usr/bin/env bash
# Dev entrypoint for docker-compose.yml. Node 22 image + pnpm 9.15.9, same
# major versions as CI. Official node and mongo images publish linux/arm64
# and linux/amd64; Compose picks the host arch (Apple Silicon included).
set -euo pipefail

cd /workspace

export COREPACK_HOME="${COREPACK_HOME:-/pnpm/corepack}"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export npm_config_store_dir="${npm_config_store_dir:-/pnpm/store}"
mkdir -p "$COREPACK_HOME" "$npm_config_store_dir"

if ! { corepack enable && corepack prepare pnpm@9.15.9 --activate; }; then
  echo "corepack prepare failed; installing pnpm@9.15.9 with npm" >&2
  npm install -g pnpm@9.15.9
fi

if [ ! -f .env.local ]; then
  cp .env.local.example .env.local
  if owner="$(stat -c '%u:%g' . 2>/dev/null)"; then
    chown "$owner" .env.local || true
  fi
fi

# CHAT_JWT_SECRET must be non-empty even for `next build`. lib/chat/auth.ts
# throws at import, which Next hits while collecting page data. Prefer a
# value already in the environment, then an uncommented line in .env.local.
if [ -z "${CHAT_JWT_SECRET:-}" ]; then
  secret="$(grep -E '^[[:space:]]*CHAT_JWT_SECRET=.+' .env.local | head -n 1 | cut -d= -f2- || true)"
  if [ -z "$secret" ]; then
    echo "CHAT_JWT_SECRET must be non-empty (even for next build). See .env.local.example." >&2
    exit 1
  fi
fi

# Feed-only runs leave MONGODB_URI unset. With `docker compose --profile chat`,
# the mongo service is on the network before this script starts (depends_on).
if [ -z "${MONGODB_URI:-}" ] && ! grep -Eq '^[[:space:]]*MONGODB_URI=.+' .env.local; then
  if getent hosts mongo >/dev/null 2>&1; then
    export MONGODB_URI="mongodb://mongo:27017/snapiechat"
    if [ -z "${MONGODB_DB_NAME:-}" ] && ! grep -Eq '^[[:space:]]*MONGODB_DB_NAME=.+' .env.local; then
      export MONGODB_DB_NAME="snapiechat"
    fi
    echo "Chat profile: using MONGODB_URI=${MONGODB_URI}"
  fi
fi

pnpm install --frozen-lockfile

if [ "$#" -eq 0 ]; then
  # Bind all interfaces so the host can open localhost:3310.
  exec pnpm exec next dev -p 3310 -H 0.0.0.0
fi

exec "$@"
