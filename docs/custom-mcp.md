# Custom MCP services

Administrators can add remote MCP servers from **Providers → Add MCP service**. Connect discovers the server's tools and exposes each tool as an ordinary action, including its description and input/output schemas. Custom actions appear in the provider catalog, `/v1/actions/search`, and the Connect MCP interface, and use the existing action execution API.

Choose a name that differs from existing provider names. Names are compared without surrounding whitespace or case differences. The service identifier defaults to a name-derived value and can be set explicitly when creating the service. Use 1–100 lowercase letters, digits, underscores or hyphens, distinct from all existing provider identifiers. Names without a usable Latin identifier require an explicit value. The identifier is fixed after creation; renaming the display name does not change service or action IDs.

## Connections

Each service has one fixed endpoint and supports multiple connections. Supported authentication methods are:

- **No authentication**: tools are discovered when the service is added.
- **API key / Headers**: define header names and optional prefixes, then enter each connection's values in the existing connection form. For example, `Authorization` with the prefix `Bearer `, or `X-API-Key` with an empty prefix.
- **OAuth**: Connect discovers authorization endpoints and registers a public PKCE client when supported. By default, the registered client is named `OOMOL Connect`. Set `OOMOL_CONNECT_CUSTOM_MCP_CLIENT_NAME`, `OOMOL_CONNECT_CUSTOM_MCP_CLIENT_LOGO_URI` and `OOMOL_CONNECT_CUSTOM_MCP_CLIENT_URI` to show your own name and links on consent screens. Services registered earlier keep their client. Supply a client ID and optional secret for a pre-registered application. Manual endpoint configuration is available when discovery is unavailable. Authorize an account after registering the service.

Client ID Metadata Documents, credentials embedded in URLs, query-parameter keys, stdio servers, and MCP resources/prompts are not supported by this feature. The HTTP transports are Streamable HTTP and legacy SSE. Use the final endpoint URL; redirects are not followed.

The endpoint uses the existing deployment network policy. Private instance addresses require `OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK`; loopback and metadata addresses remain blocked. Workers cannot reach private networks.

Connection secrets and OAuth client configuration use the existing secret codec. Configure `OOMOL_CONNECT_ENCRYPTION_KEY` to encrypt stored credentials.

## Tool discovery

The first saved connection automatically discovers tools. Subsequent connections do not replace a successfully published tool set. Select a connection in the service settings and choose **Sync tools** to refresh it. Different accounts may expose different tools; Connect publishes only the selected connection's tool set.

A failed sync preserves the last successful tool set and records an error. Successful synchronization with an empty tool list removes the previous actions. Definitions are stored in the runtime database and survive restarts; no provider source files or catalog JSON files are generated. The tool snapshot is limited to 512 KiB.

Calls use the selected, authorized connection, never the discovery connection as a fallback. Existing action and connection policies apply. An action wildcard such as `team_inventory.*` also covers tools added by later synchronization.

Disable a service to remove its tools from discovery and execution while retaining its configuration and connections. Remove its connections before deleting the service. The endpoint and authentication layout are fixed after creation; add a new service to change them.

## Management API

These routes require administrator access under the deployment's existing authentication settings:

| Method               | Route                            | Purpose                                        |
| -------------------- | -------------------------------- | ---------------------------------------------- |
| GET / POST           | `/api/custom-mcp`                | List or register services                      |
| GET / PATCH / DELETE | `/api/custom-mcp/{service}`      | Inspect, rename, enable, disable or delete     |
| POST                 | `/api/custom-mcp/{service}/sync` | Discover tools, optionally with `connectionId` |

A header-authenticated service can be registered with:

```json
{
  "service": "team_inventory",
  "displayName": "Team inventory",
  "endpoint": "https://inventory.example.com/mcp",
  "auth": {
    "type": "headers",
    "headers": [{ "name": "Authorization", "prefix": "Bearer " }]
  }
}
```

Create its credentials through the existing connection API using `authType: "custom_credential"` and `values: { "Authorization": "your-token" }`. Tool discovery failures are reported in `syncError` without discarding the saved connection. See `/openapi.json` for management request schemas.
