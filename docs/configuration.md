# Configuration

OpenConnector is configured with environment variables.

| Variable                                 | Default                   | Purpose                                                                        |
| ---------------------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| `PORT`                                   | `3000`                    | Local HTTP server port.                                                        |
| `HOST`                                   | `127.0.0.1`               | Bind address. Docker image sets `0.0.0.0`.                                     |
| `OOMOL_CONNECT_ORIGIN`                   | `http://localhost:<PORT>` | Public origin used for OAuth redirect URLs.                                    |
| `OOMOL_CONNECT_DATA_DIR`                 | `./data`                  | Directory containing `connect.sqlite`. Docker image sets `/app/data`.          |
| `OOMOL_CONNECT_ENCRYPTION_KEY`           | unset                     | Enables AES-256-GCM encryption for stored credentials and OAuth client config. |
| `OOMOL_CONNECT_NEW_ENCRYPTION_KEY`       | unset                     | New key used by `runtime:data rotate-key`.                                     |
| `OOMOL_CONNECT_ADMIN_TOKEN`              | unset                     | Requires bearer-token auth for local admin API, docs, and web console.         |
| `OOMOL_CONNECT_RUNTIME_TOKEN`            | unset                     | Optional bootstrap runtime bearer token for `/v1` and MCP callers.             |
| `OOMOL_CONNECT_ALLOWED_ACTIONS`          | unset                     | Comma-separated executable action allowlist. Supports `service.*`.             |
| `OOMOL_CONNECT_BLOCKED_ACTIONS`          | unset                     | Comma-separated executable action denylist. Supports `service.*`.              |
| `OOMOL_CONNECT_ALLOWED_PROXIES`          | unset                     | Comma-separated provider proxy allowlist. Supports service names and `*`.      |
| `OOMOL_CONNECT_BLOCKED_PROXIES`          | unset                     | Comma-separated provider proxy denylist. Supports service names and `*`.       |
| `OOMOL_CONNECT_TRANSIT_FILE_TTL_SECONDS` | `86400`                   | Local transit file lifetime before cleanup.                                    |
| `OOMOL_CONNECT_TRANSIT_FILE_MAX_BYTES`   | `104857600`               | Maximum local transit file upload size.                                        |

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

## Cloudflare Workers

Cloudflare uses the same environment variable names for origin, auth tokens, execution policy,
transit file limits, and credential encryption. `PORT`, `HOST`, and `OOMOL_CONNECT_DATA_DIR` are local
Node-only settings on Workers.

The Worker runtime also requires these bindings in `wrangler.local.jsonc`. Copy
`wrangler.example.jsonc` to `wrangler.local.jsonc` and fill in your own Cloudflare resource IDs
before running Wrangler commands.

- `DB`: D1 database for connections, OAuth config/state, runtime tokens, and run logs.
- `TRANSIT_FILES`: R2 bucket for temporary transit files.
- `ASSETS`: Workers Static Assets binding for the web console.

Set secrets with Wrangler instead of committing them to config:

```bash
npx wrangler secret put OOMOL_CONNECT_ADMIN_TOKEN --config wrangler.local.jsonc
npx wrangler secret put OOMOL_CONNECT_ENCRYPTION_KEY --config wrangler.local.jsonc
```
