# Connector Marketplace

OOMOL Connect can expose managed provider actions as virtual connections. Configure one active Marketplace deployment from the local console or the admin API. The default discovery URL is:

```text
https://connector.oomol.com/.well-known/oomol-connector-marketplace
```

When `OOMOL_CONNECT_ENCRYPTION_KEY` is configured, Connect encrypts the Marketplace API key at rest. Without it, the API key is stored in plaintext, matching the local runtime's behavior for other credentials. Plaintext storage is convenient for local testing, but deployments whose runtime database is accessible to other users should configure encryption.

At startup, Connect fetches discovery once, validates the API key once, intersects the remote action allowlist with its local catalog, and keeps that snapshot for action execution. Discovery or authentication failures do not prevent the rest of the server from starting.

Before connecting, you can browse official OOMOL applications without an API key. After a successful connection, the console shows the selected Marketplace's compatible services and enable/disable controls. Changing the discovery URL requires a new API key; removing the connection returns to the official directory. Official discounts do not apply to custom Marketplaces.

## Public API contract

Marketplace v1 consists of three HTTP endpoints:

```text
GET  /.well-known/oomol-connector-marketplace
POST {validate}
POST {endpoint}/{actionId}
```

Discovery is public and returns JSON in this shape:

```json
{
  "version": 1,
  "id": "oomol",
  "name": "OOMOL Marketplace",
  "pricing": "metered",
  "validate": "/v1/marketplace/validate",
  "endpoint": "/v1/marketplace/actions",
  "actions": ["tinypng.shrink_image", "tinypng.output_image"]
}
```

- `version` is the integer `1`.
- `id` is a stable Marketplace identifier and `name` is its display name.
- `pricing` is either `free` or `metered`. It is informational; the Marketplace owns pricing and credit rules.
- `validate` and `endpoint` are path-absolute references beginning with `/`. They cannot contain a scheme, host, user information, query, or fragment, and are resolved against the discovery URL origin.
- `actions` is the complete, unpaginated allowlist of unique `<service>.<action>` IDs.
- Clients reject discovery redirects and responses larger than 4 MiB after decompression.

API key validation sends an empty authenticated request:

```http
POST /v1/marketplace/validate
Authorization: Bearer <marketplace-api-key>
Content-Length: 0
```

`204 No Content` means the key is valid and authorized. `401` means invalid, expired, or revoked; `403` means the caller is not permitted; `429` means rate limited; and `5xx` means temporarily unavailable. Failures use the normal Connector error envelope.

Action execution uses the full action ID in the path and only the ordinary Connector input in the body:

```http
POST /v1/marketplace/actions/tinypng.shrink_image
Authorization: Bearer <marketplace-api-key>
Content-Type: application/json

{"input":{"imageUrl":"https://example.com/image.png"}}
```

Success and failure use the normal Connector action envelopes. The success `meta` includes `executionId` and `actionId`; failure status codes and `errorCode` values follow Connector execution semantics. A Marketplace must authenticate the key, re-check its current allowlist and input schema, resolve its managed credential, and return the execution ID used for support and metering.

## Admin API

The local admin API provides:

```text
GET    /api/marketplace
GET    /api/marketplace/official-catalog
PUT    /api/marketplace
PATCH  /api/marketplace
DELETE /api/marketplace
GET    /api/provider-preferences
PATCH  /api/provider-preferences/:service
```

Create or replace the configuration with:

```json
{
  "discoveryUrl": "https://connector.oomol.com/.well-known/oomol-connector-marketplace",
  "apiKey": "...",
  "enabled": true
}
```

`PATCH` may omit the API key to retain the encrypted stored value. The first successful discovery creates an enabled preference for each compatible provider; later discovery does not overwrite an existing preference.

## Virtual connections

Each enabled compatible provider gets one virtual connection named `marketplace_<marketplace-id>`, for example `marketplace_oomol`. Its stable ID is `marketplace:<marketplace-id>:<service>`. It participates in runtime-token `allowedConnections` checks like a stored connection, but the Marketplace API key is never placed in provider credentials or returned by connection APIs.

Without an explicit `connectionName`, Connect chooses a stored `default` connection first, then a local `no_auth` connection, then the provider's Marketplace connection. After selection, Connect verifies that the chosen Marketplace connection supports the requested action. An explicit and an implicit selection therefore have the same action-binding behavior.

Remote execution sends only the action ID, `{ "input": ... }`, and the Marketplace bearer key. Local connection IDs, names, runtime token IDs, and provider credentials are not forwarded.
