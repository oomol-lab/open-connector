# @oomol-lab/open-connector

[![npm](https://img.shields.io/npm/v/@oomol-lab/open-connector.svg)](https://www.npmjs.com/package/@oomol-lab/open-connector)
[![Node.js](https://img.shields.io/node/v/@oomol-lab/open-connector.svg)](https://nodejs.org)
[![License: Modified Apache-2.0](https://img.shields.io/badge/License-Modified%20Apache--2.0-blue.svg)](https://github.com/oomol-lab/open-connector/blob/main/LICENSE.txt)

Embeddable Open Connector runtime for Node.js 22.23.4+, 24.22.1+, or 26.12.1+ within those release
lines, and Bun 1.4.4+. These minimums include the CVE-2026-111497 Brotli decoder fix.

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
does not read environment variables. Multiple runtimes may share a process; each
owns its network policy and background tasks. Use separate data directories and
database namespaces for independent tenants. Closing one runtime does not change
another runtime’s network policy. Keep administrator credentials
in your backend and authorize users before making management calls.

`publicOrigin` is the external HTTP(S) URL of the runtime. A path such as
`/connector` is a mount prefix: every forwarded request must include it, and
`connector.fetch()` returns 404 for anything outside that prefix. Preserve the
original request URL when you forward.

## Options

`createConnectorRuntime(options)`:

| Option                   | Purpose                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `dataDir`                | Writable directory for SQLite, local transit files, and upload staging. Required.                                    |
| `publicOrigin`           | External HTTP(S) URL. A path is a mount prefix. Required.                                                            |
| `encryptionKey`          | Encrypts stored credentials and OAuth state. Omit to store them in plain text.                                       |
| `adminToken`             | Bearer token for management APIs. Omit to leave them open.                                                           |
| `runtimeToken`           | Static bearer token for `/v1` and `/mcp`. JWT and admin-issued tokens are alternatives.                              |
| `jwt`                    | `{ jwksUri, issuer, audience }` to verify `/v1` bearer tokens as JWTs.                                               |
| `postgres`               | `{ connectionString }` to use PostgreSQL instead of SQLite under `dataDir`.                                          |
| `actionPolicy`           | Allow or block actions and proxies by name (`service.*` and `*` are accepted).                                       |
| `transitFiles`           | TTL, size limit, and optional S3 for files exchanged with providers.                                                 |
| `network`                | Private-network and trusted-host egress policy. Process-wide.                                                        |
| `apiReference`           | Serve `/docs` API-reference HTML. Off by default. Authorization completion pages are always on.                      |
| `oauthCloseDelaySeconds` | Seconds the OAuth completion page waits before closing its window. Defaults to 5; `0` closes it as soon as it loads. |
| `customProviders`        | Providers registered next to the bundled ones. See [Custom providers](#custom-providers).                            |
| `logger`                 | `{ error, info, warn }`. Omit for silence.                                                                           |

`connector.fetch(request)` is the HTTP boundary: `/v1/*`, `/mcp`,
`/oauth/callback`, and admin `/api/*`. `connector.close()` aborts in-flight
work and closes owned storage. It is safe to call more than once.

## Custom providers

`customProviders` registers providers that are not part of this package, such as private integrations or a variant of a
bundled provider with different authentication, without changing the shared catalog:

```ts
import { createConnectorRuntime } from "@oomol-lab/open-connector";
import { customCrm } from "./providers/custom-crm.ts";
import { hubspotRest } from "./providers/hubspot-rest.ts";

const runtime = await createConnectorRuntime({
  dataDir: "./data/connector",
  publicOrigin: "https://app.example.com/connector",
  customProviders: [customCrm, hubspotRest],
});
```

These are registered in code by the host and live only as long as the process. They are separate from
[custom MCP services](https://github.com/oomol-lab/open-connector/blob/main/docs/custom-mcp.md), which an administrator
adds through `/api/custom-mcp` and which are stored in the runtime database.

Each entry is a `CustomProvider`: a catalog `definition` and a `load` that returns the same executor module bundled
providers use (`executors`, and optionally `credentialValidators`, `proxy`, `oauth` and `triggers`). A minimal API-key
provider:

```ts
// providers/custom-crm.ts
import {
  type CustomProvider,
  defineApiKeyProviderExecutors,
  defineProviderAction,
  ProviderRequestError,
  s,
} from "@oomol-lab/open-connector/provider";

const listContacts = defineProviderAction("custom_crm", {
  name: "list_contacts",
  description: "List contacts.",
  operationType: "read",
  inputSchema: s.object("List input.", { limit: s.number("Maximum number of contacts.") }),
  outputSchema: s.object("List output.", { contacts: s.array("Contacts.", s.object("A contact.", {})) }),
});

export const customCrm: CustomProvider = {
  definition: {
    service: "custom_crm",
    displayName: "Custom CRM",
    categories: ["CRM"],
    authTypes: ["api_key"],
    auth: [{ type: "api_key", label: "API key" }],
    actions: [listContacts],
  },
  load: async () => ({
    executors: defineApiKeyProviderExecutors("custom_crm", {
      async list_contacts(input, { apiKey, fetcher, signal }) {
        const url = new URL("https://api.crm.example.com/contacts");
        if (typeof input.limit === "number") url.searchParams.set("limit", String(input.limit));
        const response = await fetcher(url, { headers: { authorization: `Bearer ${apiKey}` }, signal });
        if (!response.ok) throw new ProviderRequestError(response.status, "Custom CRM request failed");
        return { contacts: await response.json() };
      },
    }),
  }),
};
```

A variant of a bundled provider, such as HubSpot over its REST API with an API key, is defined the same way under its
own `service` id (for example `hubspot_rest`).

Import the `CustomProvider` type and authoring helpers from `@oomol-lab/open-connector/provider`. Define actions with
`defineProviderAction` and the `s` schema helpers. For executors, choose `defineApiKeyProviderExecutors`,
`defineOAuthProviderExecutors`, `defineBearerProviderExecutors`, or use `defineProviderExecutors` for a custom
execution context. Use `defineProviderProxy` to expose an authenticated proxy.

Provider code runs in the host process. Register providers you trust. Send requests through the executor's `fetcher`
and pass its `signal` so the runtime applies its network policy, HTTP dispatch, and cancellation. In a credential
validator or hand-written proxy, use `providerFetch`. For a self-hosted service on a private network, pass
`{ allowPrivateNetwork: isPrivateNetworkAccessAllowed }` to the executor adapter or `createProviderFetch` for requests
to the configured service instance. Throw `ProviderRequestError` to report a provider HTTP failure.

Custom providers are listed and searched with the bundled catalog and use the same connection, credential validation,
`actionPolicy`, runtime token grants and scopes, `/v1/actions`, proxy and trigger paths. Their `load` runs once, on the
first action, proxy, credential validation, trigger or OAuth operation; concurrent first calls share it, and a rejected
load is tried again on the next call. Startup fails when a `service` id is already bundled or appears twice, when it is
not a valid provider id, or when a definition's action, trigger or trigger permission does not start with `<service>.`.
It also fails when a custom MCP service stored in the runtime database uses the same `service` id. Triggers in the
loaded module are checked the same way when `load` runs, and a mismatch fails that load.
`getConnectorBuildOptions({ providers })` only selects bundled providers; it does not affect custom providers.

The npm package runs on Node.js and Bun only. To register custom providers on Cloudflare Workers, deploy from a checkout
of this repository; see [Custom providers on Workers](https://github.com/oomol-lab/open-connector/blob/main/docs/cloudflare.md#custom-providers).

## Provider Triggers

Provider Triggers use the same headless runtime and selected provider registry as Actions. Grant explicit `allowedTriggers` on a persistent runtime token to manage remote subscriptions; public proxy grants are independent. Runtime shutdown cancels and waits for maintenance. Include the generated catalog and migrations supplied by `getConnectorBuildOptions`; selected-provider builds include only those providers' Trigger executors. See the [Trigger runtime reference](https://github.com/oomol-lab/open-connector/blob/main/docs/runtime-api.md#provider-triggers) for request shapes and cleanup.

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

To include only selected providers, use the build helper:

```ts
import { getConnectorBuildOptions } from "@oomol-lab/open-connector/build";

const prepared = await getConnectorBuildOptions({ providers: ["github", "slack"] });
try {
  await Bun.build({
    entrypoints: ["./server.ts"],
    target: "bun",
    format: "esm",
    splitting: true,
    plugins: prepared.plugins,
    external: prepared.external,
    compile: { outfile: "./app", assets: prepared.assets },
  });
} finally {
  await prepared.dispose();
}
```

Omitting options or `providers` includes all providers; `providers: []` includes
none. Unknown IDs fail preparation. Selection includes each provider's complete
executor module and catalog entry, including authentication and action schemas.
Shared runtime code and migrations remain included. The runtime API is unchanged,
and the installed npm package still contains all providers.

## Documentation

- [Runtime API and MCP](https://github.com/oomol-lab/open-connector/blob/main/docs/runtime-api.md)
- [Programmatic connections](https://github.com/oomol-lab/open-connector/blob/main/docs/programmatic-connections.md)
- [SDK and CLI](https://github.com/oomol-lab/open-connector/blob/main/docs/sdk-cli.md)
- [Source repository](https://github.com/oomol-lab/open-connector)

## License

[OpenConnector License](https://github.com/oomol-lab/open-connector/blob/main/LICENSE.txt), a modified
Apache License 2.0. Providing OpenConnector to third parties as a hosted connector service requires a
commercial license from OOMOL. See
[NOTICE.md](https://github.com/oomol-lab/open-connector/blob/main/NOTICE.md).
