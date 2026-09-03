# Configuration

Managed provider actions can be configured through the [Connector Marketplace](marketplace.md). Marketplace API keys use the same optional `OOMOL_CONNECT_ENCRYPTION_KEY` protection as other stored credentials.

OpenConnector is configured with environment variables.

| Variable                                    | Default                   | Purpose                                                                                                                                                                     |
| ------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                      | `3000`                    | Local HTTP server port.                                                                                                                                                     |
| `HOST`                                      | `127.0.0.1`               | Bind address. Docker image sets `0.0.0.0`.                                                                                                                                  |
| `OOMOL_CONNECT_ORIGIN`                      | `http://localhost:<PORT>` | Public origin used for OAuth redirect URLs.                                                                                                                                 |
| `OOMOL_CONNECT_DATA_DIR`                    | `./data`                  | SQLite database, local transit files, and Node upload staging. Docker uses `/app/data`.                                                                                     |
| `OOMOL_CONNECT_DATABASE_URL`                | unset                     | PostgreSQL connection URL. When unset, the Node runtime uses SQLite under the data directory.                                                                               |
| `OOMOL_CONNECT_DATABASE_POOL_MAX`           | `10`                      | Maximum PostgreSQL connections per Node runtime instance.                                                                                                                   |
| `OOMOL_CONNECT_DATABASE_CONNECT_TIMEOUT_MS` | `10000`                   | PostgreSQL connection timeout in milliseconds.                                                                                                                              |
| `OOMOL_CONNECT_ENCRYPTION_KEY`              | unset                     | Encrypts credentials, Marketplace API keys, OAuth config, pending OAuth state, and completed idempotent Action responses. When unset, these values are stored in plaintext. |
| `OOMOL_CONNECT_NEW_ENCRYPTION_KEY`          | unset                     | New key used by `runtime:data rotate-key`.                                                                                                                                  |
| `OOMOL_CONNECT_ADMIN_TOKEN`                 | unset                     | Requires bearer-token auth for local admin API, docs, and web console.                                                                                                      |
| `OOMOL_CONNECT_RUNTIME_TOKEN`               | unset                     | Optional bootstrap runtime bearer token for `/v1` and MCP callers.                                                                                                          |
| `OOMOL_CONNECT_ALLOWED_CUSTOM_OAUTH`        | unset                     | Enables connection-scoped OAuth apps for `*` or a comma-separated service list.                                                                                             |
| `OOMOL_CONNECT_JWKS_URI`                    | unset                     | Node-only JWKS endpoint for validating runtime JWT access tokens.                                                                                                           |
| `OOMOL_CONNECT_JWT_ISSUER`                  | unset                     | Expected `iss` claim for runtime JWT access tokens.                                                                                                                         |
| `OOMOL_CONNECT_JWT_AUDIENCE`                | unset                     | Expected API `aud` claim for runtime JWT access tokens.                                                                                                                     |
| `OOMOL_CONNECT_ALLOWED_ACTIONS`             | unset                     | Comma-separated executable action allowlist. Supports `service.*` and `*`.                                                                                                  |
| `OOMOL_CONNECT_BLOCKED_ACTIONS`             | unset                     | Comma-separated executable action denylist. Supports `service.*` and `*`.                                                                                                   |
| `OOMOL_CONNECT_ALLOWED_PROXIES`             | unset                     | Comma-separated provider proxy allowlist. Supports service names and `*`.                                                                                                   |
| `OOMOL_CONNECT_BLOCKED_PROXIES`             | unset                     | Comma-separated provider proxy denylist. Supports service names and `*`.                                                                                                    |
| `OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK`       | `false`                   | Allow self-hosted provider connections to target private networks. See below.                                                                                               |
| `OOMOL_CONNECT_EGRESS_TRUSTED_HOSTS`        | unset                     | Trusted hosts routed through a corporate VPN. See below.                                                                                                                    |
| `OOMOL_CONNECT_LOG_LEVEL`                   | `info`                    | Pino log level for the local Node server.                                                                                                                                   |
| `OOMOL_CONNECT_TRANSIT_FILE_BACKEND`        | `local`                   | Node transit-file backend: `local` or `s3`.                                                                                                                                 |
| `OOMOL_CONNECT_TRANSIT_FILE_TTL_SECONDS`    | `86400`                   | Transit file lifetime before cleanup.                                                                                                                                       |
| `OOMOL_CONNECT_TRANSIT_FILE_MAX_BYTES`      | `104857600`               | Maximum transit file upload size.                                                                                                                                           |
| `OOMOL_CONNECT_S3_BUCKET`                   | unset                     | Bucket used when the Node transit-file backend is `s3`.                                                                                                                     |
| `OOMOL_CONNECT_S3_REGION`                   | `us-east-1`               | S3 signing region. Use the value required by the storage service.                                                                                                           |
| `OOMOL_CONNECT_S3_ENDPOINT`                 | AWS S3                    | S3-compatible endpoint for MinIO, Cloudflare R2, Alibaba Cloud OSS, or another object store.                                                                                |
| `OOMOL_CONNECT_S3_FORCE_PATH_STYLE`         | `false`                   | Use path-style S3 URLs. This is commonly required by local MinIO deployments.                                                                                               |
| `OOMOL_CONNECT_S3_ACCESS_KEY_ID`            | SDK credential chain      | Explicit S3 access key ID. Configure it with the secret key, or omit both.                                                                                                  |
| `OOMOL_CONNECT_S3_SECRET_ACCESS_KEY`        | SDK credential chain      | Explicit S3 secret access key. Configure it with the access key ID, or omit both.                                                                                           |
| `OOMOL_CONNECT_S3_SESSION_TOKEN`            | unset                     | Optional session token used with explicit S3 credentials.                                                                                                                   |
| `OOMOL_CONNECT_RUN_LIMIT`                   | `5000`                    | Maximum number of recent action run audit records to retain.                                                                                                                |
| `OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS`        | `false`                   | Read action JSON schemas from the catalog files on demand instead of keeping them in memory. See below.                                                                     |

