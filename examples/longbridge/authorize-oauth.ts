import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { adminHeaders, fetchJson } from "../local-http/client.ts";
import { buildLongbridgeOAuthRegistrationBody, readRegisteredLongbridgeOAuthClient } from "./register-oauth-client.ts";

const defaultRuntimeOrigin = "http://localhost:3000";
const longbridgeRegistrationUrl = "https://openapi.longbridge.com/oauth2/register";
const defaultClientName = "OpenConnector Longbridge Verification";
const defaultTimeoutMs = 5 * 60 * 1000;
const defaultPollIntervalMs = 1000;

interface OAuthClientConfigSummary {
  service: string;
  expectedRedirectUri: string;
}

interface OAuthAuthorizationStart {
  authorizationUrl?: string;
  state?: string;
}

interface ConnectionSummary {
  service?: string;
  connectionName?: string;
  configured?: boolean;
}

interface LongbridgeOAuthAuthorizeOptions {
  runtimeOrigin?: string;
  clientName?: string;
  connectionName?: string;
  openBrowser?: boolean;
  wait?: boolean;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

interface LongbridgeOAuthAuthorizeCliOptions extends LongbridgeOAuthAuthorizeOptions {
  help?: boolean;
}

export function normalizeLongbridgeRuntimeOrigin(value: string | undefined): string {
  return (value?.trim() || defaultRuntimeOrigin).replace(/\/+$/, "");
}

export function buildLongbridgeAuthorizationStartBody(connectionName?: string): Record<string, string> {
  const trimmedConnectionName = connectionName?.trim();
  return trimmedConnectionName
    ? { service: "longbridge", connectionName: trimmedConnectionName }
    : { service: "longbridge" };
}

export function readLongbridgeOAuthConfig(configs: OAuthClientConfigSummary[]): OAuthClientConfigSummary {
  const config = configs.find((item) => item.service === "longbridge");
  if (!config) {
    throw new Error("The running OpenConnector runtime does not expose a Longbridge OAuth config.");
  }
  return config;
}

export function isLongbridgeConnectionReady(
  connections: ConnectionSummary[],
  connectionName: string | undefined,
): boolean {
  const trimmedConnectionName = connectionName?.trim();
  return connections.some(
    (connection) =>
      connection.service === "longbridge" &&
      connection.configured === true &&
      (!trimmedConnectionName || connection.connectionName === trimmedConnectionName),
  );
}

export async function authorizeLongbridgeOAuth(options: LongbridgeOAuthAuthorizeOptions = {}): Promise<void> {
  const runtimeOrigin = normalizeLongbridgeRuntimeOrigin(options.runtimeOrigin ?? process.env.OOMOL_CONNECT_API_ORIGIN);
  const clientName = options.clientName?.trim() || process.env.LONGBRIDGE_CLIENT_NAME || defaultClientName;
  const connectionName = options.connectionName?.trim() || process.env.LONGBRIDGE_CONNECTION_NAME;
  const openBrowser = options.openBrowser ?? true;
  const wait = options.wait ?? true;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const pollIntervalMs = options.pollIntervalMs ?? defaultPollIntervalMs;

  const config = readLongbridgeOAuthConfig(
    await fetchJson<OAuthClientConfigSummary[]>(`${runtimeOrigin}/api/oauth/configs`, {
      headers: adminHeaders(),
    }),
  );

  const registered = readRegisteredLongbridgeOAuthClient(
    await fetchJson(longbridgeRegistrationUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildLongbridgeOAuthRegistrationBody({
          redirectUri: config.expectedRedirectUri,
          clientName,
        }),
      ),
    }),
  );

  await fetchJson(`${runtimeOrigin}/api/oauth/configs/longbridge`, {
    method: "PUT",
    headers: adminHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({
      clientId: registered.clientId,
      clientSecret: registered.clientSecret,
    }),
  });

  const authorization = await fetchJson<OAuthAuthorizationStart>(`${runtimeOrigin}/api/oauth/authorizations`, {
    method: "POST",
    headers: adminHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(buildLongbridgeAuthorizationStartBody(connectionName)),
  });
  if (!authorization.authorizationUrl) {
    throw new Error("OpenConnector did not return an authorization URL.");
  }

  console.log("Registered and stored a Longbridge OAuth client.");
  console.log(`Client ID: ${registered.clientId}`);
  console.log("Open this URL to authorize Longbridge:");
  console.log(authorization.authorizationUrl);

  if (openBrowser) {
    await openExternalUrl(authorization.authorizationUrl);
  }

  if (wait) {
    await waitForLongbridgeConnection({
      runtimeOrigin,
      connectionName,
      timeoutMs,
      pollIntervalMs,
    });
    console.log("Longbridge OAuth authorization completed and the runtime connection is ready.");
  }
}

