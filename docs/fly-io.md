# Fly.io Deployment

OpenConnector can run on Fly.io as the Node Docker runtime with persistent SQLite storage. Fly
provides TLS termination, remote Docker builds, health checks, rolling deploys, and optional custom
domains.

This deployment uses the repository's `docker/Dockerfile`, the Fly app config in `fly.toml`, and a
Fly volume mounted at `/app/data`.

## Prerequisites

- A Fly.io account.
- `flyctl` installed and authenticated with `fly auth login`.
- Docker available locally, or Fly remote builders enabled.
- A public origin for OAuth callback URLs, such as `https://api.example.com` or the default
  `https://<app>.fly.dev` hostname.

## Create The App

Create a Fly app without deploying yet:

```bash
fly apps create my-open-connector
```

Fly app names are globally unique. If you choose a different name, update the `app` field in
`fly.toml` before deploying:

```toml
app = "my-open-connector"
```

## Create Persistent Storage

The Docker image stores runtime data in `/app/data`. Create a Fly volume with the same source name
as `fly.toml`:

```bash
fly volumes create open_connector_data \
  --region iad \
  --size 1 \
  --app my-open-connector
```

Increase `--size` if you expect large run logs, many stored credentials, or heavy temporary file
transit usage.

## Set Secrets

Store production secrets with Fly instead of committing them to `fly.toml`:

```bash
OOMOL_CONNECT_ENCRYPTION_KEY=$(openssl rand -base64 32)
OOMOL_CONNECT_ADMIN_TOKEN=$(openssl rand -base64 32)
OOMOL_CONNECT_RUNTIME_TOKEN=$(openssl rand -base64 32)

fly secrets set \
  OOMOL_CONNECT_ORIGIN="https://my-open-connector.fly.dev" \
  OOMOL_CONNECT_ENCRYPTION_KEY="$OOMOL_CONNECT_ENCRYPTION_KEY" \
  OOMOL_CONNECT_ADMIN_TOKEN="$OOMOL_CONNECT_ADMIN_TOKEN" \
  OOMOL_CONNECT_RUNTIME_TOKEN="$OOMOL_CONNECT_RUNTIME_TOKEN" \
  --app my-open-connector
```

Keep `OOMOL_CONNECT_ENCRYPTION_KEY` in a password manager or another external secrets vault. If the
key is lost, encrypted credentials, OAuth client configuration, and completed idempotent Action
responses in the SQLite database cannot be recovered.

Optional runtime policy can also be set as secrets:

```bash
fly secrets set \
  OOMOL_CONNECT_ALLOWED_ACTIONS="github.*,hackernews.*" \
  OOMOL_CONNECT_ALLOWED_PROXIES="github" \
  --app my-open-connector
```

See [configuration.md](configuration.md) for the full environment variable reference.

## Deploy

Deploy from the repository root:

```bash
fly deploy --config fly.toml --remote-only
```

The Fly config uses:

- `docker/Dockerfile` for the image build.
- `internal_port = 3000` for the Node runtime.
- `/health` for HTTP health checks.
- `/app/data` as the mounted persistent data directory.

## Verify The Runtime

Check the health endpoint:

```bash
curl https://my-open-connector.fly.dev/health
```

The expected response is:

```json
{ "ok": true }
```

View logs when diagnosing deployment or startup issues:

```bash
fly logs --app my-open-connector
```

## Configure OAuth Redirects

For OAuth2 providers, set `OOMOL_CONNECT_ORIGIN` to the public origin users will access. The runtime
builds provider callback URLs from that origin and `/oauth/callback`.

For example, with:

```bash
OOMOL_CONNECT_ORIGIN="https://api.example.com"
```

the OAuth callback URL is:

```text
https://api.example.com/oauth/callback
```

Add that exact callback URL to each provider OAuth app.

## Custom Domain

Register the domain with Fly:

```bash
fly certs add api.example.com --app my-open-connector
```

Fly prints the DNS records to create. After DNS is ready, update the public origin:

```bash
fly secrets set \
  OOMOL_CONNECT_ORIGIN="https://api.example.com" \
  --app my-open-connector
```

Check certificate status:

```bash
fly certs check api.example.com --app my-open-connector
```

## Updating

Deploy new versions from the repository root:

```bash
git pull
fly deploy --config fly.toml --remote-only
```

The mounted volume keeps `connect.sqlite` and transit files across deployments.

## Scaling

`fly.toml` defaults to suspending the single machine when idle:

```toml
[http_service]
min_machines_running = 0
```

For production traffic that should avoid cold starts, keep one machine running:

```toml
[http_service]
min_machines_running = 1
```

Keep the machine count at one for the default SQLite deployment. Fly volumes are attached to
individual machines, so horizontal scaling requires a separate shared storage design. For this
repository's default Fly setup, prefer increasing the VM size before adding more machines.
