# Configuration

OpenConnector is configured with environment variables.

| Variable                                 | Default                   | Purpose                                                                        |
| ---------------------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| `PORT`                                   | `3000`                    | Local HTTP server port.                                                        |
| `HOST`                                   | `127.0.0.1`               | Bind address. Docker image sets `0.0.0.0`.                                     |
| `OOMOL_CONNECT_ORIGIN`                   | `http://localhost:<PORT>` | Public origin used for OAuth redirect URLs.                                    |
| `OOMOL_CONNECT_DATA_DIR`                 | `./data`                  | Directory containing `connect.sqlite`. Docker image sets `/app/data`.          |
| `OOMOL_CONNECT_ENCRYPTION_KEY`           | unset                     | Encrypts credentials, OAuth config, and completed idempotent Action responses. |
| `OOMOL_CONNECT_NEW_ENCRYPTION_KEY`       | unset                     | New key used by `runtime:data rotate-key`.                                     |
| `OOMOL_CONNECT_ADMIN_TOKEN`              | unset                     | Requires bearer-token auth for local admin API, docs, and web console.         |
| `OOMOL_CONNECT_RUNTIME_TOKEN`            | unset                     | Optional bootstrap runtime bearer token for `/v1` and MCP callers.             |
| `OOMOL_CONNECT_ALLOWED_ACTIONS`          | unset                     | Comma-separated executable action allowlist. Supports `service.*` and `*`.     |
| `OOMOL_CONNECT_BLOCKED_ACTIONS`          | unset                     | Comma-separated executable action denylist. Supports `service.*` and `*`.      |
| `OOMOL_CONNECT_ALLOWED_PROXIES`          | unset                     | Comma-separated provider proxy allowlist. Supports service names and `*`.      |
| `OOMOL_CONNECT_BLOCKED_PROXIES`          | unset                     | Comma-separated provider proxy denylist. Supports service names and `*`.       |
| `OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK`    | `false`                   | Allow self-hosted provider connections to target private networks. See below.  |
| `OOMOL_CONNECT_TRANSIT_FILE_TTL_SECONDS` | `86400`                   | Transit file lifetime before cleanup.                                          |
| `OOMOL_CONNECT_TRANSIT_FILE_MAX_BYTES`   | `104857600`               | Maximum transit file upload size.                                              |

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
Only token hashes are stored in SQLite. `OOMOL_CONNECT_RUNTIME_TOKEN` remains available for
bootstrap scripts and backward compatibility.

## Private network access

By default OpenConnector applies a public-only SSRF guard to every user-supplied
URL, including self-hosted provider instance URLs (for example the Dokploy
**Instance URL**). Connections may therefore only target public addresses, and
private targets are rejected during connection setup.

Some self-hosted services are only reachable over a LAN or an overlay network
such as Tailscale or NetBird. To allow those connections, set
`OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK=true`. When enabled, provider connections
that opt in (currently **Dokploy**) may target:

- RFC 1918 ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- Carrier-grade NAT / shared address space `100.64.0.0/10` (Tailscale, NetBird)
- Private hostname suffixes: `.local`, `.internal`, `.home`, `.lan`

The following targets stay blocked even when the flag is enabled:

- Loopback and localhost (`127.0.0.0/8`, `localhost`, `.localhost`)
- Link-local and cloud metadata (`169.254.0.0/16`, `100.100.100.200/32`, and
  metadata hostnames such as `metadata.google.internal`)
- Reserved, multicast, and broadcast ranges, and all IPv6 targets

> **Enable this only on a single-tenant, self-hosted runtime that you operate.**
> On a shared or multi-tenant deployment, turning it on lets any connection
> owner reach the operator's internal network from the runtime's egress
> position, so leave it at the `false` default there.

## Cloudflare Workers

Cloudflare uses the same environment variable names for origin, auth tokens, execution policy,
transit file limits, and data encryption. `PORT`, `HOST`, and `OOMOL_CONNECT_DATA_DIR` are local
Node-only settings on Workers.

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
