# Programmatic connections

The `/v1/connections` and `/v1/connection-requests` endpoints provide personal connection
management through the same HTTP paths and envelopes as OOMOL Hosted Connector. They support
OAuth authorization, polling one authorization attempt, connection details, and synchronous
API-key or custom-credential creation and replacement.

## Authentication

Use the local administrator bearer token (`OOMOL_CONNECT_ADMIN_TOKEN`) to manage connections.
Execution-only runtime tokens and runtime JWTs do not grant management access. A fresh instance
with neither administrator nor runtime authentication configured accepts local management
requests without a token. Once runtime authentication is configured, configure an administrator
token before using these endpoints.

The open runtime has one administrator identity; its bearer token and authenticated console
session act as that same identity. It does not require Hosted Team headers. Hosted deployments
apply their own user and Team management permissions.

`GET /v1/apps` remains execution discovery and applies execution access policies.
`GET /v1/connections` returns the administrator's stored connections, including connections
hidden from execution discovery. It excludes virtual no-auth and Marketplace entries.

## Start and track OAuth

Configure your provider's OAuth client through the console or `/api/oauth/configs/:service`
first. The registered callback URL remains `/oauth/callback` on this runtime.

```sh
curl -sS -X POST http://localhost:3000/v1/connections/github/connect \
  -H "Authorization: Bearer $OOMOL_CONNECT_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

The success envelope contains:

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "authorizationUrl": "https://github.com/login/oauth/authorize?...",
    "stateHandle": "oauth-state-id",
    "connectionRequestId": "request-id",
    "status": "initiated",
    "expiresAt": "2026-09-07T10:10:00.000Z"
  },
  "meta": {}
}
```

Open `authorizationUrl` in a browser and save `connectionRequestId`. The state handle belongs
to the OAuth callback and is not the result-query identifier.

```sh
curl -sS http://localhost:3000/v1/connection-requests/request-id \
  -H "Authorization: Bearer $OOMOL_CONNECT_ADMIN_TOKEN"
```

The result's `data` has `connectionRequestId`, `service`, `status`, `appId`, `errorCode`,
`errorMessage`, `expiresAt`, `createdAt`, and `updatedAt`. Creation and update times are Unix
milliseconds; `expiresAt` is an ISO timestamp. `appId` and the error fields are nullable.

| Status      | Meaning                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------- |
| `initiated` | Authorization has not reached a terminal result. Poll again, for example after two seconds. |
| `connected` | This attempt saved its connection. Use its exact `appId` and stop polling.                  |
| `failed`    | Authorization failed or was denied. Inspect the safe error fields and stop polling.         |
| `expired`   | The ten-minute authorization window elapsed without a terminal result.                      |

A callback must begin before `expiresAt`. A callback already processing may finish after that
time and change an expired view to a connected or failed result. Success and failure remain
queryable until `expiresAt` plus 24 hours. Missing or expired-retention results return HTTP 404
with `connection_request_not_found`. Results use `Cache-Control: private, no-store` and never
include credentials or raw provider errors.

Starting another request for the same provider supersedes earlier requests that have not
started processing, returning `failed` with `request_superseded`. A callback already processing
continues. Repeated callbacks do not overwrite terminal results.

OAuth inputs can include:

- `returnUri`: optional `http:`, `https:`, or `oomol:` URL. The callback adds `status` and `service`,
  and safe `code` and `message` fields on failure.
- `authorizationOptionIds`: provider-declared option IDs. GitHub and Slack expose selectable
  provider-native scopes in their OAuth definitions. Required options are always included.
  Omission preserves the configured scopes; unknown options or options on unsupported providers
  return `invalid_input`. `requires` describes selection dependencies for clients; the server
  preserves the explicitly selected options and required options.
- `extra` and `secretExtra`: provider-declared OAuth configuration fields, merged for this
  authorization attempt without changing the saved client configuration.

## Inspect and reconnect

```http
GET /v1/connections
GET /v1/connections?status=active
GET /v1/connections/by-id/:appId
POST /v1/connections/by-id/:appId/connect
```

A successful OAuth request records the outcome of that attempt. Query connection details for
its current state. An expired OAuth credential with no refresh token reports `reauth_required`.

Reconnection takes the same OAuth body and returns a new request ID. Success keeps the original
`appId`. If the original connection is deleted or its credentials change during authorization,
the stale callback fails instead of recreating it or overwriting the replacement.

New connections receive distinct local aliases. Use the returned `alias` as the connection
selector when executing actions. Existing local default-connection selection remains available.

## API keys and custom credentials

These operations validate and save credentials synchronously. They return the connection in the
success envelope and do not require polling.

```http
POST /v1/connections/:service/connect/api-key
POST /v1/connections/by-id/:appId/connect/api-key
```

Body: `{ "apiKey": "...", "extra": { "field": "value" }, "comment": "Optional note" }`.
`extra` and `comment` are optional.

```http
POST /v1/connections/:service/connect/custom-credential
POST /v1/connections/by-id/:appId/connect/custom-credential
```

Body: `{ "values": { "field": "value" }, "comment": "Optional note" }`.
`comment` is optional; use `null` to clear an existing note. Replacement retains the connection
ID, requires the existing credential type, and does not discard existing credentials when
validation fails or a concurrent update wins.

The OpenAPI document at `/openapi.json` describes the request and response envelopes. The local
console's `/api/connections` and `/api/oauth/authorizations` endpoints continue to work.

## Persistence

Migration `0013_connection_requests.sql` stores authorization attempts on SQLite, PostgreSQL,
and Cloudflare D1. SQLite applies it through the existing startup migrations. PostgreSQL and D1
use their existing deployment migration commands; migrate before starting the new runtime.

The pending OAuth snapshot uses the configured secret codec and participates in secret rotation.
A connection write and its successful request result commit together. D1 uses transactional
[`batch()`](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) for these writes;
SQLite and PostgreSQL use their native transactions. Expired retained records are cleaned up
when new requests are created.
