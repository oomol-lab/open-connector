# Embed Open Connector

Use the headless package in Node.js 22.18+ or Bun 1.4+. It owns providers, authorization,
credentials, and storage. Your application owns its HTTP server, configuration, and shutdown.
The default dashboard host uses the same `createConnectorRuntime()` factory.

## Install

```sh
npm install @oomol-lab/open-connector
```

The package includes JavaScript, types, catalog, and migrations; no dashboard assets or install
scripts. Every [release](https://github.com/oomol-lab/open-connector/releases) publishes the
matching version to npm. To build it from a checkout instead:

```sh
npm ci
npm run build:runtime
npm pack ./dist/package --pack-destination dist
```

Then install the resulting tarball with `npm install /path/to/package.tgz`.

## Use

```ts
import { createConnectorRuntime } from "@oomol-lab/open-connector";

const connector = await createConnectorRuntime({
  dataDir: "./data/connector",
  publicOrigin: "https://app.example.com/connector",
  encryptionKey: process.env.CONNECTOR_ENCRYPTION_KEY,
  adminToken: process.env.CONNECTOR_ADMIN_TOKEN,
  runtimeToken: process.env.CONNECTOR_RUNTIME_TOKEN,
});

// Forward requests under /connector, preserving the original URL.
const response = await connector.fetch(request);
// On host shutdown:
await connector.close();
```

One runtime may be active per process. Importing the package starts nothing. Configuration is
explicit; the library does not read environment variables. Keep administrator credentials in
your backend and authorize users before making management calls.

The existing `@oomol-lab/connector` SDK accepts
`fetch: (input, init) => connector.fetch(new Request(input, init))` with the same base URL and tokens.
Register `<publicOrigin>/oauth/callback` with OAuth providers; supply the host's `returnUri` per
connection attempt. Authorization completion pages are included; API-reference HTML is opt-in
with `apiReference: true`.

For Bun executables, include `getConnectorAssetDirectory()` in `compile.assets`, with
`splitting: true` and `external: ["proxy-agent"]`. Keep the asset directory named `open-connector`;
package assets resolve independently of the working directory.

## Provider setup

`GET /v1/providers/:service/setup` uses administrator authentication and returns the required input
fields, provider registration help, configured callback URL, and missing OAuth client values.
It includes no saved secrets. Submit values through the existing connection and OAuth configuration
APIs. The dashboard consumes the same field descriptions through `/api/providers`.
