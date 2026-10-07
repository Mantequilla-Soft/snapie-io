# syntax=docker/dockerfile:1
# Preview image for `docker compose up --build`.
#
# node:22-bookworm publishes linux/arm64 and linux/amd64. pnpm installs
# dependencies (including sharp) inside the image, so the result matches the
# machine running the build. Do not copy a host node_modules tree in.

FROM node:22-bookworm

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY . .

RUN pnpm install --frozen-lockfile

ENV NODE_ENV=development
EXPOSE 3310

# next dev reads NEXT_PUBLIC_* at startup, so compose can flip games/points
# without a rebuild beyond the image itself. Bind all interfaces so the
# published port is reachable from the host.
CMD ["pnpm", "exec", "next", "dev", "-p", "3310", "-H", "0.0.0.0"]
