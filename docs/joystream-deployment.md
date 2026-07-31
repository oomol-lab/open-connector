# Joystream Deployment (Railway)

This is the operational playbook for running OpenConnector on Railway for Joystream. It is
internal deployment documentation, distinct from the general [Fly.io](fly-io.md) and
[Cloudflare](cloudflare.md) deployment guides upstream.

## Architecture

- GitHub Actions builds the image from `docker/Dockerfile` for `linux/amd64` only (production
  targets amd64 servers; Apple Silicon developers build their own local arm64 image with
  `docker-compose.build.yml` instead of CI publishing a second architecture nobody deploys) and
  pushes it to `ghcr.io/joystream-ai/open-connector`. The actual build steps live in the reusable
  workflow `build-image.yml`, called by two different triggers:
  - `publish-docker.yml` — every push to `main` (this includes merged PRs), tags `tip` and the
    commit SHA. This is what staging tracks.
  - `promote-production.yml` — a manually triggered promotion, tags `joystream-vX.Y.Z` and
    `latest`. Prefixed `joystream-v` rather than plain `v` because this repo is a fork of
    [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector), whose own release
    history already occupies the plain `v*` tag namespace and will keep growing as upstream is
    merged in. See [Staging and production](#staging-and-production) below.
- The GHCR package is **private**, scoped to the `joystream-ai` org.
- Railway runs the published image directly; it does not build from source. This keeps a single
  build artifact — the one CI produced and tested — as the thing that actually runs in
  production, rather than a second, potentially different build.
- Runtime state lives in **Supabase Postgres**, not a Railway Postgres plugin or SQLite. Schema
  migrations under `migrations/postgres/` are applied automatically by the app on startup — no
  manual migration step, and no manual `CREATE SCHEMA` — the app itself runs
  `create schema if not exists "open_connector"` before any migration.

## Database: Supabase

Connect via Supabase's **Session Pooler** (port `5432`), not the Transaction Pooler (port
`6543`). This matters for correctness, not just performance: the app sets `search_path` as a
Postgres connection **startup parameter** (see `createConnectorPool` in
`src/server/storage/postgres-runtime-store.ts`) rather than issuing `SET` after connecting, which
is what guarantees queries can never resolve against the wrong schema. Transaction-mode pooling
multiplexes many logical connections over few backend connections and does not reliably preserve
that startup parameter. Session mode does.

The Session Pooler host is also IPv4-reachable, unlike Supabase's direct connection host
(`db.<project-ref>.supabase.co`), which is IPv6-only — safer to use regardless of Railway's
current IPv6 egress support.

Connection string shape:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
```

`sslmode=require` is required — Supabase enforces TLS on external connections, and `pg.Pool` here
takes its SSL setting directly from the connection string.

Set this as `OOMOL_CONNECT_DATABASE_URL`. Leave `OOMOL_CONNECT_DATABASE_SCHEMA` unset (defaults to
`open_connector`) unless this Supabase project's database is shared with something else that also
uses that schema name.

**Use a separate Supabase project per environment** (one for staging, one for production), not
one project split by schema name. Full isolation: a bad staging migration or a runaway query
can't touch production data or eat production's connection quota. This maps directly onto
Railway's own environments — each Railway environment already carries its own variable values, so
this is just "a different `OOMOL_CONNECT_DATABASE_URL` per environment," no extra plumbing.

## One-time setup

1. Create two Supabase projects, one for staging and one for production. Get each project's
   Session Pooler connection string per above.
2. Create the Railway project with two environments/services: staging and production.
3. For each service, set the source to a Docker image: `ghcr.io/joystream-ai/open-connector:<tag>`
   — `tip` for staging, a versioned release tag (e.g. `joystream-v1.4.0`) for production. See
   [Staging and production](#staging-and-production).
4. Add GHCR registry credentials to each service — a bot/service-account GitHub PAT with
   `read:packages` scope, authorized against the `joystream-ai` org. Use a dedicated
   service-account PAT, not a personal one, so deploys don't depend on any one person's GitHub
   account.
5. Set the environment variables below, using each environment's own Supabase connection string.
6. Set the health check path to `/health` on both services.
7. Deploy, then confirm `OOMOL_CONNECT_ORIGIN` matches the domain Railway assigns (or the custom
   domain, once attached) — OAuth provider redirect URIs depend on this being correct.

## Environment variables

| Variable                        | Value                                                        | Notes                                                                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OOMOL_CONNECT_ORIGIN`          | Public URL of the service                                    | Railway-generated domain or custom domain. Used to build OAuth redirect URLs.                                                                                                                                 |
| `OOMOL_CONNECT_DATABASE_URL`    | This environment's Supabase Session Pooler connection string | See [Database: Supabase](#database-supabase) above. Staging and production use different Supabase projects.                                                                                                   |
| `OOMOL_CONNECT_DATABASE_SCHEMA` | Optional                                                     | Only set if sharing the database with another app and a distinct schema name is wanted.                                                                                                                       |
| `OOMOL_CONNECT_ENCRYPTION_KEY`  | Long random secret                                           | Encrypts stored credentials, OAuth client config, and completed idempotent action responses. If this key is lost, encrypted data cannot be recovered — keep a copy outside Railway (e.g. a password manager). |
| `OOMOL_CONNECT_ADMIN_TOKEN`     | Bearer token                                                 | Required to authenticate the local admin API, API docs, and web console.                                                                                                                                      |
| `OOMOL_CONNECT_RUNTIME_TOKEN`   | Optional bootstrap bearer token                              | For `/v1` and MCP callers. Prefer scoped persistent tokens created from the web console Access tab instead, and leave this unset once those are in place.                                                     |
| `OOMOL_CONNECT_ALLOWED_ACTIONS` | Optional allowlist                                           | Restricts which provider actions the runtime can execute. Recommended beyond a fully trusted internal environment.                                                                                            |
| `OOMOL_CONNECT_ALLOWED_PROXIES` | Optional allowlist                                           | Restricts which provider proxies the runtime can reach.                                                                                                                                                       |

