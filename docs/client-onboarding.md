# Use your self-hosted gateway from a client

After deploying OpenConnector, open **Connect clients** in the Web Console. It provides MCP, CLI,
and SDK examples that use your gateway address. Changing that address also updates the examples on
Action detail pages during the same console session.

## 1. Choose the gateway address and token

Use an address reachable from the device running your client, such as `https://connect.example.com`.
`localhost` refers to that client device, so it works only when the gateway is on the same machine.
CLI and SDK use the base URL; MCP appends `/mcp`. Do not append `/v1` yourself.

If the gateway requires authentication, create a **Runtime Token** on its API Key page. Grant the
Actions and connections that this client needs. Replace `<RUNTIME_TOKEN>` in the examples below.
For a runtime without authentication, omit the token.

These credentials serve different purposes:

- **Runtime Token**: authorizes your client to call your self-hosted gateway.
- **OOMOL Key**: enables OOMOL-hosted services inside the gateway.
- **Provider credentials**: connect your own provider accounts; these stay on the gateway.

## 2. Connect a client

### MCP: agent clients

Add this server to an MCP client supporting remote HTTP servers and Authorization headers:

```json
{
  "mcpServers": {
    "open-connector": {
      "url": "https://connect.example.com/mcp",
      "headers": { "Authorization": "Bearer <RUNTIME_TOKEN>" }
    }
  }
}
```

For unauthenticated runtimes, remove `headers`. The endpoint supports stateless POST JSON-RPC;
it does not provide a persistent GET SSE stream.

Ask the agent to use `search_actions` to find an Action, then `get_action_guide` to inspect its
contract. Use `list_connections` when you need to choose an account, and `execute_action` to run it.
A first call requiring no provider credentials is:

```json
{ "actionId": "hackernews.get_top_stories", "input": {} }
```

### CLI: terminals, scripts, and local agents

Install oo on the client device:

```bash
curl -fsSL https://cli.oomol.com/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://cli.oomol.com/install.ps1 | iex
```

Set the target in the same terminal. Environment configuration has the highest priority, including
when `OO_API_KEY` or a saved hosted account is present:

```bash
export OO_CONNECTOR_URL='https://connect.example.com'
export OO_CONNECTOR_TOKEN='<RUNTIME_TOKEN>'

oo connector search "top stories"
oo connector schema hackernews.get_top_stories
oo connector run hackernews --action get_top_stories --data '{}'
```

For an unauthenticated runtime, leave `OO_CONNECTOR_TOKEN` unset. In PowerShell, set environment
variables using `$env:OO_CONNECTOR_URL` and `$env:OO_CONNECTOR_TOKEN`.

You can also save a gateway for later sessions:

```bash
oo connector login https://connect.example.com --token '<RUNTIME_TOKEN>'
```

`OO_CONNECTOR_URL` overrides saved configuration. `OO_API_KEY` also outranks saved self-hosted
configuration, so use `OO_CONNECTOR_URL` when you need to select your gateway explicitly.
These connector commands do not require signing in to an OOMOL account. Other hosted oo capabilities
use their own OOMOL authentication.

### SDK: application code

Install the TypeScript client:

```bash
npm install @oomol-lab/connector
export OOMOL_CONNECT_RUNTIME_TOKEN='<RUNTIME_TOKEN>'
```

Use `OpenConnector` for the self-hosted runtime:

```ts
import { OpenConnector } from "@oomol-lab/connector";

const gateway = new OpenConnector({
  baseUrl: "https://connect.example.com",
  runtimeToken: process.env.OOMOL_CONNECT_RUNTIME_TOKEN,
});

await gateway.health();
const matches = await gateway.catalog.search("top stories");
const action = await gateway.catalog.action("hackernews.get_top_stories");
const result = await gateway.execute("hackernews.get_top_stories", {});
console.log(result);
```

The SDK sends requests; provider execution and credentials stay on the gateway. The separate
`Connector` and `ProjectConnector` clients target OOMOL-hosted personal and project workflows.

## 3. Use your own services

Once the first call succeeds, configure a provider in the Web Console, find an Action on the Actions
page, inspect its schema, and copy its CLI or SDK example. The examples use your selected gateway
address and connection name. Replace example values with your own business inputs.

Select a named connection in the CLI:

```bash
oo connector apps github
oo connector run github --action get_current_user --connection-name work --data '{}'
```

Select it from the SDK:

```ts
await gateway.execute("github.get_current_user", {}, { connectionName: "work" });
```

For actions that return a task ID, use the provider's result/status Action to follow progress.
The self-hosted CLI integration does not expose `--wait` / `--wait-result` lifecycle handling.

If a call fails, check the gateway's Run logs and the client's error response. Verify that the
Runtime Token grants the selected Action and connection, and that the provider is connected.
`executeRaw` also returns an execution ID for SDK callers.

## More detail

- [CLI self-hosted guide](https://github.com/oomol-lab/oo-cli/blob/main/docs/self-hosted-connector.md)
- [SDK self-hosted guide](https://github.com/oomol-lab/connector-sdk#self-hosted-runtime)
- [Runtime API and MCP](runtime-api.md)
- [SDK and CLI reference](sdk-cli.md)
- [中文接入指南](client-onboarding.zh-CN.md)
