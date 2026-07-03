# OOMOL Connect

[English](README.md) | [简体中文](README.zh-CN.md)

Run external-service tools for AI agents from your own machine.

OOMOL Connect is a local connector runtime. It lets an agent discover and call typed actions for
services such as GitHub, Gmail, Notion, Hacker News, Ably, Abstract, and A-Leads without giving the
agent raw provider tokens. Credentials stay in your local SQLite database; agents see schemas,
scopes, execution status, and safe account labels.

Use it when you want an agent to work with real services, but you still want a local boundary around
credentials, permissions, and execution history.

## What It Gives You

- A local runtime that exposes provider actions through MCP, HTTP, OpenAPI, and a web console.
- Local credential storage for API keys, custom credentials, OAuth2 connections, and no-auth
  providers.
- Typed action schemas so agents can discover what they can call before they call it.
- Connection identity and scopes so users and agents can see which account an action will run as.
- Local temporary file transit for actions that need file URLs.
- Recent run logs with redacted input summaries and provider errors.
- A provider catalog with local executors that load only when an action is used.

## Quick Start

The fastest way to try OOMOL Connect is Docker Compose:

```bash
docker compose up --build
```

Open the local console:

```text
http://localhost:3000
```

Open the generated API reference:

```text
http://localhost:3000/docs
```

Run a no-auth action to verify the runtime:

```bash
curl -s -X POST http://localhost:3000/v1/actions/hackernews.get_top_stories \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

Docker Compose stores runtime state in the `connector-data` volume. The container stores the SQLite
database at `/app/data/connect.sqlite`.

## Connect Your First Provider

GitHub is the simplest credentialed example because it can use a personal access token.

Inspect the provider contract:

```bash
curl -s http://localhost:3000/api/providers/github
```

Store the default GitHub connection:

```bash
curl -s -X PUT http://localhost:3000/api/connections/github \
  -H 'content-type: application/json' \
  -d '{"authType":"api_key","values":{"apiKey":"github_pat_..."}}'
```

Call GitHub through OOMOL Connect:

```bash
curl -s -X POST http://localhost:3000/v1/actions/github.get_current_user \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

Check configured connections and the account identity exposed to agents:

```bash
curl -s http://localhost:3000/api/connections
```

### Named Connections

Add `connectionName` when you want multiple accounts for the same provider:

```bash
curl -s -X PUT http://localhost:3000/api/connections/github \
  -H 'content-type: application/json' \
  -d '{"authType":"api_key","connectionName":"work","values":{"apiKey":"github_pat_..."}}'
```

Select that account during execution:

```bash
curl -s -X POST http://localhost:3000/v1/actions/github.get_current_user \
  -H 'x-oo-connector-alias: work' \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

The `alias` query parameter is also accepted.

## Use OAuth Providers

OAuth2 providers use your own provider OAuth app. First list OAuth-capable providers and copy the
`expectedRedirectUri` for the service you want:

```bash
curl -s http://localhost:3000/api/oauth/configs
```

With the default port, GitHub expects this callback URL:

```text
http://localhost:3000/oauth/callback
```

Store the OAuth client locally:

```bash
curl -s -X PUT http://localhost:3000/api/oauth/configs/github \
  -H 'content-type: application/json' \
  -d '{"clientId":"...","clientSecret":"..."}'
```

Start authorization:

```bash
curl -s -X POST http://localhost:3000/api/oauth/authorizations \
  -H 'content-type: application/json' \
  -d '{"service":"github"}'
```

Open the returned `authorizationUrl` in a browser. After the provider redirects back to the local
callback URL, OOMOL Connect stores the OAuth credential as the default connection. Add
`"connectionName":"work"` to the authorization request to store the OAuth result as a named
connection.

If you change `PORT`, `HOST`, or run behind a tunnel, set `OOMOL_CONNECT_ORIGIN` before starting the
runtime. The callback URL returned by `/api/oauth/configs` is the URL to paste into the provider
OAuth app.

## Give Tools To An Agent

OOMOL Connect exposes one local tool boundary and lets the agent discover provider actions from
there.

### MCP

Point MCP-capable clients at:

```text
http://localhost:3000/mcp
```

The MCP server exposes a small discovery-oriented tool set:

- `list_apps`
- `search_actions`
- `get_action_guide`
- `execute_action`

Preview MCP tool metadata:

```bash
curl -s http://localhost:3000/mcp/tools
```

### HTTP Runtime API

Agent and SDK-style clients should call the `/v1` runtime API. It returns a uniform JSON envelope:

```json
{
  "success": true,
  "message": "OK",
  "data": {},
  "meta": {}
}
```

Discover actions:

```bash
curl -s http://localhost:3000/v1/actions
curl -s "http://localhost:3000/v1/actions?service=github"
curl -s http://localhost:3000/v1/actions/github.get_current_user
```

Execute an action:

```bash
curl -s -X POST http://localhost:3000/v1/actions/github.get_current_user \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

