#!/bin/bash
set -euo pipefail

# Usage: bash deploy.sh [production|staging]   (default: production)
# Run from inside the checkout being deployed. Production lives in
# /var/www/snapie-io on `main`, staging in /var/www/snapie-io-staging on
# `staging`, each with its own node_modules/.next/.env and PM2 process.
TARGET="${1:-production}"
case "$TARGET" in
  production) BRANCH=main;    PM2_NAME=snapie-io ;;
  staging)    BRANCH=staging; PM2_NAME=snapie-io-staging ;;
  *) echo "Unknown deploy target: $TARGET (expected production|staging)" >&2; exit 1 ;;
esac

# node_modules/.next/.git under /var/www/snapie-io are owned by the meno
# user. Running the build as root (e.g. `sudo ./deploy.sh`) makes pnpm
# install/write those files as root, which a later non-root — or even a
# later root — pnpm run may not cleanly relink over, leaving stale
# leftovers (from before a dependency fix) silently in place even while
# pnpm reports the lockfile as satisfied. Always build as the app user,
# regardless of which user invoked this script, same as the PM2 restart
# below already has to.
BUILD_CMDS="
set -euo pipefail
git fetch origin
git checkout $BRANCH
git pull --ff-only origin $BRANCH
pnpm install
# A dependency-version fix can leave the previous .next build cache
# referencing files/paths that no longer exist after the bump — force a
# clean build so every deploy reflects exactly what is currently installed.
# The app must already be stopped before this runs: the old PM2 process
# keeps writing to .next/cache/fetch-cache (the ISR fetch cache) until it
# is stopped, and rm -rf racing those writes intermittently fails with
# a 'Directory not empty' error.
rm -rf .next
pnpm build
"

if [ "${EUID}" -eq 0 ]; then
  sudo -u meno -H env PM2_HOME=/home/meno/.pm2 pm2 stop $PM2_NAME
  sudo -u meno -H bash -lc "$BUILD_CMDS"
  sudo -u meno -H env PM2_HOME=/home/meno/.pm2 pm2 restart $PM2_NAME
else
  pm2 stop $PM2_NAME
  bash -c "$BUILD_CMDS"
  pm2 restart $PM2_NAME
fi
