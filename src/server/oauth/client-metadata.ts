import type { OAuthTokenEndpointAuthMethod } from "../storage/oauth-as-stores.ts";

import { optionalRecord } from "../../core/cast.ts";
import { accessScope, supportedScopes } from "./config.ts";

/**
 * Client metadata shared by dynamic registration (RFC 7591) and client ID
 * metadata documents. Only the fields this server acts on are kept; everything
 * else a client sends is ignored rather than stored.
 */
export interface OAuthClientMetadata {
  clientId?: string;
  clientName: string;
  redirectUris: string[];
  scopes: string[];
  tokenEndpointAuthMethod: OAuthTokenEndpointAuthMethod;
  grantTypes: string[];
  responseTypes: string[];
}

const authMethods: readonly OAuthTokenEndpointAuthMethod[] = ["none", "client_secret_basic", "client_secret_post"];

export class ClientMetadataError extends Error {
  readonly code: "invalid_client_metadata" | "invalid_redirect_uri";

  constructor(code: "invalid_client_metadata" | "invalid_redirect_uri", message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Validate and normalize raw client metadata. `clientId` is present only for
 * CIMD documents (where it must equal the document URL) and is rejected as a
 * registration field otherwise.
 */
export function normalizeClientMetadata(value: unknown): OAuthClientMetadata | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  const name = typeof record.client_name === "string" ? record.client_name.trim().slice(0, 200) : "";
  const redirectUris = readStringArray(record.redirect_uris);
  if (redirectUris === undefined || redirectUris.length === 0) {
    throw new ClientMetadataError(
      "invalid_redirect_uri",
      "redirect_uris is required and must be a non-empty array of absolute URIs.",
    );
  }
  for (const uri of redirectUris) {
    if (!isValidRedirectUri(uri)) {
      throw new ClientMetadataError("invalid_redirect_uri", `redirect_uri is not acceptable: ${uri}`);
    }
  }
  const method = readAuthMethod(record.token_endpoint_auth_method);
  if (method === undefined && record.token_endpoint_auth_method !== undefined) {
    throw new ClientMetadataError(
      "invalid_client_metadata",
      "token_endpoint_auth_method must be none, client_secret_basic, or client_secret_post.",
    );
  }
  // RFC 7591 section 2: omitted token_endpoint_auth_method defaults to client_secret_basic.
  const authMethod = method ?? "client_secret_basic";
  const scopes = readStringArray(record.scope) ?? readStringArray(record.scopes) ?? [];
  const unknownScope = scopes.find((scope) => !(supportedScopes as readonly string[]).includes(scope));
  if (unknownScope !== undefined) {
    throw new ClientMetadataError("invalid_client_metadata", `Unsupported scope: ${unknownScope}`);
  }
  if (typeof record.client_id === "string" && record.client_id.length > 0) {
    return {
      clientId: record.client_id,
      clientName: name || record.client_id,
      redirectUris,
      scopes: scopes.includes(accessScope) ? [...new Set(scopes)] : [accessScope, ...new Set(scopes)],
      tokenEndpointAuthMethod: authMethod,
      grantTypes: readStringArray(record.grant_types) ?? ["authorization_code"],
      responseTypes: readStringArray(record.response_types) ?? ["code"],
    };
  }
  return {
    clientName: name || "Unnamed client",
    redirectUris,
    scopes: scopes.includes(accessScope) ? [...new Set(scopes)] : [accessScope, ...new Set(scopes)],
    tokenEndpointAuthMethod: authMethod,
    grantTypes: readStringArray(record.grant_types) ?? ["authorization_code"],
    responseTypes: readStringArray(record.response_types) ?? ["code"],
  };
}

/**
 * RFC 8252 loopback redirect URIs may vary the port; every other redirect must
 * match the registered string exactly, so no prefix or wildcard matching exists.
 */
export function isValidRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return false;
  }
  if (url.username || url.password || url.search || url.hash) {
    return false;
  }
  if (url.protocol === "http:") {
    return url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "localhost";
  }
  return true;
}

/** Exact-match comparison with the single RFC 8252 loopback exception (any port). */
export function redirectUriMatches(registered: readonly string[], requested: string): boolean {
  if (registered.includes(requested)) {
    return true;
  }
  let url: URL;
  try {
    url = new URL(requested);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") {
    return false;
  }
  if (url.hostname !== "127.0.0.1" && url.hostname !== "[::1]" && url.hostname !== "localhost") {
    return false;
  }
  url.port = "";
  return registered.some((candidate) => {
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return false;
    }
    parsed.port = "";
    return parsed.toString() === url.toString();
  });
}

function readAuthMethod(value: unknown): OAuthTokenEndpointAuthMethod | undefined {
  return typeof value === "string" && (authMethods as readonly string[]).includes(value)
    ? (value as OAuthTokenEndpointAuthMethod)
    : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (typeof value === "string") {
    return value.split(/[\s+]/).filter((entry) => entry.length > 0);
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return undefined;
  }
  return value as string[];
}