async function waitForLongbridgeConnection(input: {
  runtimeOrigin: string;
  connectionName?: string;
  timeoutMs: number;
  pollIntervalMs: number;
}): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= input.timeoutMs) {
    const connections = await fetchJson<ConnectionSummary[]>(`${input.runtimeOrigin}/api/connections`, {
      headers: adminHeaders(),
    });
    if (isLongbridgeConnectionReady(connections, input.connectionName)) {
      return;
    }
    await delay(input.pollIntervalMs);
  }
  throw new Error(
    `Timed out waiting for Longbridge OAuth authorization after ${Math.ceil(input.timeoutMs / 1000)} seconds.`,
  );
}

async function openExternalUrl(url: string): Promise<void> {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  await new Promise<void>((resolvePromise) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", () => resolvePromise());
    child.on("spawn", () => {
      child.unref();
      resolvePromise();
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function parseCliOptions(args: string[]): LongbridgeOAuthAuthorizeCliOptions {
  const options: LongbridgeOAuthAuthorizeCliOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--no-open") {
      options.openBrowser = false;
      continue;
    }
    if (arg === "--no-wait") {
      options.wait = false;
      continue;
    }

    const value = args[index + 1];
    if (!value) {
      throw new Error(`${arg} requires a value.`);
    }
    if (arg === "--runtime-origin") {
      options.runtimeOrigin = value;
    } else if (arg === "--client-name") {
      options.clientName = value;
    } else if (arg === "--connection-name") {
      options.connectionName = value;
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = readPositiveInteger(value, arg);
    } else if (arg === "--poll-ms") {
      options.pollIntervalMs = readPositiveInteger(value, arg);
    } else {
      throw new Error(`Unknown option: ${arg}.`);
    }
    index += 1;
  }
  return options;
}

function readPositiveInteger(value: string, fieldName: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  throw new Error(`${fieldName} must be a positive integer.`);
}

function printUsage(): void {
  console.log(`Usage:
  node examples/longbridge/authorize-oauth.ts [options]

Options:
  --runtime-origin URL     OpenConnector runtime origin. Default: http://localhost:3000
  --client-name NAME       Longbridge OAuth client name.
  --connection-name NAME   Optional OpenConnector connection name.
  --timeout-ms MS          Wait timeout. Default: 300000
  --poll-ms MS             Connection polling interval. Default: 1000
  --no-open                Print the authorization URL without opening a browser.
  --no-wait                Do not wait for OAuth callback completion.

Environment:
  OOMOL_CONNECT_API_ORIGIN     Same as --runtime-origin.
  OOMOL_CONNECT_ADMIN_TOKEN    Bearer token for protected admin APIs.
  LONGBRIDGE_CLIENT_NAME       Same as --client-name.
  LONGBRIDGE_CONNECTION_NAME   Same as --connection-name.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseCliOptions(process.argv.slice(2));
  if (options.help) {
    printUsage();
  } else {
    await authorizeLongbridgeOAuth(options);
  }
}