Do **not** set `PORT` or `HOST` — Railway injects `PORT` automatically, and the image already
binds `HOST=0.0.0.0`.

See [configuration.md](configuration.md) for the full environment variable reference.

## Staging and production

Staging and production are deployed differently on purpose — staging optimizes for fast feedback,
production optimizes for "we know exactly what commit is running and can prove it."

### Staging: automatic

Staging tracks the mutable `tip` tag and updates itself via Railway's built-in **Image
Auto-Update** feature — no GitHub Actions involvement. On the staging service: Settings → Source →
Configure Auto Updates → track the `tip` tag → maintenance window **Anytime** (not
Weekends/Night — those exist for cautious production-style updates; staging wants it fast). Railway
polls GHCR (this works with private images using the same registry PAT already configured) and
redeploys when `tip`'s digest changes. This is polling-based, not a push webhook, so there's a
short delay between a merge landing and staging picking it up — fine for staging, which is why
production doesn't use this mechanism.

### Production: manual, via `promote-production.yml`

Run the **Promote to Production** workflow (`workflow_dispatch` on `promote-production.yml`) from
the Actions tab. Optionally give it a `version` input (e.g. `joystream-v1.5.0`); leave it blank to
auto-bump the patch version of the latest `joystream-v*` tag. The workflow:

1. Tags main's current tip with the resolved version and creates a GitHub Release (idempotent —
   reuses an existing tag/release if one already points at that commit, so a failed run can be
   re-run safely).
2. Builds that exact commit and pushes it to GHCR as `joystream-vX.Y.Z` and `latest`.
3. Calls the Railway API to point the production service at the new image and deploy it.

**Before running it**, confirm the commit currently deployed to staging is the one you want to
ship — the workflow always promotes main's current tip, and there is no automated check yet that
staging has actually caught up to that commit and been verified. That check can be added later
(compare what's deployed to staging against main's tip before allowing the promotion); for now
it's a manual judgment call, deliberately kept simple for a small team.

### Secrets and variables (GitHub repo settings)

| Name                                | Type     | Value                                                                                                                                       |
| ----------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `RAILWAY_API_TOKEN`                 | Secret   | A Railway **project token** (scoped to this Railway project only, not an account-wide token), from the Railway project's Settings → Tokens. |
| `RAILWAY_PRODUCTION_SERVICE_ID`     | Variable | The production service's ID, from the Railway dashboard/API.                                                                                |
| `RAILWAY_PRODUCTION_ENVIRONMENT_ID` | Variable | The production environment's ID, from the Railway dashboard/API.                                                                            |

No GitHub secrets are needed for staging — Railway's auto-update polling is configured entirely in
the Railway dashboard. No additional secret is needed for pushing images to GHCR either; both
`publish-docker.yml` and `promote-production.yml` use the automatically issued `GITHUB_TOKEN`.

## Persistent state

- Connections, credentials, OAuth state, runtime tokens, and run/audit history live in Postgres —
  durable across redeploys and restarts.
- Transit files (temporary file passthrough between actions) are written to local container disk
  and expire on their own TTL (`OOMOL_CONNECT_TRANSIT_FILE_TTL_SECONDS`, default 24h). They do not
  need to survive a redeploy, so no Railway volume is required.

## Rollback

Redeploy the previous image tag (or previous release) from the Railway dashboard or CLI. Because
runtime state lives in Postgres rather than in the container, rolling the image back does not
lose data on its own — only a schema-incompatible migration would need manual care.
