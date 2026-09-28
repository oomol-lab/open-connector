# SDK And CLI

OpenConnector can be used directly through MCP and HTTP, and it also has dedicated developer tools
for application and agent workflows. The Connector SDK and `oo CLI` both work with the open-source
runtime and with OOMOL-hosted connector services, using the same provider ids, Action ids, and
schemas.

For the complete deployment-to-first-action walkthrough, start with
[Client onboarding](client-onboarding.md) or [中文接入指南](client-onboarding.zh-CN.md).

## Connector SDK

[Connector SDK](https://github.com/oomol-lab/connector-sdk) is the TypeScript client for calling
connector Actions from apps and agent runtimes. Use it when you want to execute Actions, proxy
upstream provider APIs, or inspect the runtime catalog from code.

Install:

```bash
npm install @oomol-lab/connector
```

For the self-hosted OpenConnector runtime, use `OpenConnector`. `baseUrl` is the server origin, not
a `/v1` URL:

```ts
import { OpenConnector } from "@oomol-lab/connector";

const open = new OpenConnector({
  baseUrl: "http://localhost:3000",
  runtimeToken: process.env.OOMOL_CONNECT_RUNTIME_TOKEN,
});

const stories = await open.hackernews.get_top_stories({});
console.log(stories);
```

For OOMOL-hosted connector services, use `Connector` for personal connections or `ProjectConnector`
for end-user connections in a SaaS product. All clients use the same Action model; the gateway keeps
provider credentials behind the runtime boundary, authorizes the request, and executes the provider
Action. The SDK is a client; provider integrations and the OAuth credential lifecycle run on the
gateway. `OpenConnector.connect.*` can create connections with a separate `adminToken`, while
ordinary Action calls use `runtimeToken`. OAuth client setup, token creation, and deleting
connections remain Web Console administration.

For an end-to-end Gmail OAuth and SDK example, see
[gmail-oauth-sdk.md](gmail-oauth-sdk.md).

## oo CLI

[oo CLI](https://github.com/oomol-lab/oo-cli) is the command-line toolkit for local AI agent
workflows. Use it when you want an agent on your machine to discover, inspect, and call connector
Actions through a consistent command-line entry.

Point connector-family commands at a self-hosted OpenConnector runtime:

```bash
oo connector login http://localhost:3000
oo connector search "send an email"
oo connector schema gmail.send_email
oo connector run gmail --action send_email --data '@payload.json'
```

For authenticated runtimes, create a runtime token in the Web Console Access page and pass it during
login:

```bash
oo connector login https://connector.example.com --token <runtime-token>
```

For containers and CI, use environment variables instead of writing CLI config:

```bash
export OO_CONNECTOR_URL="https://connector.example.com"
export OO_CONNECTOR_TOKEN="<runtime-token>"
oo connector run github --action get_current_user --data '{}'
```

When no self-hosted runtime is configured, connector commands can still route to OOMOL-hosted
connector services through `OO_API_KEY` or the active `oo` account. A self-hosted connector is a
capability override for connector commands, not an `oo` account; non-connector commands such as
hosted LLM, file transfer, and skill publishing still use OOMOL account authentication.

## Protocol APIs

For custom clients, scripts, or agent hosts that do not use the SDK or CLI, use:

- MCP: `http://localhost:3000/mcp`
- HTTP runtime API: `/v1/actions`
- OpenAPI: `/openapi.json`

See [runtime-api.md](runtime-api.md) for protocol-level details.
