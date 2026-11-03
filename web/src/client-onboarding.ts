export interface ClientActionExample {
  id: string;
  service: string;
  name: string;
  input: unknown;
  connectionName?: string;
}

/** Accepts a client-reachable gateway base URL, including a reverse-proxy path prefix. */
export function normalizeGatewayUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.href.includes("?") ||
      url.href.includes("#")
    )
      return undefined;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

/** Quote example values for a POSIX shell without evaluating substitutions. */
export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function buildMcpClientConfig(baseUrl: string, authenticated: boolean): string {
  const server: { url: string; headers?: Record<string, string> } = { url: `${baseUrl}/mcp` };
  if (authenticated) server.headers = { Authorization: "Bearer <RUNTIME_TOKEN>" };
  return JSON.stringify({ mcpServers: { "open-connector": server } }, null, 2);
}

export interface OAuthDiscoveryUrls {
  /** The MCP resource URI; also the RFC 8707 `resource` parameter value. */
  resource: string;
  protectedResourceMetadata: string;
  authorizationServerMetadata: string;
  registrationEndpoint: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
}

/** OAuth 2.1 grant requirements from the MCP spec; protocol constants, not UI copy. */
export const OAUTH_MCP_REQUIREMENTS: readonly string[] = [
  "PKCE S256 is mandatory; the plain method is rejected.",
  "Send the resource parameter (the MCP resource URI) on the authorize and token requests.",
];

/** Absolute discovery and endpoint URLs the MCP spec requires OAuth 2.1 clients to use. */
export function buildOAuthDiscoveryUrls(baseUrl: string): OAuthDiscoveryUrls {
  return {
    resource: `${baseUrl}/mcp`,
    protectedResourceMetadata: `${baseUrl}/.well-known/oauth-protected-resource/mcp`,
    authorizationServerMetadata: `${baseUrl}/.well-known/oauth-authorization-server`,
    registrationEndpoint: `${baseUrl}/oauth/mcp/register`,
    authorizationEndpoint: `${baseUrl}/oauth/mcp/authorize`,
    tokenEndpoint: `${baseUrl}/oauth/mcp/token`,
    scopes: ["mcp:access", "offline_access"],
  };
}

/** MCP client configuration pointing at the OAuth 2.1 endpoints, same top-level `mcpServers` map as buildMcpClientConfig. */
export function buildMcpOAuthClientConfig(baseUrl: string): string {
  const urls = buildOAuthDiscoveryUrls(baseUrl);
  return JSON.stringify(
    {
      mcpServers: {
        "open-connector": {
          type: "http",
          url: urls.resource,
          auth: "oauth2.1",
          protectedResourceMetadata: urls.protectedResourceMetadata,
          authorizationServerMetadata: urls.authorizationServerMetadata,
          registrationEndpoint: urls.registrationEndpoint,
          authorizationEndpoint: urls.authorizationEndpoint,
          tokenEndpoint: urls.tokenEndpoint,
          scopes: urls.scopes,
        },
      },
    },
    null,
    2,
  );
}

/** Curl examples for fetching the discovery documents. */
export function buildOAuthDiscoveryCurl(baseUrl: string): string {
  const urls = buildOAuthDiscoveryUrls(baseUrl);
  return [
    `curl -fsSL ${shellSingleQuote(urls.protectedResourceMetadata)}`,
    `curl -fsSL ${shellSingleQuote(urls.authorizationServerMetadata)}`,
  ].join("\n");
}

/** Environment configuration takes precedence over both saved CLI targets and hosted OOMOL keys. */
export function buildCliClientSetup(baseUrl: string, authenticated: boolean): string {
  return [
    `export OO_CONNECTOR_URL=${shellSingleQuote(baseUrl)}`,
    authenticated ? `export OO_CONNECTOR_TOKEN='<RUNTIME_TOKEN>'` : "unset OO_CONNECTOR_TOKEN",
  ].join("\n");
}

export function buildPowerShellClientSetup(baseUrl: string, authenticated: boolean): string {
  return [
    `$env:OO_CONNECTOR_URL = '${baseUrl.replace(/'/g, "''")}'`,
    authenticated
      ? '$env:OO_CONNECTOR_TOKEN = "<RUNTIME_TOKEN>"'
      : "Remove-Item Env:OO_CONNECTOR_TOKEN -ErrorAction SilentlyContinue",
  ].join("\n");
}

export function buildSdkClientSetup(baseUrl: string, authenticated: boolean): string {
  return [
    'import { OpenConnector } from "@oomol-lab/connector";',
    "",
    "const gateway = new OpenConnector({",
    `  baseUrl: ${JSON.stringify(baseUrl)},`,
    ...(authenticated ? ["  runtimeToken: process.env.OOMOL_CONNECT_RUNTIME_TOKEN,"] : []),
    "});",
  ].join("\n");
}

export function buildCliActionExample(baseUrl: string, action: ClientActionExample): string {
  const connection = action.connectionName ? ` --connection-name ${shellSingleQuote(action.connectionName)}` : "";
  return [
    `export OO_CONNECTOR_URL=${shellSingleQuote(baseUrl)}`,
    'export OO_CONNECTOR_TOKEN="$OOMOL_CONNECT_RUNTIME_TOKEN"',
    "",
    `oo connector schema ${shellSingleQuote(action.id)}`,
    `oo connector run ${shellSingleQuote(action.service)} --action ${shellSingleQuote(action.name)}${connection} --data ${shellSingleQuote(JSON.stringify(action.input))}`,
  ].join("\n");
}

export function buildSdkActionExample(baseUrl: string, action: ClientActionExample): string {
  const options = action.connectionName ? `, ${JSON.stringify({ connectionName: action.connectionName })}` : "";
  return [
    buildSdkClientSetup(baseUrl, true),
    "",
    `const result = await gateway.execute(${JSON.stringify(action.id)}, ${JSON.stringify(action.input, null, 2)}${options});`,
    "console.log(result);",
  ].join("\n");
}
