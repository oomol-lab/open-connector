import type { OAuthClientRecord, IOAuthClientStore, IOAuthTokenStore } from "../storage/oauth-as-stores.ts";
import type { OAuthServerConfig } from "./config.ts";
import type { Context } from "hono";

import { ClientMetadataError, normalizeClientMetadata } from "./client-metadata.ts";
import { hashToken, randomToken } from "./jwks.ts";

/**
 * Dynamic client registration (RFC 7591). Open registration is the MCP default;
 * the endpoint is rate limited at the router. Clients authenticated with a
 * secret get one generated for them; the plaintext is returned exactly once.
 */

export interface RegisterDependencies {
  config: OAuthServerConfig;
  clients: IOAuthClientStore;
  tokens: IOAuthTokenStore;
}

export class RegistrationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function handleRegisterPost(context: Context, deps: RegisterDependencies): Promise<Response> {
  if (!deps.config.allowDynamicRegistration) {
    throw new RegistrationError("access_denied", "Dynamic client registration is disabled.");
  }
  const contentType = context.req.header("content-type") ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new RegistrationError("invalid_client_metadata", "Expected an application/json registration request.");
  }
  let body: unknown;
  try {
    body = JSON.parse(await context.req.text());
  } catch {
    throw new RegistrationError("invalid_client_metadata", "The registration request body is not valid JSON.");
  }
  let metadata;
  try {
    metadata = normalizeClientMetadata(body);
  } catch (error) {
    if (error instanceof ClientMetadataError) {
      throw new RegistrationError(error.code, error.message);
    }
    throw error;
  }
  if (!metadata) {
    throw new RegistrationError(
      "invalid_client_metadata",
      "The registration request body is not a client metadata object.",
    );
  }
  if (metadata.clientId !== undefined) {
    throw new RegistrationError("invalid_client_metadata", "client_id is assigned by the server and must not be sent.");
  }
  const tokenEndpointAuthMethod = metadata.tokenEndpointAuthMethod;
  const clientSecret = tokenEndpointAuthMethod === "none" ? undefined : randomToken(32);
  const record: OAuthClientRecord = {
    clientId: `mcp_${crypto.randomUUID()}`,
    clientName: metadata.clientName,
    registrationType: "dcr",
    redirectUris: metadata.redirectUris,
    scopes: metadata.scopes,
    tokenEndpointAuthMethod,
    clientSecretHash: clientSecret === undefined ? undefined : hashToken(clientSecret),
    createdAt: new Date().toISOString(),
  };
  await deps.clients.add(record);
  return context.json(
    {
      client_id: record.clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.parse(record.createdAt) / 1000),
      client_name: record.clientName,
      redirect_uris: record.redirectUris,
      scopes: record.scopes,
      token_endpoint_auth_method: record.tokenEndpointAuthMethod,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    201,
  );
}
