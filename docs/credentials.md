# Credentials And Local Storage

The local Node runtime stores connections, OAuth client configuration, pending OAuth states, runtime
tokens, recent run logs, and HTTP Action idempotency claims and responses in SQLite. The Cloudflare
Workers runtime stores the same runtime records in D1 and temporary transit files in R2.

By default the database lives at:

```text
./data/connect.sqlite
```

Set `OOMOL_CONNECT_DATA_DIR` to use another directory. The Docker image defaults this to
`/app/data`, which is intended to be mounted as a volume.

- `no_auth` providers are available as virtual connections and do not store secrets.
- `api_key` and `custom_credential` providers store their local secrets in SQLite.
- `oauth2` providers use user-provided OAuth client configuration and a localhost callback URL.

## Encryption

Set `OOMOL_CONNECT_ENCRYPTION_KEY` to encrypt stored credentials, OAuth client configuration, and
completed idempotent Action response payloads:

```bash
OOMOL_CONNECT_ENCRYPTION_KEY="replace-with-a-long-random-secret" npm run dev
```

The runtime uses AES-256-GCM for provider credential records, OAuth client configuration, and the
completed response payload retained for an idempotent HTTP Action retry. The raw `Idempotency-Key`
is never stored; the database contains its hash and a request fingerprint. Claim identifiers,
state, timestamps, and expiry are also stored as unencrypted metadata. The encryption key is not
stored by OpenConnector; if it is lost, encrypted records cannot be recovered.

Without `OOMOL_CONNECT_ENCRYPTION_KEY`, the runtime stays usable for local development and prints a
startup warning. In that mode, credentials, OAuth client configuration, and completed idempotent
Action responses are stored as plaintext. Action responses may contain sensitive provider data, so
treat `connect.sqlite` or D1 as a sensitive data store even after a response is no longer eligible
for replay.

Completed idempotent Action responses remain eligible for replay for 24 hours. Expired idempotency
records are deleted opportunistically when a later idempotent Action request claims a key; the
24-hour replay window is not a guarantee of physical deletion by that deadline.

## Credential Fields

Credential fields are declared by each provider's catalog `auth` metadata. The runtime treats that
metadata as the contract for local API requests:

- `api_key` connections always require `values.apiKey`.
- `api_key` connections may declare additional `extraFields`.
- `custom_credential` connections require exactly the provider-declared `fields`.
- `oauth2` client config may declare additional `clientConfigFields`.

All submitted string values are trimmed. Empty strings are treated as missing. Unknown submitted
fields are rejected instead of being silently stored, because credential forms, scripts, and provider
definitions should fail fast when they drift.

Inspect a provider before writing setup scripts:

```bash
curl -s http://localhost:3000/api/providers/github
```

## Connection Identity

When a provider can cheaply validate credentials against a current-user or current-account endpoint,
its validator stores a stable connection profile:

- `accountId`: provider-side user, workspace, bot, account, or token identifier.
- `displayName`: human-readable account label.
- `grantedScopes`: provider-native scopes granted to the credential, when known.

The runtime exposes this profile in `/api/connections`, MCP action discovery, action agent guides,
and recent run logs. Agents should use it to understand which account an action will run as; raw
provider tokens are never exposed.

Check current connections:

```bash
curl -s http://localhost:3000/api/connections
```

## API Key Connections

Create or replace the default API key connection:

```bash
curl -s -X PUT http://localhost:3000/api/connections/github \
  -H 'content-type: application/json' \
  -d '{"authType":"api_key","values":{"apiKey":"github_pat_..."}}'
```

Create or replace a named API key connection:

```bash
curl -s -X PUT http://localhost:3000/api/connections/github \
  -H 'content-type: application/json' \
  -d '{"authType":"api_key","connectionName":"work","values":{"apiKey":"github_pat_..."}}'
```

The accepted keys are `apiKey` plus the provider's `auth[].extraFields`.

Execute an action with the default connection:

```bash
curl -s -X POST http://localhost:3000/v1/actions/github.get_current_user \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

## Custom Credential Connections

Create or replace the default custom credential connection:

```bash
curl -s -X PUT http://localhost:3000/api/connections/example \
  -H 'content-type: application/json' \
  -d '{"authType":"custom_credential","values":{"host":"localhost","password":"..."}}'
```

The accepted keys come from the provider's `auth[].fields`.

## OAuth2 Connections

OAuth2 providers require your own provider OAuth app. List OAuth-capable providers and copy the
`expectedRedirectUri` for the service:

```bash
curl -s http://localhost:3000/api/oauth/configs
```

Paste that exact callback URL into the provider OAuth app. With the default port, GitHub uses:

```text
http://localhost:3000/oauth/callback
```

If the browser reaches the runtime through another origin, set `OOMOL_CONNECT_ORIGIN` before
starting the runtime:

```bash
OOMOL_CONNECT_ORIGIN="https://your-tunnel.example" npm run dev
```

Then use the new `expectedRedirectUri` returned by `/api/oauth/configs`.

Store the local client configuration:

```bash
curl -s -X PUT http://localhost:3000/api/oauth/configs/github \
  -H 'content-type: application/json' \
  -d '{"clientId":"...","clientSecret":"..."}'