Example:

```bash
OOMOL_CONNECT_DATA_DIR="$PWD/data" \
OOMOL_CONNECT_ENCRYPTION_KEY="replace-with-a-long-random-secret" \
OOMOL_CONNECT_ADMIN_TOKEN="replace-with-an-admin-token" \
OOMOL_CONNECT_ALLOWED_ACTIONS="hackernews.*,github.get_current_user" \
OOMOL_CONNECT_ALLOWED_PROXIES="github" \
npm run dev
```

Create persistent runtime tokens from the web console Access tab or `POST /api/runtime-tokens`.
Only token hashes are stored: the Node server stores persistent-token records in its selected SQLite
or PostgreSQL database, while
Cloudflare Workers store them in D1. Persistent tokens have independent Action rules, provider
proxy grants, and optional connection grants. A new token has no proxy access until its
`allowedProxies` includes a provider service or `*`; those grants can only narrow the deployment
and runtime proxy policy. `allowedConnections` is omitted or `[]` for unrestricted connection
access and is not a deployment setting: there is no `OOMOL_CONNECT_ALLOWED_CONNECTIONS` variable.
A non-empty list grants exact stable, opaque IDs returned by the connection APIs. Include the
default connection's ID if unnamed HTTP, MCP, or proxy requests should succeed. Virtual `no_auth`
connections do not require a grant. Create requests may omit the field; updates must send
`allowedConnections` so a PUT cannot drop an existing restriction.
`OOMOL_CONNECT_RUNTIME_TOKEN` remains available for bootstrap scripts and backward compatibility.
Because the bootstrap token has no stored policy, its proxy access is controlled by the deployment
and runtime rules, while its connection access remains unrestricted.

## Runtime database

The Node runtime uses `OOMOL_CONNECT_DATA_DIR/connect.sqlite` by default and applies SQLite
migrations automatically when it opens the database. Leave `OOMOL_CONNECT_DATABASE_URL` unset to
keep this zero-configuration mode.

Set a `postgres:` or `postgresql:` connection URL to use PostgreSQL 15 or newer instead:

```bash
OOMOL_CONNECT_DATABASE_URL="postgresql://open_connector:password@db.example.com:5432/open_connector?sslmode=verify-full" \
npm run runtime:migrate

OOMOL_CONNECT_DATABASE_URL="postgresql://open_connector:password@db.example.com:5432/open_connector?sslmode=verify-full" \
npm start
```

PostgreSQL migrations are explicit: run `npm run runtime:migrate` before the first server start and
before starting a new application version that includes pending migrations. The server performs a
read-only schema check and refuses to start with an actionable error when required migrations are
missing. It never applies PostgreSQL DDL during startup.

The migration command and application may use different database roles. The migration role needs
permission to create and alter runtime tables and indexes. The application role needs CRUD access to
the runtime tables plus `SELECT` access to `runtime_migrations`; it does not need DDL permission.
Treat both connection URLs as secrets and use a TLS-verifying connection configuration for remote
databases.

Each process selects exactly one backend. PostgreSQL and SQLite are not synchronized, and selecting
PostgreSQL does not import an existing `connect.sqlite` database. Removing the URL makes the runtime
use the existing SQLite database again.

