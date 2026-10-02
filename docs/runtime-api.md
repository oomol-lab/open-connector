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

## Provider Triggers

Provider Triggers run through registered server operations:

- `GET /v1/providers/:service/trigger-permissions` returns provider-native permission guidance.
- `POST /v1/providers/:service/triggers/:triggerId/execute` runs `options`, `read`, `reconcile`, `receive`, or `resource`, as supported by the Trigger.

Select a connection with `x-oo-connector-app-id: <stable-connection-id>`. Actions and public proxy also accept this header. If an alias is supplied as well, both selectors must identify the same connection. An unknown ID never falls back to the default account.

Trigger policy is independent of Action and public proxy policy. Deployment and Runtime `allowedTriggers` / `blockedTriggers` accept exact Trigger IDs, `<service>.*`, and `*`. Each nonempty allowlist must match, and any block rule wins. A persistent runtime token additionally needs an explicit `allowedTriggers` grant. Its default is `[]`, including for existing tokens after migration.

A token that can only run one Trigger can be created with:

```bash
curl -s -X POST http://localhost:3001/api/runtime-tokens \
  -H "authorization: Bearer $OOMOL_CONNECT_ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"repository-trigger","allowedActions":[],"blockedActions":["*"],"allowedProxies":[],"allowedTriggers":["github.on_repo_event"],"allowedConnections":["<connection-id>"]}'
```

Trigger-only tokens can perform the provider API calls required by their registered operations without a public proxy grant. Those calls still use the provider's authenticated, SSRF-guarded transport. `allowedConnections` narrows the selected account as it does for Actions.

For Poll Triggers, send `{ "operation": "read", "config": {}, "checkpoint": null }` initially, then pass the returned business checkpoint on later reads. Use `{ "operation": "options", "config": {}, "field": "teamId" }` to read Linear configuration options. Unknown fields, caller-supplied access grants, oversized checkpoints and malformed operations are rejected.

Poll pages contain at most 100 events. Provider page sizes are capped at this limit even when a configured maximum is larger. When `hasMore` is true, continue with the returned checkpoint to drain the next page; sync tokens and high-water marks advance only after the remaining pages are consumed.

Webhook reconciliation uses:

```json
{
  "operation": "reconcile",
  "config": { "owner": "octocat", "repo": "repository", "events": ["issues"] },
  "requestKey": "flow-binding-1",
  "endpointUrl": "https://flow.example/events/callback",
  "active": true
}
```

The response contains an opaque `subscription.id`; remote hook IDs, callback secrets and provider state stay on the server. A request key belongs to one runtime token, connection, provider account and Trigger. Its active configuration and HTTPS callback are immutable. Pass that ID with the same request key, configuration and callback for later reconciliation; `active: false` cancels it. After cancellation the same key can be rebuilt with a fresh callback nonce and secret. An abandoned key requires a new binding key.

`receive` requires `subscriptionId`, HTTP `method`, string `headers` and `query`, base64 `rawBody`, and boolean `admit` / `current`. Header names are normalized. The callback's `connector_subscription` nonce must match, and the provider implementation verifies its own signature or secret. Raw bodies are limited to 64 KiB; the enclosing JSON request is limited to 160 KiB. Open Flow owns public ingress, event scheduling, business checkpoints and deduplication. Feishu shared event ingress stays in Open Flow; its Connector `resource` operation only manages native resource subscriptions and reference counts.

Stateful `reconcile`, `receive`, and `resource` operations require a persistent runtime token. Bootstrap environment tokens, JWT verification and unauthenticated development mode can use policy-permitted `options` / `read`; they do not provide a durable subscription owner. Triggers currently require native local connections. SaaS and Marketplace connections return `trigger_source_not_supported` without attempting a local fallback.

Administrators can inspect `/api/trigger-subscriptions`, cancel with `POST /api/trigger-subscriptions/:id/cancel`, or explicitly stop automatic cleanup with `POST /api/trigger-subscriptions/:id/abandon`. Subscription IDs must be URL-encoded. Abandonment retains the original ownership and uncleaned remote-resource record; it does not claim the provider resource was deleted. Clean the remote resource manually if automatic deletion cannot recover.

Node maintenance runs in the runtime and stops on `close()`. Workers invoke bounded maintenance batches from the configured scheduled handler. Maintenance checks current token, deployment and Runtime grants, and retries deletion after revocation; normal active subscription reconciliation remains the Open Flow scheduler's responsibility. SQLite, PostgreSQL and D1 share encrypted subscription state and SQL leases. A stale lease cannot commit state. Apply PostgreSQL migrations before starting the runtime.

Disconnecting or replacing a connection with active or deleting subscriptions is rejected. Verified same-provider-account reauthorization can restore credentials for cleanup; changing to a different or unverified account cannot take over the old resources. OAuth refresh continues through the existing refresh path. After cleanup or explicit abandonment, the connection can be disconnected.

For token rotation, first disable and publish affected Open Flow Triggers while the old token is still valid, wait for subscription and Feishu resource cleanup, and inspect subscription status. Then switch the token and explicitly rebuild bindings while preserving business checkpoints. Old subscription IDs belong to the old token. Clear Feishu resource readiness through its normal demand release and cleanup before switching. Event delivery may have a gap during rotation.

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

### OAuth Authorization Requests

Create an authorization request with `POST /v1/connections/:service/connect`, or reconnect a
saved connection with `POST /v1/connections/by-id/:appId/connect`. New connections use the
configured OAuth source; reconnecting preserves the saved connection's source. A SaaS source
uses its configured provider configuration and rejects per-request OAuth overrides.

