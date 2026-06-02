#!/bin/bash
set -euo pipefail

git pull
pnpm install
pnpm build

# PM2 process ownership is tied to user session; when deploy runs with sudo,
# restart PM2 as the app user so it targets the correct process list.
if [ "${EUID}" -eq 0 ]; then
  sudo -u meno -H env PM2_HOME=/home/meno/.pm2 pm2 restart snapie-io
else
  pm2 restart snapie-io
fi
