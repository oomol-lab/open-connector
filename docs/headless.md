# @oomol-lab/open-connector

[![npm](https://img.shields.io/npm/v/@oomol-lab/open-connector.svg)](https://www.npmjs.com/package/@oomol-lab/open-connector)
[![Node.js](https://img.shields.io/node/v/@oomol-lab/open-connector.svg)](https://nodejs.org)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://github.com/oomol-lab/open-connector/blob/main/LICENSE.txt)

Embeddable Open Connector runtime for Node.js 22.18+ and Bun 1.4+.

This package is the headless runtime library. It owns providers, authorization,
credentials, and storage. Your application owns the HTTP server, configuration,
and process lifecycle.

It ships compiled JavaScript, TypeScript types, the provider catalog, and SQL
migrations. It does not include the Web Console or install scripts. For a
standalone server with a dashboard, use the
[Docker image](https://github.com/oomol-lab/open-connector/blob/main/docs/docker-ghcr.md)
or a
[single-file binary](https://github.com/oomol-lab/open-connector/releases).

## Install

```sh
npm install @oomol-lab/open-connector @hono/node-server
```

## Quick start

```ts
import { serve } from "@hono/node-server";
import { createConnectorRuntime } from "@oomol-lab/open-connector";

const connector = await createConnectorRuntime({
  dataDir: "./data/connector",
  publicOrigin: "https://app.example.com/connector",
  encryptionKey: process.env.CONNECTOR_ENCRYPTION_KEY,
  adminToken: process.env.CONNECTOR_ADMIN_TOKEN,
  runtimeToken: process.env.CONNECTOR_RUNTIME_TOKEN,
});

const server = serve({
  fetch: (request) => connector.fetch(request),
  port: 3000,
});

const shutdown = async () => {
  server.close();
  await connector.close();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

Install `@hono/node-server` in the host application. Isolated package-manager
layouts do not expose this package's own copy for a direct host import. On Bun,
pass the same `fetch` handler to `Bun.serve()` and skip `@hono/node-server`.

Importing the package starts nothing. Configuration is explicit; the library
does not read environment variables. One runtime may be active per process
because provider egress policy is process-wide. Keep administrator credentials
in your backend and authorize users before making management calls.

`publicOrigin` is the external HTTP(S) URL of the runtime. A path such as
`/connector` is a mount prefix: every forwarded request must include it, and
`connector.fetch()` returns 404 for anything outside that prefix. Preserve the
original request URL when you forward.

## Options

`createConnectorRuntime(options)`:

| Option          | Purpose                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `dataDir`       | Writable directory for SQLite, local transit files, and upload staging. Required.               |
| `publicOrigin`  | External HTTP(S) URL. A path is a mount prefix. Required.                                       |
| `encryptionKey` | Encrypts stored credentials and OAuth state. Omit to store them in plain text.                  |
| `adminToken`    | Bearer token for management APIs. Omit to leave them open.                                      |
| `runtimeToken`  | Static bearer token for `/v1` and `/mcp`. JWT and admin-issued tokens are alternatives.         |
| `jwt`           | `{ jwksUri, issuer, audience }` to verify `/v1` bearer tokens as JWTs.                          |
| `postgres`      | `{ connectionString }` to use PostgreSQL instead of SQLite under `dataDir`.                     |
| `actionPolicy`  | Allow or block actions and proxies by name (`service.*` and `*` are accepted).                  |
| `transitFiles`  | TTL, size limit, and optional S3 for files exchanged with providers.                            |
| `network`       | Private-network and trusted-host egress policy. Process-wide.                                   |
| `apiReference`  | Serve `/docs` API-reference HTML. Off by default. Authorization completion pages are always on. |
| `logger`        | `{ error, info, warn }`. Omit for silence.                                                      |

`connector.fetch(request)` is the HTTP boundary: `/v1/*`, `/mcp`,
`/oauth/callback`, and admin `/api/*`. `connector.close()` aborts in-flight
work and closes owned storage. It is safe to call more than once.

## Connector SDK

[`@oomol-lab/connector`](https://www.npmjs.com/package/@oomol-lab/connector) is
the TypeScript client. Install it separately and point it at the same
`publicOrigin` and tokens. In-process hosts can pass `connector.fetch` so the
SDK never opens a network connection:

```ts
import { OpenConnector } from "@oomol-lab/connector";

const open = new OpenConnector({
  baseUrl: "https://app.example.com/connector",
  runtimeToken: process.env.CONNECTOR_RUNTIME_TOKEN,
  fetch: (input, init) => connector.fetch(new Request(input, init)),
});

const user = await open.github.get_current_user({});
```

`baseUrl` is `publicOrigin`, not a `/v1` URL.

## OAuth

Register `<publicOrigin>/oauth/callback` with each OAuth provider. Pass the
host's `returnUri` on each connection attempt so the runtime can send the user
back after authorization.

## Provider setup

`GET /v1/providers/:service/setup` requires the administrator bearer token when
`adminToken` is set. With neither `adminToken` nor runtime authentication it is
open; runtime-only authentication without `adminToken` returns 403. It returns
the required input fields, provider registration help, configured callback URL,
and missing OAuth client values. It never returns saved secrets. Submit values
through the connection and OAuth configuration APIs.

## Bun compile

For Bun executables, include `getConnectorAssetDirectory()` in
`compile.assets`, with `splitting: true` and `external: ["proxy-agent"]`. Keep
the asset directory named `open-connector`; package assets resolve
independently of the working directory.

## Documentation

- [Runtime API and MCP](https://github.com/oomol-lab/open-connector/blob/main/docs/runtime-api.md)
- [Programmatic connections](https://github.com/oomol-lab/open-connector/blob/main/docs/programmatic-connections.md)
- [SDK and CLI](https://github.com/oomol-lab/open-connector/blob/main/docs/sdk-cli.md)
- [Source repository](https://github.com/oomol-lab/open-connector)

## License

[Apache-2.0](https://github.com/oomol-lab/open-connector/blob/main/LICENSE.txt)
