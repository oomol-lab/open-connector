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