### Action Guides

Each action has a local markdown guide that includes the input schema, scopes, provider permissions,
current connection identity, and request examples:

```bash
curl -s http://localhost:3000/api/actions/github.get_current_user/agent.md
```

The web console also lets you copy cURL, TypeScript, and agent prompt examples for each action.

## Web Console

Open `http://localhost:3000` after starting the runtime. Docker Compose builds and serves the web
console automatically.

The console helps you:

- Browse providers and connection status.
- Save API keys or OAuth client configuration.
- Create and revoke runtime API tokens for agents and clients.
- Inspect action schemas, scopes, and execution status.
- Run an action from the browser for debugging.
- Review recent local runs.
- Open the generated OpenAPI and MCP metadata.

## Protect The Local Runtime

By default, the server binds to `127.0.0.1`. Set an admin token when anything outside your own
browser or shell can reach the local admin API or web console:

```bash
OOMOL_CONNECT_ADMIN_TOKEN="replace-with-an-admin-token" docker compose up --build
```

Admin HTTP clients must then send:

```text
Authorization: Bearer replace-with-an-admin-token
```

Create runtime tokens for `/v1` and `/mcp` callers from the Web Console Access tab. The token is
shown once when created; only a hash is stored in SQLite.

You can also create one through the local admin API:

```bash
curl -s -X POST http://localhost:3000/api/runtime-tokens \
  -H 'content-type: application/json' \
  -d '{"name":"Claude Desktop"}'
```

Runtime clients then send the returned `token`:

```text
Authorization: Bearer oct_...
```

For bootstrap scripts and backward compatibility, `OOMOL_CONNECT_RUNTIME_TOKEN` is still accepted:

```bash
OOMOL_CONNECT_ADMIN_TOKEN="replace-with-an-admin-token" \
OOMOL_CONNECT_RUNTIME_TOKEN="replace-with-a-runtime-token" \
docker compose up --build
```

Encrypt stored provider credentials and OAuth client secrets:

```bash
OOMOL_CONNECT_ENCRYPTION_KEY="replace-with-a-long-random-secret" docker compose up --build
```

Constrain which actions agents can execute:

```bash
OOMOL_CONNECT_ALLOWED_ACTIONS="hackernews.*,github.get_current_user" docker compose up --build
```

Block specific actions even when a broader allowlist includes them:

```bash
OOMOL_CONNECT_ALLOWED_ACTIONS="github.*" \
OOMOL_CONNECT_BLOCKED_ACTIONS="github.delete_repository" \
docker compose up --build
```

See [docs/credentials.md](docs/credentials.md) for credential storage, key rotation, and
OAuth token refresh behavior.

## Run From Source

Use the source workflow when you are developing OOMOL Connect or provider executors. Use Node.js 22
or newer.

```bash
npm install
npm run build:web
npm run dev
```

`npm install` and `npm run dev` create local generated files when they are missing or stale.

When running from source, runtime state is stored in `./data/connect.sqlite` by default. Set
`OOMOL_CONNECT_DATA_DIR` to use another directory.

## Deploy To Cloudflare Workers

Cloudflare Workers is supported as a metadata and runtime-state deployment target:

```bash
git clone https://github.com/oomol-lab/open-connector.git
cd open-connector
npm install
cp wrangler.example.jsonc wrangler.local.jsonc
npx wrangler login
npx wrangler d1 create oomol-connect
npx wrangler r2 bucket create oomol-connect-transit-files
```

Update ignored `wrangler.local.jsonc` with the D1 `database_id` returned by Cloudflare before
running remote migrations or deploying. All Wrangler commands that read the Worker config should use
`--config wrangler.local.jsonc`.

Set secrets with Wrangler instead of committing them to config:

```bash
npx wrangler secret put OOMOL_CONNECT_ADMIN_TOKEN --config wrangler.local.jsonc
npx wrangler secret put OOMOL_CONNECT_ENCRYPTION_KEY --config wrangler.local.jsonc
```

`OOMOL_CONNECT_ADMIN_TOKEN` is recommended for protecting the admin API, docs, and web console.
`OOMOL_CONNECT_ENCRYPTION_KEY` is required when credential encryption is needed. Then apply the D1
schema and deploy:

```bash
npx wrangler d1 migrations apply oomol-connect --remote --config wrangler.local.jsonc
npm run deploy:cloudflare
```

`npm run deploy:cloudflare` generates the catalog, builds the web console, copies catalog assets, and
runs `wrangler deploy --config wrangler.local.jsonc`.

The Cloudflare runtime serves catalog metadata, `/api` and `/v1` metadata endpoints, connections,
runtime tokens, OAuth config/state, R2-backed transit files, and the same generated provider action
executor registry used by the Node runtime. Configure an R2 lifecycle rule for the transit bucket if
you want unread expired transit files cleaned up automatically.

