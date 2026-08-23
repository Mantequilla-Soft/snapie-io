#!/bin/bash
set -euo pipefail

# node_modules/.next/.git under /var/www/snapie-io are owned by the meno
# user. Running the build as root (e.g. `sudo ./deploy.sh`) makes pnpm
# install/write those files as root, which a later non-root — or even a
# later root — pnpm run may not cleanly relink over, leaving stale
# leftovers (from before a dependency fix) silently in place even while
# pnpm reports the lockfile as satisfied. Always build as the app user,
# regardless of which user invoked this script, same as the PM2 restart
# below already has to.
BUILD_CMDS='
set -euo pipefail
git pull
pnpm install
# A dependency-version fix can leave the previous .next build cache
# referencing files/paths that no longer exist after the bump — force a
# clean build so every deploy reflects exactly what is currently installed.
rm -rf .next
pnpm build
'

if [ "${EUID}" -eq 0 ]; then
  sudo -u meno -H bash -lc "$BUILD_CMDS"
  sudo -u meno -H env PM2_HOME=/home/meno/.pm2 pm2 restart snapie-io
else
  bash -c "$BUILD_CMDS"
  pm2 restart snapie-io
fi
