# Quickstart

Install dependencies, run the build, and start the runtime:

```bash
npm install
npm run build
npm run dev
```

`npm install` and `npm run dev` create local generated files when they are missing or stale.

Open the API reference at `http://localhost:3000/docs`.

## Run A No-Auth Action

Hacker News does not need credentials, so it is the fastest way to verify the runtime:

```bash
curl -s -X POST http://localhost:3000/v1/actions/hackernews.get_top_stories \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

## Discover Actions

List services that expose actions:

```bash
curl -s http://localhost:3000/v1/actions
```

List action contracts for one service:

```bash
curl -s "http://localhost:3000/v1/actions?service=hackernews"
```

Get a local markdown guide for one action:

```bash
curl -s http://localhost:3000/api/actions/hackernews.get_top_stories/agent.md
```

Inspect local connections and the account identity exposed to users and agents:

```bash
curl -s http://localhost:3000/api/connections
```

## Configure An API Key Connection

Inspect the provider to see supported auth types and credential fields:

```bash
curl -s http://localhost:3000/api/providers/github
```

Store the default API key connection:

```bash
curl -s -X PUT http://localhost:3000/api/connections/github \
  -H 'content-type: application/json' \
  -d '{"authType":"api_key","values":{"apiKey":"github_pat_..."}}'
```

Store a named API key connection:

```bash
curl -s -X PUT http://localhost:3000/api/connections/github \
  -H 'content-type: application/json' \
  -d '{"authType":"api_key","connectionName":"work","values":{"apiKey":"github_pat_..."}}'
```

Execute an action with that default connection:

```bash
curl -s -X POST http://localhost:3000/v1/actions/github.get_current_user \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

## Configure An OAuth2 Connection

List OAuth configs and copy the `expectedRedirectUri` for your provider:

```bash
curl -s http://localhost:3000/api/oauth/configs
```

Paste that exact callback URL into your provider OAuth app. With the default port, GitHub uses:

```text
http://localhost:3000/oauth/callback
```

If you expose the runtime through another origin, set `OOMOL_CONNECT_ORIGIN` before starting it.

Store the provider OAuth client:

```bash
curl -s -X PUT http://localhost:3000/api/oauth/configs/github \
  -H 'content-type: application/json' \
  -d '{"clientId":"...","clientSecret":"..."}'
```

Start authorization and open the returned `authorizationUrl`:

```bash
curl -s -X POST http://localhost:3000/api/oauth/authorizations \
  -H 'content-type: application/json' \
  -d '{"service":"github"}'
```

After the browser callback completes, the OAuth credential is stored as the default connection. Add
`"connectionName":"work"` to the authorization request to store the result as a named connection.

## Web Console

The web console is served at `http://localhost:3000` after building the `web` workspace:

```bash
npm run build:web
npm run dev
```

## Cloudflare Workers Preview

Create the Cloudflare resources, apply the D1 schema, and start a local Worker preview:

```bash
cp wrangler.example.jsonc wrangler.local.jsonc
npm run generate:catalog
npm run build:web
npx wrangler d1 create oomol-connect
npx wrangler r2 bucket create oomol-connect-transit-files
npx wrangler d1 migrations apply oomol-connect --local
npm run dev:cloudflare
```

For remote deploys, put the returned D1 `database_id` in ignored `wrangler.local.jsonc`, run the
migration with `--remote`, set secrets with `wrangler secret put`, then run:

```bash
npm run deploy:cloudflare
```

The Worker runtime exposes catalog metadata, connection/token/OAuth state APIs, R2-backed transit
files, and the same generated provider action executor registry used by the Node runtime.

## Runtime Settings

Local runtime state is stored in `./data/connect.sqlite` by default. Override the directory with:

```bash
OOMOL_CONNECT_DATA_DIR=/path/to/data npm run dev
```

With Docker Compose, the bundled `connector-data` volume is mounted at `/app/data`.

Set `OOMOL_CONNECT_ENCRYPTION_KEY` to encrypt stored credentials:

```bash
OOMOL_CONNECT_ENCRYPTION_KEY="replace-with-a-long-random-secret" npm run dev
```

Set an admin bearer token when the admin API or web console is reachable outside your own shell:

```bash
OOMOL_CONNECT_ADMIN_TOKEN="replace-with-an-admin-token" npm run dev
curl -s http://localhost:3000/api/actions \
  -H "authorization: Bearer replace-with-an-admin-token"
```

Use the admin token for `/api`, `/docs`, and the web console. Create persistent runtime tokens for
`/v1` and `/mcp` from the web console Access tab or `POST /api/runtime-tokens`; only token hashes are
stored in SQLite. `OOMOL_CONNECT_RUNTIME_TOKEN` remains available for bootstrap scripts.

The server binds to `127.0.0.1` by default. Set `HOST=0.0.0.0` only when the runtime must be
reachable from outside the local machine or container.

Constrain executable actions with comma-separated action ids or provider wildcards:

```bash
OOMOL_CONNECT_ALLOWED_ACTIONS="hackernews.*,github.get_current_user" npm run dev
```
