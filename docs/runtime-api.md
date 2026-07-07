# Runtime API And MCP

OpenConnector exposes provider Actions through MCP, HTTP, OpenAPI, local Action guides, and the Web
Console. This document is the detailed reference that keeps endpoint lists and protocol examples out
of the README.

## Access Surfaces

| Surface            | Endpoint                              | Use it for                                                                               |
| ------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| MCP                | `POST /mcp`                           | Agent hosts that can call MCP tools.                                                     |
| MCP metadata       | `GET /mcp/tools`                      | Preview the discovery-oriented MCP tool set.                                             |
| HTTP runtime API   | `/v1/*`                               | SDK-style clients, scripts, and direct Action execution.                                 |
| Await async action | `POST /v1/actions/:actionId/await`    | Run a pollable asyncLifecycle action to completion within a bounded wait.                |
| OpenAPI            | `GET /openapi.json`                   | API importers, reference generation, and strongly scoped one-Action specs.               |
| Action guide       | `GET /api/actions/:actionId/agent.md` | Agent-readable markdown guide for one Action.                                            |
| Web Console        | `GET /`                               | Browser workflow for browsing providers, configuring credentials, and debugging Actions. |

When `OOMOL_CONNECT_RUNTIME_TOKEN` or persistent runtime tokens are configured, `/v1/*` and `/mcp`
callers should send:

```text
Authorization: Bearer oct_...
```

Admin endpoints under `/api/*`, `/docs`, and the Web Console use `OOMOL_CONNECT_ADMIN_TOKEN` when it
is configured.

## MCP

Point MCP-capable clients at:

```text
http://localhost:3000/mcp
```

The local MCP endpoint supports stateless `POST` JSON-RPC requests with JSON responses. It does not
keep `GET` SSE streams open.

The MCP server exposes a small discovery-oriented tool set:

- `list_apps`
- `search_actions`
- `get_action_guide`
- `execute_action`
- `await_action`

Preview MCP tool metadata:

```bash
curl -s http://localhost:3000/mcp/tools
```

## HTTP Runtime API

Runtime clients should use `/v1`. Responses use a uniform JSON envelope:

```json
{
  "success": true,
  "message": "OK",
  "data": {},
  "meta": {}
}
```

Discover Actions:

```bash
curl -s http://localhost:3000/v1/actions
curl -s "http://localhost:3000/v1/actions?service=github"
curl -s http://localhost:3000/v1/actions/github.get_current_user
```

Execute an Action:

```bash
curl -s -X POST http://localhost:3000/v1/actions/github.get_current_user \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

Select a named connection with `x-oo-connector-alias`:

```bash
curl -s -X POST http://localhost:3000/v1/actions/github.get_current_user \
  -H 'x-oo-connector-alias: work' \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

The `alias` query parameter is also accepted:

```bash
curl -s -X POST "http://localhost:3000/v1/actions/github.get_current_user?alias=work" \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

## Await Async Actions

Some actions declare `asyncLifecycle` with a full job-id and completion mapping
(`asyncLifecycle.pollable: true` in `GET /v1/actions/:actionId`). For those,
`POST /v1/actions/:actionId/await` runs the start action, then polls the status action with backoff
until it settles or a bounded wait budget runs out:

```bash
curl -s -X POST http://localhost:3000/v1/actions/gtmetrix.start_test/await \
  -H 'content-type: application/json' \
  -d '{"input":{"url":"https://example.com"},"maxWaitMs":20000}'
```

`maxWaitMs` is clamped to 1000-55000ms (default 25000ms) so the request stays safe on both
Node/Docker and Cloudflare Workers deployments. If the action doesn't settle in time, the response
is `{"status":"pending","jobId":"...","statusActionId":"..."}` — fall back to calling the status
action directly (or `/await` again) to keep checking. Actions without a pollable `asyncLifecycle`
mapping return a `not_pollable_async_lifecycle` error. The `await_action` MCP tool mirrors this
endpoint.

## Action Guides

Each Action has a local markdown guide that includes the input schema, scopes, provider
permissions, current connection identity, and request examples:

```bash
curl -s http://localhost:3000/api/actions/github.get_current_user/agent.md
```

The Web Console also lets you copy cURL, TypeScript, and agent prompt examples for each Action.

## Transit Files

Upload a temporary local transit file for Actions that accept a file URL:

```bash
curl -s -X POST http://localhost:3000/api/files \
  -F "file=@./report.pdf"
```

The response includes a `downloadUrl` under `/api/files/:fileId`. Local transit files are stored
under `OOMOL_CONNECT_DATA_DIR/files` and are cleaned up by age.

## Public Runtime Endpoints

- `GET /v1/health`
- `GET /v1/providers`
- `GET /v1/actions`
- `GET /v1/actions/search`
- `GET /v1/actions?service=<service>`
- `GET /v1/actions/:actionId`
- `POST /v1/actions/:actionId`
- `POST /v1/actions/:actionId/await`
- `GET /v1/apps`
- `GET /v1/apps/services/:service`
- `GET /v1/apps/authenticated`
- `POST /v1/proxy/:service`

`POST /v1/proxy/:service` proxies one provider API request when that provider has a registered or
provider-specific local proxy executor. Providers without a proxy executor return `proxy_not_supported`.

Request body:

```json
{
  "endpoint": "/provider/path",
  "method": "GET",
  "query": { "limit": "10" },
  "headers": { "accept": "application/json" },
  "body": { "name": "example" }
}
```

`endpoint` must be a relative path beginning with `/`; absolute URLs are rejected. The runtime keeps
stored credentials local and lets the provider proxy executor apply provider-specific authentication.
Successful responses use the standard `/v1` success envelope with `data.status`, `data.headers`, and
`data.data`.

Proxy requests are controlled by `OOMOL_CONNECT_ALLOWED_PROXIES` and
`OOMOL_CONNECT_BLOCKED_PROXIES`. When action policy is configured, provider proxies are denied by
default unless explicitly allowlisted.

## Local Admin Endpoints

These endpoints power the Web Console, examples, and setup scripts:

- `GET /api/providers`
- `GET /api/providers/:service`
- `GET /api/actions`
- `GET /api/actions/search`
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
- `GET /oauth/callback`
- `GET /api/runtime-tokens`
- `POST /api/runtime-tokens`
- `DELETE /api/runtime-tokens/:id`
- `GET /api/runs`
- `POST /mcp`
- `GET /mcp/tools`
- `GET /openapi.json`
