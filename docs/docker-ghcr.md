[English](docker-ghcr.md) | [简体中文](docker-ghcr.zh-CN.md)

# Docker Image (GHCR)

OpenConnector ships a prebuilt Docker image on the GitHub Packages container registry (GHCR), so you
can run it without cloning the repository or building anything. The image is:

```text
ghcr.io/oomol-lab/open-connector
```

## Choose A Tag

| Tag           | Points at                            | Use it when                                                    |
| ------------- | ------------------------------------ | -------------------------------------------------------------- |
| `latest`      | the newest published release         | you want the current stable runtime                            |
| `v1.0.0`      | a specific release (immutable)       | you deploy to production and want a pinned, reproducible build |
| `tip`         | the latest commit on `main`          | you want to try changes that are not released yet              |
| `<short-sha>` | a specific `main` commit (immutable) | you want to pin an exact pre-release build                     |

For production, pin a released version such as `v1.0.0`.

## Pull

The image is public, so no sign-in is required:

```bash
docker pull ghcr.io/oomol-lab/open-connector:latest
```

If you get an `unauthorized` or `denied` error, sign in with a GitHub token that has the
`read:packages` scope:

```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u <github-username> --password-stdin
```

The image is multi-arch (`linux/amd64` + `linux/arm64`), so Docker automatically pulls the variant
that matches your machine — running natively on Intel/AMD hosts and on arm64 hosts such as Apple
Silicon and AWS Graviton. No `--platform` flag is needed.

## Run

The image listens on port `3000`, binds to `0.0.0.0`, and stores runtime data in `/app/data`.

First generate the runtime secrets and save them somewhere safe. `OOMOL_CONNECT_ENCRYPTION_KEY`
encrypts stored credentials and OAuth client secrets; if it is lost, the encrypted data in
`/app/data` cannot be recovered. `OOMOL_CONNECT_ADMIN_TOKEN` authenticates the admin API and console.

```bash
# Save both values in a password manager or secrets vault before running.
export OOMOL_CONNECT_ENCRYPTION_KEY=$(openssl rand -base64 32)
export OOMOL_CONNECT_ADMIN_TOKEN=$(openssl rand -base64 32)
```

Then run the image, mounting a volume so data survives restarts:

```bash
docker run -d \
  --name open-connector \
  -p 3000:3000 \
  -v open_connector_data:/app/data \
  -e OOMOL_CONNECT_ORIGIN="https://api.example.com" \
  -e OOMOL_CONNECT_ENCRYPTION_KEY="$OOMOL_CONNECT_ENCRYPTION_KEY" \
  -e OOMOL_CONNECT_ADMIN_TOKEN="$OOMOL_CONNECT_ADMIN_TOKEN" \
  ghcr.io/oomol-lab/open-connector:latest
```

See [configuration.md](configuration.md) for the full environment variable reference and
[credentials.md](credentials.md) for connecting providers.

### Docker Compose

The repository ships a [`docker-compose.yml`](../docker-compose.yml) that runs this published image.
From a checkout, export the secrets shown above and start it:

```bash
docker compose up
```

To build from source instead of pulling, add the build overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build
```

## Verify

Check the health endpoint:

```bash
curl http://localhost:3000/health
```

The expected response is:

```json
{ "ok": true }
```

## How Images Are Published

Images are built and pushed automatically, so the tags above stay current: every push to `main`
updates `tip` and adds the `<short-sha>` tag, and every published release adds `latest` and the
release version. Each tag is a multi-arch manifest built natively for `linux/amd64` and
`linux/arm64`. The build is defined in
[`.github/workflows/publish-docker.yml`](../.github/workflows/publish-docker.yml).