For multiple Node instances, configure the same PostgreSQL database and
`OOMOL_CONNECT_ENCRYPTION_KEY` on every instance. Also use the S3-compatible transit-file backend so
files are shared across instances. Size `OOMOL_CONNECT_DATABASE_POOL_MAX` so the total across all
instances leaves capacity for migrations and database administration.

## JWT access tokens

The Node server can validate JWT access tokens issued by an existing identity provider for `/v1/*`
and `/mcp`. Configure all three settings together:

```bash
OOMOL_CONNECT_JWKS_URI="https://idp.example.com/oauth2/jwks" \
OOMOL_CONNECT_JWT_ISSUER="https://idp.example.com" \
OOMOL_CONNECT_JWT_AUDIENCE="https://connect-api.example.com" \
npm run dev
```

`OOMOL_CONNECT_JWKS_URI` must be the direct HTTPS JWKS endpoint, not an OIDC discovery URL. Plain
HTTP is accepted only for loopback endpoints used during local development. `OOMOL_CONNECT_JWT_AUDIENCE`
should identify this API resource, not a web application's OIDC client. OpenConnector requires an
expiration claim and validates the JWT signature, issuer, audience, expiration, and not-before time.
Clients send the access token as `Authorization: Bearer <jwt>`.

JWT authentication is additive: the bootstrap runtime token and persistent `oct_...` tokens remain
valid when JWT verification is configured. For a JWT-only deployment, leave
`OOMOL_CONNECT_RUNTIME_TOKEN` unset and revoke any persistent runtime tokens. JWTs do not grant
access to the admin API, docs, or web console, so configure `OOMOL_CONNECT_ADMIN_TOKEN` separately
before exposing those surfaces.

OpenConnector acts only as a resource server. It does not implement OIDC discovery or login, accept
ID tokens as API credentials, or map JWT claims to action and proxy policy. JWT verification is
currently available only on the Node server, not Cloudflare Workers.

## S3-compatible transit files

The Node runtime stores transit files under `data/files` by default. Set
`OOMOL_CONNECT_TRANSIT_FILE_BACKEND=s3` to share transit files across multiple Node or Docker
instances through AWS S3 or an S3-compatible service such as MinIO, Cloudflare R2, or Alibaba Cloud
OSS:

```bash
OOMOL_CONNECT_TRANSIT_FILE_BACKEND=s3 \
OOMOL_CONNECT_S3_BUCKET=open-connector-transit-files \
OOMOL_CONNECT_S3_REGION=us-east-1 \
OOMOL_CONNECT_S3_ENDPOINT=http://minio:9000 \
OOMOL_CONNECT_S3_FORCE_PATH_STYLE=true \
npm start
```

`OOMOL_CONNECT_S3_BUCKET` is required for the S3 backend. The endpoint is optional for AWS S3 and
required for other S3-compatible services. Configure `OOMOL_CONNECT_S3_ACCESS_KEY_ID` and
`OOMOL_CONNECT_S3_SECRET_ACCESS_KEY` together through a secret manager or deployment secret
configuration, or omit both to use the AWS SDK credential chain. Instance, task, and pod roles
therefore continue to work on AWS without explicit credentials.

For Cloudflare R2, use the account S3 endpoint and set the region to `auto`. For Alibaba Cloud OSS,
use its S3-compatible endpoint (`https://s3.oss-<region>.aliyuncs.com`), set the matching region, and
leave path-style access disabled. MinIO commonly uses its server URL as the endpoint with
`OOMOL_CONNECT_S3_FORCE_PATH_STYLE=true`.

Uploads and downloads continue to use `/api/files`; the bucket does not need to be public. All
instances must use the same bucket and S3 settings. The runtime rejects expired files when they are
read, but it does not scan the bucket. Configure a bucket lifecycle rule that deletes objects under
the `transit/` prefix after the configured transit-file TTL so unread expired objects are also
removed.

Each S3 transit file uses one object. Its original file name is encoded in S3 user metadata, while
the content type, size, and modification time come from the object's native S3 fields. There is no
separate metadata sidecar object in the S3 backend.

On Node, multipart uploads to `/api/files` are streamed into
`OOMOL_CONNECT_DATA_DIR/tmp/transit-files` before they are moved into local storage or streamed to
S3 with a known content length. The staging file is removed after success or failure, so upload
memory stays bounded by stream buffers instead of file size. A hard process termination can leave a
partial staging file; startup removes managed staging files older than the configured transit-file
TTL. Ensure each instance has enough local disk for its concurrent in-progress uploads even when S3
is the final backend.

## Private network access

By default OpenConnector applies a public-only SSRF guard to every user-supplied
URL, including self-hosted provider instance URLs (for example the Dokploy
**Instance URL**). Connections may therefore only target public addresses, and
private targets are rejected during connection setup.