```

Some providers declare additional OAuth client fields in `auth[].clientConfigFields`; send those as
`extra`.

Start authorization:

```bash
curl -s -X POST http://localhost:3000/api/oauth/authorizations \
  -H 'content-type: application/json' \
  -d '{"service":"github"}'
```

Open the returned `authorizationUrl` in a browser. After the provider redirects to the local
callback URL, the runtime stores the OAuth credential as the default connection.

To store the OAuth credential as a named connection, include `connectionName` when starting
authorization:

```bash
curl -s -X POST http://localhost:3000/api/oauth/authorizations \
  -H 'content-type: application/json' \
  -d '{"service":"github","connectionName":"work"}'
```

Protect the local SQLite database like any other file containing API keys or OAuth tokens.

## Selecting A Connection For Execution

The default connection is used when no alias is provided:

```bash
curl -s -X POST http://localhost:3000/v1/actions/github.get_current_user \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

If a named connection already exists, select it with `x-oo-connector-alias`:

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

## Reset And Key Rotation

Reset local runtime data:

```bash
npm run runtime:data -- reset --yes
```

Rotate the local SQLite data-encryption key:

```bash
OOMOL_CONNECT_ENCRYPTION_KEY="old-secret" \
OOMOL_CONNECT_NEW_ENCRYPTION_KEY="new-secret" \
npm run runtime:data -- rotate-key
```

Remove local SQLite data encryption only when you intentionally want plaintext local storage:

```bash
OOMOL_CONNECT_ENCRYPTION_KEY="old-secret" \
npm run runtime:data -- rotate-key --plain
```

Both commands re-encode stored credentials, OAuth client configuration, and completed idempotent
Action response payloads. Idempotency key hashes, request fingerprints, claim state, and timestamps
remain unencrypted metadata.

`runtime:data` is for the local SQLite runtime only. For Cloudflare, back up and restore D1/R2
directly with Cloudflare tooling.

## OAuth Token Refresh

OAuth access tokens are refreshed automatically when they are expired and the provider issued a
refresh token. Refreshed credentials are written back to the local SQLite store, using encryption
when `OOMOL_CONNECT_ENCRYPTION_KEY` is configured.

If a token is expired and no refresh token is available, reconnect the provider from the local
runtime. Providers such as Google may require authorization parameters that request offline access;
provider definitions should include those parameters when refresh tokens are expected.

## Local API Access

The server binds to `127.0.0.1` by default. Set `HOST=0.0.0.0` only when the runtime must be
reachable from outside the local machine or container.

Set an admin bearer token when the admin API or web console is reachable outside your own shell:

```bash
OOMOL_CONNECT_ADMIN_TOKEN="replace-with-an-admin-token" npm run dev
```

Admin clients calling `/api`, `/docs`, or the web console should send:

```text
Authorization: Bearer replace-with-an-admin-token
```

Create runtime tokens for `/v1` and `/mcp` callers from the web console Access tab or
`POST /api/runtime-tokens`. The token is shown once when created; only a hash is stored in SQLite.
Runtime clients should send `Authorization: Bearer oct_...`.

`OOMOL_CONNECT_RUNTIME_TOKEN` is still accepted for bootstrap scripts and backward compatibility.

The bundled web console receives a same-site local cookie from the runtime so it can keep working
when API-token authentication is enabled.

## Action Policy

Use `OOMOL_CONNECT_ALLOWED_ACTIONS` to expose only selected actions to HTTP and MCP execution:

```bash
OOMOL_CONNECT_ALLOWED_ACTIONS="hackernews.*,github.get_current_user" npm run dev
```

Use `OOMOL_CONNECT_BLOCKED_ACTIONS` to deny specific actions even when a broader allowlist includes
them:

```bash
OOMOL_CONNECT_ALLOWED_ACTIONS="github.*" \
OOMOL_CONNECT_BLOCKED_ACTIONS="github.delete_repository" \
npm run dev
```

Provider proxy requests use separate service-level policy variables because `/v1/proxy/:service`
can reach provider API endpoints beyond the curated action catalog. If any action policy is
configured, proxy requests are denied by default unless the service is explicitly allowed:

```bash
OOMOL_CONNECT_ALLOWED_ACTIONS="github.get_current_user" \
OOMOL_CONNECT_ALLOWED_PROXIES="github" \
npm run dev
```

Use `OOMOL_CONNECT_BLOCKED_PROXIES` to deny provider proxies even when `OOMOL_CONNECT_ALLOWED_PROXIES`
contains `*`:

```bash
OOMOL_CONNECT_ALLOWED_PROXIES="*" \
OOMOL_CONNECT_BLOCKED_PROXIES="github" \
npm run dev
```

Action policy entries are comma-separated action ids. A provider-wide wildcard such as `gmail.*`
matches all actions for that provider, and a bare `*` matches every action. Proxy policy entries are
comma-separated provider service names, or `*` for all provider proxies.
