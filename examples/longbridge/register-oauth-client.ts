import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { adminHeaders, fetchJson } from "../local-http/client.ts";

const defaultRuntimeOrigin = "http://localhost:3000";
const longbridgeRegistrationUrl = "https://openapi.longbridge.com/oauth2/register";
const defaultClientName = "OpenConnector";

interface OAuthClientConfigSummary {
  service: string;
  expectedRedirectUri: string;
}

interface OAuthAuthorizationStart {
  authorizationUrl?: string;
}

export interface LongbridgeOAuthRegistrationBody {
  redirect_uris: string[];
  token_endpoint_auth_method: "none";
  grant_types: ["authorization_code", "refresh_token"];
  response_types: ["code"];
  client_name: string;
}

export interface RegisteredLongbridgeOAuthClient {
  clientId: string;
  clientSecret: string;
}

export function buildLongbridgeOAuthRegistrationBody(input: {
  redirectUri: string;
  clientName?: string;
}): LongbridgeOAuthRegistrationBody {
  const clientName = input.clientName?.trim() || defaultClientName;
  return {
    redirect_uris: [input.redirectUri],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    client_name: clientName,
  };
}

export function readRegisteredLongbridgeOAuthClient(payload: unknown): RegisteredLongbridgeOAuthClient {
  const record = readRecord(readRecord(payload, "registration response").data ?? payload, "registration response");
  const clientId = readNonEmptyString(record.client_id, "client_id");
  return {
    clientId,
    clientSecret: readOptionalString(record.client_secret),
  };
}

export async function registerLongbridgeOAuthClient(): Promise<void> {
  const runtimeOrigin = readRuntimeOrigin();
  const configs = await fetchJson<OAuthClientConfigSummary[]>(`${runtimeOrigin}/api/oauth/configs`, {
    headers: adminHeaders(),
  });
  const longbridgeConfig = configs.find((config) => config.service === "longbridge");
  if (!longbridgeConfig) {
    throw new Error("The running OpenConnector runtime does not expose a Longbridge OAuth config.");
  }

  const registered = readRegisteredLongbridgeOAuthClient(
    await fetchJson(longbridgeRegistrationUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildLongbridgeOAuthRegistrationBody({
          redirectUri: longbridgeConfig.expectedRedirectUri,
          clientName: process.env.LONGBRIDGE_CLIENT_NAME,
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

  const started = await fetchJson<OAuthAuthorizationStart>(`${runtimeOrigin}/api/oauth/authorizations`, {
    method: "POST",
    headers: adminHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ service: "longbridge" }),
  });

  console.log("Registered the Longbridge OAuth client and stored it in OpenConnector.");
  console.log(`Client ID: ${registered.clientId}`);
  if (started.authorizationUrl) {
    console.log("Open this URL in a browser to finish Longbridge authorization:");
    console.log(started.authorizationUrl);
  }
}

function readRuntimeOrigin(): string {
  return (process.env.OOMOL_CONNECT_API_ORIGIN?.trim() || defaultRuntimeOrigin).replace(/\/+$/, "");
}

function readRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function readNonEmptyString(value: unknown, fieldName: string): string {
  const text = readOptionalString(value);
  if (!text) {
    throw new Error(`Longbridge OAuth registration response is missing ${fieldName}.`);
  }
  return text;
}

function readOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await registerLongbridgeOAuthClient();
}
