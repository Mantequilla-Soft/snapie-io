# Staging environment

Flow: feature branches → PR into `staging` (auto-deploys to
https://staging.snapie.io) → one PR `staging` → `main` (auto-deploys to prod).
Use a **merge commit** (not squash) for `staging → main` so the branches
don't diverge.

|            | production            | staging                        |
|------------|-----------------------|--------------------------------|
| branch     | `main`                | `staging`                      |
| directory  | `/var/www/snapie-io`  | `/var/www/snapie-io-staging`   |
| PM2 name   | `snapie-io`           | `snapie-io-staging`            |
| port       | 3310                  | 3311                           |
| domain     | snapie.io             | staging.snapie.io              |
| MongoDB    | same instance, `MONGODB_DB_NAME=snapiechat` | same instance, `MONGODB_DB_NAME=snapiechat_staging` |

Deploys run `bash deploy.sh <production|staging>` from the matching directory.

## One-time server setup (same box as production)

```bash
# 1. Checkout
cd /var/www
git clone <repo-url> snapie-io-staging
cd snapie-io-staging
git checkout staging
pnpm install

# 2. Env — copy prod's .env, then change ONLY what is listed below
cp /var/www/snapie-io/.env .env
$EDITOR .env

# 3. First build + PM2 process
pnpm build
pm2 start ecosystem.staging.config.cjs
pm2 save
```

### `.env` differences from production

- `MONGODB_DB_NAME=snapiechat_staging` (same `MONGODB_URI`; staging starts empty —
  seed with `mongodump --db snapiechat | mongorestore --nsFrom 'snapiechat.*' --nsTo 'snapiechat_staging.*'` if wanted)
- **Remove** `HIVE_POSTING_KEY`, `ACCOUNT_KEY`, `ACCOUNT_CREATOR`
  (or use a throwaway test account's) — on-chain writes can't be undone.
- Site/URL values that reference snapie.io → staging.snapie.io.
- Omit Firebase push vars unless testing push (avoids notifying real users).
- Add `staging.snapie.io` as an allowed origin/audience in ButrAuth
  (`BUTRAUTH_CHAT_AUDIENCES`) and Snapie Auth if they enforce it.
- `NEXT_PUBLIC_*` values are baked in at build time: change → rebuild.

## nginx

Add a server block for `staging.snapie.io` proxying to `127.0.0.1:3311`
(copy prod's block, change `server_name` and the port), then get a cert
(`certbot --nginx -d staging.snapie.io`). Add DNS A/AAAA for the subdomain.
Recommended inside the block:

```nginx
add_header X-Robots-Tag "noindex, nofollow" always;
auth_basic "staging";
auth_basic_user_file /etc/nginx/.htpasswd-staging;
```

## GitHub setup

1. Settings → Environments: create `staging` and `production`
   (optionally require a reviewer on `production`). The existing
   `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY` repo secrets work for
   both; move them per-environment if you want separate keys.
2. Create the branch: `git push origin main:staging`.
3. Branch protection on `main` and `staging`: require PRs and the
   lint / typecheck / test / build checks.

## Resource note

Builds run in place on the production box. A staging deploy's `pnpm build`
competes with prod for CPU/RAM; if prod gets sluggish during deploys, move
staging builds off-box or nice them.
