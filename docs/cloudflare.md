# Cloudflare Deployment

OpenConnector supports Cloudflare Workers as a metadata and runtime-state deployment target. The
Worker runtime uses:

- Workers for the HTTP runtime.
- D1 for connections, OAuth config/state, runtime tokens, and run logs.
- R2 or Workers KV for temporary transit files.
- Static Assets for the Web Console.

## Prerequisites

- A Cloudflare account with Workers, D1, and either R2 or Workers KV access.
- Wrangler available through `npx wrangler`.
- Node.js 22 or newer.

## Create Local Config

Install dependencies and copy the example Wrangler config:

```bash
npm install
cp wrangler.example.jsonc wrangler.local.jsonc
```

`wrangler.local.jsonc` is ignored by git. Fill it with your Cloudflare resource IDs before remote
deployment.

## Log In With Wrangler

Skip this step if you are already logged in:

```bash
npx wrangler login
```

## Create Cloudflare Resources

Create the D1 database:

```bash
npx wrangler d1 create open-connector
```

Then choose one transit-file backend. R2 is the default and supports files larger than 25 MiB:

```bash
npx wrangler r2 bucket create open-connector-transit-files
```

Alternatively, create a Workers KV namespace for lightweight deployments that do not need files
larger than 25 MiB:

```bash
npx wrangler kv namespace create open-connector-transit-files
```

Put the returned D1 `database_id` and R2 bucket name or KV namespace `id` into
`wrangler.local.jsonc`. For KV, comment out the `r2_buckets` block, uncomment the
`kv_namespaces` block, and set `TRANSIT_FILES_BACKEND` to `"kv"` as shown in the example config.
Only one backend may use the `TRANSIT_FILES` binding. All Wrangler commands that read the Worker
config should use `--config wrangler.local.jsonc`.

## Local Worker Preview

The local Worker preview stores its D1, R2, and KV data under the ignored `.wrangler` directory.
This data is separate from the remote Cloudflare resources.

Remote secrets set with `wrangler secret put` are not available to the local preview. To test local
admin authentication and credential encryption, add separate local values to the ignored `.env`
file before starting the Worker:

```dotenv
OOMOL_CONNECT_ADMIN_TOKEN=replace-with-a-local-admin-token
OOMOL_CONNECT_ENCRYPTION_KEY=replace-with-a-local-encryption-key
```

Apply the migrations to Wrangler's local D1 state, then start the Worker:

```bash
npx wrangler d1 migrations apply open-connector --local --config wrangler.local.jsonc
npm run dev:cloudflare
```

`npm run dev:cloudflare` generates the catalog, builds the Web Console, copies catalog assets, and
runs `wrangler dev --config wrangler.local.jsonc`. The local Worker preview uses the same generated
provider Action executor registry as the Node runtime.

Check the local Worker and open the Web Console at `http://localhost:8787`:

```bash
curl http://localhost:8787/health
```

The health endpoint should return `{"ok":true}`.

## Remote Deployment

Apply migrations to the remote D1 database:

```bash
npx wrangler d1 migrations apply open-connector --remote --config wrangler.local.jsonc
```

Generate two independent random values by running this command twice:

```bash
openssl rand -base64 32
```

Store the encryption key in a password manager or another external secrets vault. If it is lost or
changed, credentials and OAuth client configuration already encrypted in D1 cannot be recovered.
Keep the admin token available to operators who need the Web Console or admin API.

Paste the generated values when Wrangler prompts for each secret:

```bash
npx wrangler secret put OOMOL_CONNECT_ADMIN_TOKEN --config wrangler.local.jsonc
npx wrangler secret put OOMOL_CONNECT_ENCRYPTION_KEY --config wrangler.local.jsonc
```

Deploy:

```bash
npm run deploy:cloudflare
```

`npm run deploy:cloudflare` generates the catalog, builds the Web Console, copies catalog assets,
and runs `wrangler deploy --config wrangler.local.jsonc`. The copied `wrangler.local.jsonc` already
maps the built Web Console assets to the `ASSETS` binding used by the Worker.

Use the Worker URL printed by Wrangler to check the deployed runtime, then open the same URL in a
browser and enter the admin token to access the Web Console:

```bash
curl https://open-connector.example.workers.dev/health
```

The health endpoint should return `{"ok":true}`. Replace the example URL with the deployed Worker
URL or your custom domain.

## Runtime Behavior

The Cloudflare runtime serves catalog metadata, `/api` and `/v1` metadata endpoints, connections,
runtime tokens, OAuth config/state, transit files backed by the configured R2 bucket or KV
namespace, and the generated provider Action executor registry.

Configure an R2 lifecycle rule for the transit bucket if you want unread expired transit files
cleaned up automatically. Workers KV applies the configured TTL when each file is written and
deletes it automatically. KV clamps `OOMOL_CONNECT_TRANSIT_FILE_TTL_SECONDS` to a minimum of 60
seconds and `OOMOL_CONNECT_TRANSIT_FILE_MAX_BYTES` to a maximum of 25 MiB.

## Configuration

Cloudflare uses the same environment variable names for origin, auth tokens, action policy, transit
file limits, and credential encryption. `PORT`, `HOST`, and `OOMOL_CONNECT_DATA_DIR` are local
Node-only settings on Workers.

See [configuration.md](configuration.md) for all runtime environment variables.
