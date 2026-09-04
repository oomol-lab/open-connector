# Single Binary

OpenConnector can be compiled into one self-contained executable per platform with
[Bun](https://bun.com/docs/bundler/executables). The binary embeds the runtime, the generated
provider catalog, the database migrations, and the built web console, so it runs from any directory
without a Node.js installation, a checkout, or `node_modules`. Nothing is extracted to disk at
runtime.

Provider code is split into chunks inside the executable, and each provider's chunk is loaded the
first time that provider is used, so the process only parses the server itself at startup. This is
what keeps the binary's resident memory well under what a single bundle needs, and it is invisible
to clients: the same routes, responses, and ETags.

## Download

Every [release](https://github.com/oomol-lab/open-connector/releases) attaches one archive per
platform, built and smoke-tested on that platform by CI, plus a `SHA256SUMS` file:

| Asset                                | Platform            |
| ------------------------------------ | ------------------- |
| `open-connector-linux-x64.tar.gz`    | Linux x86_64        |
| `open-connector-linux-arm64.tar.gz`  | Linux ARM64         |
| `open-connector-darwin-arm64.tar.gz` | macOS Apple Silicon |
| `open-connector-darwin-x64.tar.gz`   | macOS Intel         |
| `open-connector-windows-x64.zip`     | Windows x86_64      |
| `open-connector-windows-arm64.zip`   | Windows ARM64       |

The names are stable across releases, so `releases/latest/download/` always resolves to the newest
release:

```bash
curl -fsSLO https://github.com/oomol-lab/open-connector/releases/latest/download/open-connector-linux-x64.tar.gz
curl -fsSLO https://github.com/oomol-lab/open-connector/releases/latest/download/SHA256SUMS
sha256sum --ignore-missing -c SHA256SUMS
tar -xzf open-connector-linux-x64.tar.gz
./open-connector-linux-x64
```

Replace `latest` with a tag such as `v1.4.1` to pin a release. The macOS archives contain binaries
that were re-signed on a macOS runner, so they run without the `codesign` step described below.

## Build

Building requires Node.js for the npm scripts and the Bun version pinned in `.bun-version`; the
build script exits with an error under any other Bun version. Compile on Linux or macOS.
Cross-compiling on a Windows host fails upstream
([oven-sh/bun#11198](https://github.com/oven-sh/bun/issues/11198)).

```bash
npm install
npm run build:binary
```

`npm run build:binary` regenerates the catalog, builds the web console, and then writes six files
under `dist/`:

```text
dist/open-connector-linux-x64
dist/open-connector-linux-arm64
dist/open-connector-darwin-x64
dist/open-connector-darwin-arm64
dist/open-connector-windows-x64.exe
dist/open-connector-windows-arm64.exe
```

Each file is roughly 150 to 175 MiB. To build a subset, pass one or more target names after `--`:

```bash
npm run build:binary -- linux-x64 darwin-arm64
```

Bun downloads a runtime for every target that differs from the host (about 80 MB each, from
`registry.npmjs.org`) into `~/.bun/install/cache` on first use. These downloads are not integrity
checked by Bun; TLS is the only protection.

`npm run build:web` also fetches the provider icon map from https://oomol.com/en/apps/catalog.json
and fails when it is unreachable.

`.bun-version` and the `@types/bun` devDependency pin in `package.json` are bumped together.

## Run

The binary takes the same environment variables as `npm start`; see
[configuration.md](configuration.md) for the full reference. The ones you will usually set:

| Variable                     | Default     | Meaning                                                           |
| ---------------------------- | ----------- | ----------------------------------------------------------------- |
| `OOMOL_CONNECT_DATA_DIR`     | `./data`    | SQLite database, transit files, and upload staging.               |
| `PORT`                       | `3000`      | HTTP port.                                                        |
| `HOST`                       | `127.0.0.1` | Bind address.                                                     |
| `OOMOL_CONNECT_DATABASE_URL` | unset       | PostgreSQL connection URL. When unset, SQLite under the data dir. |

```bash
OOMOL_CONNECT_DATA_DIR="$HOME/open-connector-data" \
PORT=3000 \
./dist/open-connector-linux-x64
```

With SQLite, migrations are applied automatically when the database opens, exactly as with
`npm start`.

### PostgreSQL Migrations

PostgreSQL migrations are explicit. The binary has a `migrate` subcommand that applies the embedded
migrations and exits without starting the server. Run it before the first start and before starting
a newer binary that contains pending migrations:

```bash
OOMOL_CONNECT_DATABASE_URL="postgresql://open_connector:password@db.example.com:5432/open_connector?sslmode=verify-full" \
./dist/open-connector-linux-x64 migrate

OOMOL_CONNECT_DATABASE_URL="postgresql://open_connector:password@db.example.com:5432/open_connector?sslmode=verify-full" \
./dist/open-connector-linux-x64
```

The server only checks schema readiness at startup and refuses to start when migrations are
missing; it never applies PostgreSQL DDL itself. Without `OOMOL_CONNECT_DATABASE_URL`, `migrate`
prints a notice that SQLite migrations are applied automatically and exits.

## Differences From `npm start`

- `NODE_ENV` is fixed to `production` inside the binary, so logs are always JSON (no pretty
  printing). `OOMOL_CONNECT_LOG_LEVEL` and every other environment variable are read at runtime as
  usual.
- macOS: binaries built on macOS are ad-hoc signed by the build script, and the release archives
  are re-signed on a macOS runner. Binaries built on another operating system carry an invalid
  ad-hoc signature, and macOS 27 and newer refuses to run them until you re-sign them:

  ```bash
  codesign --force --sign - dist/open-connector-darwin-arm64
  ```

  `codesign --verify --verbose=2 <file>` prints "valid on disk" for a usable binary and "invalid
  signature" for one that still needs re-signing.

## Notes

- Like `npm start`, the binary does not load `.env` files (Bun's automatic loading is disabled at
  build time).
- On Windows, stopping the process from a process manager or `taskkill` terminates it immediately;
  the graceful shutdown hook that closes the HTTP server and the database on Linux and macOS does
  not run. This matches `node src/server/index.ts` on Windows.
- The binary exits with code 1 when it cannot listen (for example when `PORT` is already in use)
  and when an uncaught exception is thrown while serving, as `node src/server/index.ts` always
  has. Earlier binaries printed the error and kept running; after a listen failure they hung
  without a server.
- On Linux, Bun releases the pages of the embedded bundle and catalog once startup has finished,
  so resident memory after startup is lower than the startup peak. Pages touched later, such as a
  provider's first use or an on-demand schema read, fault back in, bounded by the size of the
  embedded section. `BUN_FEATURE_FLAG_DISABLE_STANDALONE_MADVISE=1` disables the release.