Poll `GET /v1/connection-requests/:connectionRequestId` with the administrator Bearer token
that owns the request. For SaaS authorization, an explicit valid administrator Bearer token
allows this GET to query the remote result and commit the local connection. Cookie-only GETs
and GETs in a local installation without authentication only read the stored result. An invalid
Bearer token never falls back to a valid cookie. Poll no faster than once every two seconds and
honor `Retry-After`; transient upstream failures do not permanently fail the authorization.

The browser completion page uses authenticated
`POST /api/oauth/connection-requests/:connectionRequestId/sync` with `Content-Type: application/json`,
`X-OpenConnector-Request: sync`, and an `Origin` matching the explicitly configured public origin.
Its initial GET is read-only. An SDK flow without a browser management session completes through
Bearer polling. Authorization results and completion responses use `Cache-Control: private, no-store`.

SaaS receives only the configured HTTP(S) completion URL. The caller's final `returnUri`, including
a native application's custom scheme, stays in Connect and is returned to the browser only after
a terminal local result. URL parameters on the completion page cannot declare authorization success.
`connected` means the local connection has been committed; a late result cannot restore a deleted
connection or overwrite a newer reconnect.

If creating the remote authorization has an uncertain outcome, Connect reports
`oauth_source_result_unknown` with `data.connectionRequestId`. It does not automatically repeat
the link request. Inspect the request and resolve any unknown remote account manually before
starting a replacement authorization. Known cleanup references are saved for cleanup processing.

Project configuration, Console source selection, setup field semantics and recovery steps are
documented in [SaaS OAuth](saas-oauth.md). Console starts named configured requests through
POST /api/oauth/connection-requests; SDK clients continue using the /v1 endpoints above.

### SaaS Connection Execution

A saved SaaS connection sends action and proxy requests through its bound project and exact
provider configuration, user and account identifiers. Changing the default OAuth source does
not change existing connections. Runtime policy, connection grants and local input validation
run before remote discovery or execution. The runtime checks the selected configuration's
capabilities without removing actions from the global catalog. It does not load local provider
executors or refresh local OAuth credentials for a SaaS connection, and does not fall back to
another connection after a failure.

Action responses keep the usual action output in `data`. The local `meta.executionId` stays
unchanged; `meta.remoteExecutionId` identifies the SaaS execution when available and is also
stored in the action run log. Proxy responses keep the provider's `status`, `headers` and `data`
inside the normal response `data` object. An outer HTTP 200 means the proxy completed; the
provider status can still be 404 or another non-success status. SaaS proxy metadata contains
distinct local and remote execution IDs.

SaaS proxy accepts GET, POST, PUT, PATCH and DELETE, primitive query values (string, finite
number, boolean or null), string non-authentication headers, and JSON or text request bodies.
HEAD, `accessGrant`, unknown request fields, array/object query values, binary bodies and
non-finite numbers are rejected before contacting SaaS. Local `alias` and `connectionName`
selectors remain supported. Responses support JSON and UTF-8 text; explicitly unsupported
media types or charsets are rejected, and SaaS responses do not acquire a `bodyEncoding` field.

Each SaaS execution POST has a **300-second** budget covering the HTTP request and response
body, subject to earlier caller cancellation or a shorter provider/deployment timeout.
Capability discovery uses the separate 30-second management budget. The complete decoded
JSON execution response, including errors, is limited to **64 MiB**. This accommodates a
10 MiB text payload even when JSON escaping expands it to about 60 MiB; it does not promise
unlimited provider output. Management and discovery responses retain their 4 MiB limit.

Business errors such as `invalid_input`, `scope_missing`, `credential_expired`,
`insufficient_credit` and `rate_limited` keep distinct codes with sanitized messages.
Rejected project keys use `oauth_source_unauthorized`; incompatible responses use
`oauth_source_protocol_error`; oversized execution responses use `oauth_source_response_too_large`.
HTTP 429 preserves a valid `Retry-After`, including when replaying a stored idempotent action result.

Timeouts, lost responses and cancellations never automatically replay action or proxy POSTs.
A cancelled call reports `execution_cancelled`, but SaaS or the provider may already have
completed the operation. Local idempotency prevents repeat dispatch through its existing
recorded request boundary; it does not guarantee exactly-once execution across the network.

SaaS deletion is asynchronous after local removal. Scheduling, key-error pause recovery and
offline clone reset procedures are documented in [SaaS maintenance](saas-maintenance.md).

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

The HTTP request examples in the guide use the runtime's public origin (`OOMOL_CONNECT_ORIGIN`, see
[configuration.md](configuration.md)). The MCP `get_action_guide` tool returns the same guide with
an `execute_action` example instead of HTTP requests.

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
- `DELETE /api/connections/:service` — deletes the stored credential and, by default, leaves the grant
  standing at the provider. With `revoke: true` in the JSON body, an OAuth connection of a provider that
  declares a `revocationUrl` has its token posted there (RFC 7009) once the delete has gone through, best
  effort; the answer's `revoked` says `done`, `failed` (the provider refused or could not be reached; the
  credential is deleted all the same), `unsupported` (no `revocationUrl` declared, no OAuth token held, or a
  SaaS connection) or `skipped` (the body did not ask).
  Revocation may also invalidate related connections. For Google, it removes the user's granted scopes
  for the project and invalidates tokens for all OAuth clients registered under that project; it is not
  limited to the selected connection or client. See [Google's token revocation documentation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke).
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