Some self-hosted services are only reachable over a LAN or an overlay network
such as Tailscale or NetBird. To allow those connections, set
`OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK=true`. When enabled, connections for the
self-hosted providers that opt in (**Dokploy**, **n8n**, **GitLab**,
**Gitea**, **Home Assistant**, **IMAP Mailbox**, and others) may target:

- RFC 1918 ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- Carrier-grade NAT / shared address space `100.64.0.0/10` (Tailscale, NetBird)
- Private hostname suffixes: `.local`, `.internal`, `.home`, `.lan`
- Plain `http://` instance URLs, for providers that otherwise require HTTPS

The following targets stay blocked even when the flag is enabled:

- Loopback and localhost (`127.0.0.0/8`, `localhost`, `.localhost`)
- Link-local and cloud metadata (`169.254.0.0/16`, `100.100.100.200/32`, and
  metadata hostnames such as `metadata.google.internal`)
- Reserved, multicast, and broadcast ranges, and all IPv6 targets

> **Enable this only on a single-tenant, self-hosted runtime that you operate.**
> On a shared or multi-tenant deployment, turning it on lets any connection
> owner reach the operator's internal network from the runtime's egress
> position, so leave it at the `false` default there.

### Corporate VPN host exceptions

Some corporate VPNs map public SaaS domains into private or benchmark address
space such as `198.18.0.0/15`. If those requests are rejected by the egress
guard, list the trusted domains in `OOMOL_CONNECT_EGRESS_TRUSTED_HOSTS`:

```bash
OOMOL_CONNECT_EGRESS_TRUSTED_HOSTS=".feishu.cn,.larksuite.com" npm run dev
```

An entry starting with `.` matches the domain and its subdomains; any other
entry matches one exact hostname. The exception allows matching hosts to use
private and VPN-mapped addresses, but loopback, link-local, cloud-metadata,
multicast, and other unsafe special-use targets remain blocked.

> **Enable this only on a single-tenant or otherwise trusted runtime.** This is
> a deployment-wide egress exception, not per-connection authorization. Keep
> entries narrowly scoped to domains you trust.

## Lazy catalog schemas

The generated catalog ships one JSON file per provider, and the `inputSchema` and `outputSchema` of
their actions are most of those bytes. The server keeps the whole catalog in memory, which is the
largest allocation it makes and the one that matters on a 256 MB class machine such as the Helm
chart's default `256Mi` request or a small Fly machine.

Set `OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS=true` to keep those schemas on disk instead:

```bash
OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS=true npm run dev
```

Action metadata stays in memory: ids, names, descriptions, required scopes, provider permissions,
follow-up and async lifecycle links, and execution flags. Only the two schema fields are read back
from the provider file when something asks for them, and the schemas of the eight most recently
used provider files stay cached. Responses are byte-identical to the default mode, so this is a
memory-for-reads trade and not an API change.

What changes operationally:

- The catalog directory must stay readable while the server runs. Replacing or deleting it under a
  running server makes later schema reads fail. The single-file executable reads the catalog from
  its own embedded filesystem, so it needs nothing extra.
- Reading or running one action reads one provider file. `GET /api/actions`, which serializes every
  action, and action search across many services re-read files as they go.
- This is a Node and single-binary setting. Cloudflare Workers load the catalog from asset chunks
  and ignore it.

## Cloudflare Workers

Cloudflare uses the same environment variable names for origin, static auth tokens, execution
policy, transit file limits, and data encryption. The JWT settings above, `PORT`, `HOST`,
`OOMOL_CONNECT_DATA_DIR`, and `OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS` are Node-only settings.

The Worker runtime also requires these bindings in `wrangler.local.jsonc`. Copy
`wrangler.example.jsonc` to `wrangler.local.jsonc` and fill in your own Cloudflare resource IDs
before running Wrangler commands.

- `DB`: D1 database for connections, OAuth config/state, runtime tokens, run logs, and idempotency
  claims and responses.
- `TRANSIT_FILES`: R2 bucket or Workers KV namespace for temporary transit files.
- `ASSETS`: Workers Static Assets binding for the web console.

R2 is the default transit-file backend. To use Workers KV, bind the KV namespace as
`TRANSIT_FILES` and set the Wrangler variable `TRANSIT_FILES_BACKEND` to `"kv"`. Configure exactly
one R2 bucket or KV namespace with that binding name. KV limits each file to 25 MiB, clamps the
transit-file TTL to a minimum of 60 seconds, and deletes expired files automatically.

Set secrets with Wrangler instead of committing them to config:

```bash
npx wrangler secret put OOMOL_CONNECT_ADMIN_TOKEN --config wrangler.local.jsonc
npx wrangler secret put OOMOL_CONNECT_ENCRYPTION_KEY --config wrangler.local.jsonc
```
