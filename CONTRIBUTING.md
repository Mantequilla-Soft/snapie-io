# Contributing

## Branch from staging

Create your branch from `staging` and open the pull request against `staging`.

`staging` deploys to the staging site. `main` is production and is updated by a separate `staging` → `main` pull request. Keep each pull request small and focused on one change.

## Before opening a pull request

Use the same toolchain as CI: **Node.js 22** and **pnpm 9** (the repo pins `pnpm@9.15.9`). From a clean install:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
```

`pnpm typecheck` writes the gitignored `next-env.d.ts` (ambient types for static asset imports) and then runs `tsc --noEmit`, matching CI. A fresh checkout fails `tsc` alone because that file is not committed.

The Docker loop in the README (`docker compose up`) is the same Node 22 + pnpm 9 pair if you would rather not install them on the host.

## Feed and performance changes

When a change can affect feed loading, layout shift, or other user-visible performance, include before/after [Lighthouse](https://developer.chrome.com/docs/lighthouse/overview/) notes in the pull request (scores and the relevant metrics, plus what you measured). Skip this when the change cannot affect those paths.