## Examples

Start the local runtime first:

```bash
docker compose up --build
```

Then run examples directly with Node:

```bash
node examples/local-http/hackernews.ts
GITHUB_TOKEN=github_pat_... node examples/local-http/github.ts
node examples/mcp-client/list-tools.ts
node examples/openai-tools/list-tools.ts
```

For an OpenAI tool-call loop:

```bash
OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-... node examples/openai-tools/run-hackernews.ts
```

Upload a temporary local transit file for actions that accept a file URL:

```bash
curl -s -X POST http://localhost:3000/api/files \
  -F "file=@./report.pdf"
```

The response includes a `downloadUrl` under `/api/files/:fileId`. Local transit files are stored
under `OOMOL_CONNECT_DATA_DIR/files` and are cleaned up by age.

## Runtime API Surface

Public runtime endpoints:

- `GET /v1/health`
- `GET /v1/providers`
- `GET /v1/actions`
- `GET /v1/actions?service=<service>`
- `GET /v1/actions/:actionId`
- `POST /v1/actions/:actionId`
- `GET /v1/apps`
- `GET /v1/apps/services/:service`
- `GET /v1/apps/authenticated`
- `POST /v1/proxy/:service`

`POST /v1/proxy/:service` currently returns `proxy_not_supported` until a provider proxy runtime is
implemented.

Local admin endpoints power the web console, examples, and setup scripts:

- `GET /api/providers`
- `GET /api/providers/:service`
- `GET /api/actions`
- `GET /api/actions/:actionId`
- `GET /api/actions/:actionId/agent.md`
- `POST /api/files`
- `GET /api/files/:fileId`
- `DELETE /api/files/:fileId`
- `GET /api/connections`
- `PUT /api/connections/:service`
- `DELETE /api/connections/:service`
- `GET /api/oauth/configs`
- `PUT /api/oauth/configs/:service`
- `DELETE /api/oauth/configs/:service`
- `POST /api/oauth/authorizations`
- `GET /oauth/callback/:service`
- `GET /api/runtime-tokens`
- `POST /api/runtime-tokens`
- `DELETE /api/runtime-tokens/:id`
- `GET /api/runs`
- `POST /mcp`
- `GET /mcp/tools`
- `GET /openapi.json`

## Documentation

- [Quickstart](docs/quickstart.md)
- [Configuration](docs/configuration.md)
- [Catalog format](docs/catalog-format.md)
- [Credentials](docs/credentials.md)
- [Verification language](docs/verification.md)
- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security](SECURITY.md)

## Development

```bash
npm run fix-check
npm run generate:catalog
npm test
```

`npm run fix-check` runs lint fixes, formatting fixes, and the `src` typecheck. Formatting and
linting use `oxfmt` and `oxlint`. Run `npm run build` separately only when you need a no-fix
typecheck, such as CI parity after generated files changed.

### Project Layout

```text
src/
  core/                     Core provider/action contracts and validation
  oauth/                    Local OAuth client configuration and callback flow
  providers/                Provider definitions and lazy-loaded executors
  server/                   Local HTTP server
web/                        Vite local console package
catalog/apps/               Local generated catalog JSON (gitignored)
examples/                   Runnable local examples
scripts/                    Catalog and registry generation tools
.codex/skills/add-provider/ Agent-readable provider contribution workflow
docs/                       User and contributor documentation
```

### Adding Providers

Provider code lives under `src/providers/<service>`.

See [CONTRIBUTING.md](CONTRIBUTING.md#adding-providers) for provider contribution rules.

Typical provider workflow:

```bash
npm run generate:catalog
npm run fix-check
npm test
```

Provider definitions generate registry and catalog files. Provider executors are loaded only when
one of that provider's actions is executed. Generated files are local runtime data and are not
committed.

## License Scope

Unless otherwise noted, the source code, scripts, generated project scaffolding, tests, and
documentation authored for this repository are licensed under the Apache License, Version 2.0. See
[LICENSE.txt](LICENSE.txt).

The Apache-2.0 license for this repository does not grant rights to third-party products,
providers, apps, APIs, trademarks, service marks, trade names, logos, icons, brand assets,
documentation, screenshots, or other copyrighted materials owned by their respective holders.

Provider and app names, metadata, links, scopes, permissions, and optional logos/icons are included
only to identify services and enable interoperability. All third-party brand and product rights
remain with their respective owners. Inclusion in this catalog does not imply endorsement,
sponsorship, partnership, certification, or verification by those owners.

If you contribute provider metadata or assets, only submit material you have the right to submit.
Prefer linking to official public assets instead of copying brand files into this repository.

## Community

Please keep issues and pull requests focused, respectful, and actionable. Participation in this
project is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
