# Runtime API And MCP

OpenConnector exposes provider Actions through MCP, HTTP, OpenAPI, local Action guides, and the Web
Console. This document is the detailed reference that keeps endpoint lists and protocol examples out
of the README.

## Access Surfaces

| Surface          | Endpoint                              | Use it for                                                                               |
| ---------------- | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| MCP              | `POST /mcp`                           | Agent hosts that can call MCP tools.                                                     |
| MCP metadata     | `GET /mcp/tools`                      | Preview the discovery-oriented MCP tool set.                                             |
| HTTP runtime API | `/v1/*`                               | SDK-style clients, scripts, and direct Action execution.                                 |
| OpenAPI          | `GET /openapi.json`                   | API importers, reference generation, and strongly scoped one-Action specs.               |
| Action guide     | `GET /api/actions/:actionId/agent.md` | Agent-readable markdown guide for one Action.                                            |
| Web Console      | `GET /`                               | Browser workflow for browsing providers, configuring credentials, and debugging Actions. |

When runtime authentication is configured, `/v1/*` and `/mcp` callers should send a bootstrap token,
persistent runtime token, or JWT access token as:

```text
Authorization: Bearer <runtime-token-or-jwt>
```

The Node server accepts JWT access tokens when `OOMOL_CONNECT_JWKS_URI`,
`OOMOL_CONNECT_JWT_ISSUER`, and `OOMOL_CONNECT_JWT_AUDIENCE` are configured together. JWT
authentication coexists with existing runtime tokens and does not apply to admin endpoints. See
[Configuration](configuration.md#jwt-access-tokens) for the resource-server scope and Node-only
limitations.

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

### Idempotent Action Retries

`POST /v1/actions/:actionId` accepts an optional `Idempotency-Key` header. Without this header,
every request is executed normally. Generate a new, unpredictable key for each logical operation,
then reuse that key only when retrying the same operation:

```bash
IDEMPOTENCY_KEY=$(openssl rand -hex 16)

curl -s -X POST http://localhost:3000/v1/actions/github.get_current_user \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

The runtime trims leading and trailing whitespace from the key. The remaining value must be
non-empty and no longer than 255 UTF-8 bytes; invalid values return `400 invalid_input`. The key
namespace is runtime-wide rather than scoped to a bearer token, caller, or connection, so callers
should use sufficiently unique values.

When this header is present, the Action input must not exceed an object/array nesting depth of 100
levels. Deeper inputs return `400 invalid_input` before the Action is dispatched.

The request identity includes the Action id, JSON input, and effective connection. JSON object key
order does not affect the identity, and explicitly selecting the `default` connection is equivalent
to omitting the connection. Reusing a key with a different Action, input, or effective connection
returns `409 idempotency_key_conflict`.

After a request completes, retries with the same identity replay its original HTTP status and body,
including the original `executionId` when present. This applies to successful results as well as
completed Action or provider failures. Responses remain replayable for 24 hours; after that replay
window, the same key may execute the Action again.

A duplicate received while the original request is running returns
`409 idempotency_request_in_progress`. The same response is returned when execution may have
produced a provider-side effect but the runtime cannot confirm or persist the final response. The
runtime does not automatically dispatch the Action again in either case.

Idempotency provides durable duplicate suppression and response replay, but it does not guarantee
exactly-once execution by the provider. This behavior applies to the HTTP Action endpoint; MCP
`execute_action` calls do not accept an idempotency key.

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
`OOMOL_CONNECT_BLOCKED_PROXIES`, and by nothing else: action policy does not affect them. Every
provider proxy is allowed until one of those variables restricts it, and
`OOMOL_CONNECT_BLOCKED_PROXIES="*"` disables provider proxies entirely.

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
