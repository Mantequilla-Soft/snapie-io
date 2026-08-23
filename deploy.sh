#!/bin/bash
set -euo pipefail

git pull
pnpm install
# A dependency-version fix (e.g. today's jsdom pin) can leave the previous
# .next build's webpack cache referencing files/paths that no longer exist
# after the version bump — pnpm install resolves the new version correctly,
# but next build can still partially reuse the stale cache and fail. Force a
# clean build so every deploy reflects exactly what's currently installed.
rm -rf .next
pnpm build

# PM2 process ownership is tied to user session; when deploy runs with sudo,
# restart PM2 as the app user so it targets the correct process list.
if [ "${EUID}" -eq 0 ]; then
  sudo -u meno -H env PM2_HOME=/home/meno/.pm2 pm2 restart snapie-io
else
  pm2 restart snapie-io
fi
