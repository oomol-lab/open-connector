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

Persistent runtime tokens carry independent Action rules, provider proxy grants, and optional
connection grants. Their `allowedProxies` list is empty by default, so a persistent token cannot call
`/v1/proxy/:service` until a provider service or `*` is explicitly granted.

`allowedConnections` belongs only to stored tokens, not to deployment or Runtime policy. Omit the
field on create, or send `[]`, for unrestricted connection access. Updates must send the field so a
PUT cannot drop an existing restriction. A non-empty list grants exact stable, opaque IDs returned
by the connection APIs. Omitting `connectionName` on HTTP, MCP, or proxy requests selects the
target provider's default connection, whose ID must be granted. Denied requests fail before
credential lookup with HTTP `403` / MCP `connection_not_allowed`. Runtime discovery is filtered to
granted credential connections; virtual `no_auth` connections do not require grants. Admin `GET /api/connections` and
`GET /api/actions/:actionId/agent.md` stay unfiltered. Bootstrap runtime tokens and JWTs have no
stored connection grant, so they remain unrestricted.

Example: two GitHub connections (`default` and `work`) and two tokens:

```bash
curl -s -X PUT http://localhost:3000/api/connections/github \
  -H 'content-type: application/json' \
  -d '{"authType":"api_key","values":{"apiKey":"github_pat_default"}}'

curl -s -X PUT http://localhost:3000/api/connections/github \
  -H 'content-type: application/json' \
  -d '{"authType":"api_key","connectionName":"work","values":{"apiKey":"github_pat_work"}}'

curl -s -X POST http://localhost:3000/api/runtime-tokens \
  -H 'content-type: application/json' \
  -d '{"name":"unrestricted","allowedActions":[],"blockedActions":[],"allowedProxies":[]}'

curl -s -X POST http://localhost:3000/api/runtime-tokens \
  -H 'content-type: application/json' \
  -d '{"name":"work-only","allowedActions":[],"blockedActions":[],"allowedProxies":[],"allowedConnections":["<work-connection-id>"]}'
```

The unrestricted token can omit a connection name or send `work`. The work-only token succeeds only
with `x-oo-connector-alias: work`, MCP `connectionName: "work"`, or the equivalent proxy alias; an
omitted name or `default` returns `connection_not_allowed`.

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
- `list_connections`
- `search_actions`
- `get_action_guide`
- `execute_action`

Use `list_connections` to discover configured accounts before selecting one. Both
`get_action_guide` and `execute_action` accept an optional `connectionName`:

`get_action_guide` request:

```json
{
  "actionId": "example.get_record",
  "connectionName": "secondary"
}
```

`execute_action` request:

```json
{
  "actionId": "example.get_record",
  "connectionName": "secondary",
  "input": {
    "recordId": "record-123"
  }
}
```

Omitting `connectionName` uses the `default` connection. A requested named connection must exist;
the runtime does not silently fall back to another account. Connection results expose only safe
account identity fields and never include stored credentials. Persistent tokens with a non-empty
`allowedConnections` list see only those connections in `list_connections` and related discovery;
`list_apps` omits a provider's default connection identity when that connection's ID is not
granted. `get_action_guide` and `execute_action` deny ungranted credential connections before lookup.
Virtual `no_auth` connections remain available.

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

`alias` is the `/v1` name for a named connection. MCP tools use `connectionName` for the same
fact, and HTTP also accepts `connectionName` in the query or JSON body. The default connection is
`default`.

Persistent tokens with a non-empty `allowedConnections` list must be granted the selected stable
connection ID. Omitting the alias selects the target provider's default connection and is denied
unless that connection's ID is listed. The denial is HTTP `403` with `connection_not_allowed` and happens before
credential lookup. `/v1/apps` discovery for that token is filtered to granted credential connections.

Unknown Action ids return `404 unknown_action` on both `/v1` and MCP `execute_action` /
`get_action_guide`. Schema and idempotency-key failures stay `400 invalid_input`.

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

Upload a temporary transit file for Actions that accept a file URL:

```bash
curl -s -X POST http://localhost:3000/api/files \
  -F "file=@./report.pdf"
```

The response includes a `downloadUrl` under `/api/files/:fileId`. The Node runtime stores transit
files under `OOMOL_CONNECT_DATA_DIR/files` by default and can use a shared S3-compatible backend;
see [configuration.md](configuration.md#s3-compatible-transit-files). Transit files are cleaned up
by age.

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

`GET /v1/apps/authenticated` checks the repeated `service` query values and returns the authenticated
service IDs from that candidate set. It returns an empty list when no candidates are supplied.

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

Most proxies run under the same 30 second per-request budget as actions, covering the upstream request
and the response body read. A provider that does not answer in time returns HTTP 500 with `errorCode`
`provider_error` and `data.status` 504. A minority of providers ship a hand-written proxy that keeps
whatever budget it sets for itself, and most of those set none. Use the provider's asynchronous job
endpoints for work that legitimately takes longer.

Deployment and runtime proxy access is controlled by `OOMOL_CONNECT_ALLOWED_PROXIES` and
`OOMOL_CONNECT_BLOCKED_PROXIES`; Action policy does not affect it. Persistent runtime tokens add an
independent `allowedProxies` grant that can only narrow those rules. The requested provider must be
allowed by every configured proxy policy layer and explicitly granted to the persistent token.
An empty token grant denies proxy access, and `OOMOL_CONNECT_BLOCKED_PROXIES="*"` disables provider
proxies entirely. Bootstrap runtime tokens and JWTs have no stored token grant, so only the
deployment and runtime proxy policy applies to them. Persistent token `allowedConnections` is
enforced on `/v1/proxy/:service` the same way as actions: omitted alias uses that provider's
default connection, a non-empty grant is an exact stable-ID allowlist, and ungranted connections
return `403 connection_not_allowed` before lookup. Pure `no_auth` proxies do not require a connection
grant.

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
- `PUT /api/runtime-tokens/:id`
- `DELETE /api/runtime-tokens/:id`
- `GET /api/runs`
- `GET /api/runs/:id`
- `POST /mcp`
- `GET /mcp/tools`
- `GET /openapi.json`

`GET /api/runs` accepts `service`, `actionId`, `caller`, and `ok` filters in addition to cursor pagination.
`caller` identifies the runtime entry point (`http`, `mcp`, or `web`), not an end-user identity. Each run uses
its `executionId` as the stable run ID; `GET /api/runs/:id` returns that single redacted audit record.

Action execution responses include `meta.executionId`, `meta.actionId`, and `meta.auditPersisted` once execution
has started. `auditPersisted: false` means the action result is valid but its audit record could not be stored.
