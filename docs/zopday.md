# ZopDay Deployment

Run the published `ghcr.io/oomol-lab/open-connector:latest` Docker image on ZopDay with container port `3000`. You need a ZopDay account and a deployment target that supports the environment and storage settings below. You register provider OAuth apps yourself.

Configure authentication, the public origin and storage before the first start. The generic image deployment link does not generate OpenConnector secrets or configure persistent storage.

## Prepare the environment

Set these values in the deployment's environment or secret settings:

| Variable                       | Value                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `OOMOL_CONNECT_ORIGIN`         | The instance's actual public HTTPS origin, such as `https://connector.example.com`. OAuth callbacks use this address. |
| `OOMOL_CONNECT_ADMIN_TOKEN`    | A random secret for the Web Console and management API.                                                               |
| `OOMOL_CONNECT_RUNTIME_TOKEN`  | A different random secret for the runtime API and MCP.                                                                |
| `OOMOL_CONNECT_ENCRYPTION_KEY` | A third random secret for encrypting stored credentials and OAuth configuration.                                      |

Generate each secret independently, for example by running this command three times:

```bash
openssl rand -base64 32
```

Enter the values through the deployment form or secret settings. Keep them out of the public deployment URL. Save the encryption key outside the deployment and retain it across redeploys; replacing or losing it prevents the runtime from decrypting existing credentials.

Without configured tokens, the management and runtime APIs allow unauthenticated access on a new instance. Without `OOMOL_CONNECT_ORIGIN`, the Docker runtime uses `http://localhost:3000` for OAuth callbacks and generated file URLs. TLS does not configure either setting for the application.

## Configure persistent storage

Choose one database setup before deploying:

- **SQLite:** attach persistent storage at `/app/data` and run a single replica. The database is `/app/data/connect.sqlite`; local transit files also live under `/app/data`. Reuse the same volume when replacing the container. The image's `VOLUME` declaration alone does not configure durable storage on a deployment platform.
- **PostgreSQL:** set `OOMOL_CONNECT_DATABASE_URL` to an external PostgreSQL database. Run the same image with the command `migrate` against that database before the first server start and before deploying a version with new migrations. The server checks for pending migrations and refuses to start until they are applied. See [runtime database configuration](configuration.md#runtime-database).

PostgreSQL stores runtime records, including connections and OAuth configuration. To retain transit files across container replacement, also attach persistent storage at `/app/data` or configure [S3-compatible transit files](configuration.md#s3-compatible-transit-files). Use PostgreSQL and S3-compatible transit storage when running multiple replicas.

If the selected ZopDay target does not support a persistent mount, use the PostgreSQL and S3 setup. Keep `OOMOL_CONNECT_ENCRYPTION_KEY` the same on every replica and redeploy.

## Configure the deployment

After preparing the settings above, [open the ZopDay deployment form](https://zop.dev/zopday/app/deploy?image=ghcr.io/oomol-lab/open-connector%3Alatest&port=3000&name=open-connector&env=OOMOL_CONNECT_ORIGIN%3D&env=OOMOL_CONNECT_ADMIN_TOKEN%3D&env=OOMOL_CONNECT_RUNTIME_TOKEN%3D&env=OOMOL_CONNECT_ENCRYPTION_KEY%3D).

The link pre-fills the image, port and four environment variable names. Their values are empty; fill them in before submitting the deployment. Use [Custom Deploy](https://zop.dev/docs/zopday/deploy/quick-deploy#use-custom-deploy) to enter environment settings, and configure the storage selected above. Set `OOMOL_CONNECT_ORIGIN` to the assigned or planned HTTPS hostname.

ZopCloud availability depends on the organisation, and its shared pool is intended for evaluation. For production requirements, ZopDay documents deployment to your own cloud. See its [Quick Deploy guide](https://zop.dev/docs/zopday/deploy/quick-deploy) for target availability and limitations.

## Verify the deployment

Replace the example origin with your instance's address:

```bash
CONNECT_ORIGIN=https://connector.example.com
curl -i "$CONNECT_ORIGIN/health"
curl -i "$CONNECT_ORIGIN/api/connections"
curl -i "$CONNECT_ORIGIN/v1/connections"
curl -i "$CONNECT_ORIGIN/v1/providers"
```

`/health` should return `200`. The other three requests have no credentials and should return `401`.

With the admin token available in your shell as `OOMOL_CONNECT_ADMIN_TOKEN`, inspect an OAuth provider's setup:

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $OOMOL_CONNECT_ADMIN_TOKEN" \
  "$CONNECT_ORIGIN/v1/providers/github/setup"
```

Confirm that `data.oauthClient.expectedRedirectUri` uses your public HTTPS origin followed by `/oauth/callback`. Register that exact callback URL with the provider when creating its OAuth app.

Connect an account, then replace or redeploy the container using the same storage and encryption key. Confirm that the connection remains available and an authenticated action still works. For PostgreSQL, include the migration step whenever an upgrade adds migrations. For SQLite, confirm that the same persistent volume is attached after replacement.
