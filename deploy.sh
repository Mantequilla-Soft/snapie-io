#!/bin/bash
set -e

git pull
pnpm install
pnpm build
pm2 restart snapie-io
