import type { OAuth2AuthDefinition, ResolvedCredential } from "../core/types.ts";

import { optionalString, requiredString } from "../core/cast.ts";
import { readBoundedResponseBytes } from "../core/request.ts";

const oauthTokenRequestTimeoutMs = 30_000;
const oauthTokenResponseMaxBytes = 1024 * 1024;

export interface OAuthTokenRequestOptions {
  clientId: string;
  clientSecret: string;
  responseEnvelope?: OAuth2AuthDefinition["tokenResponseEnvelope"];
  tokenRequestFields?: OAuth2AuthDefinition["tokenRequestFields"];
  tokenEndpointAuthMethod: "client_secret_basic" | "client_secret_post" | "none";
  tokenRequestFormat?: "form" | "json";
  tokenUrl: string;
  sensitiveValues?: string[];
}

interface AuthorizationCodeTokenRequest extends OAuthTokenRequestOptions {
  code: string;
  redirectUri: string;
  extraFields?: Record<string, string>;
  createError: OAuthTokenErrorFactory;
}

interface RefreshTokenRequest extends OAuthTokenRequestOptions {
  refreshToken: string;
  createError: OAuthTokenErrorFactory;
}

interface ClientCredentialsTokenRequest extends OAuthTokenRequestOptions {
  scopes: string[];
  scopeSeparator?: " " | ",";
  extraFields?: Record<string, string>;
  createError: OAuthTokenErrorFactory;
}

interface TokenRequest extends OAuthTokenRequestOptions {
  fields: Record<string, string>;
  createError: OAuthTokenErrorFactory;
}

export type OAuthTokenErrorFactory = (message: string) => Error;

export function createClientCredentialsExtraFields(
  auth: OAuth2AuthDefinition,
  config: { extra: Record<string, string>; secretExtra: Record<string, string> },
): Record<string, string> | undefined {
  const fields = Object.entries(auth.tokenRequestFields?.clientCredentials?.configFields ?? {}).flatMap(
    ([requestField, configField]) => {
      const value = config.extra[configField] ?? config.secretExtra[configField];
      return value === undefined ? [] : [[requestField, value] as const];
    },
  );
  return fields.length > 0 ? Object.fromEntries(fields) : undefined;
}

export async function requestAuthorizationCodeToken(
  input: AuthorizationCodeTokenRequest,
): Promise<Extract<ResolvedCredential, { authType: "oauth2" }>> {
  return requestToken({
    ...input,
    fields: createAuthorizationCodeFields(input),
  });
}

export async function requestRefreshToken(
  input: RefreshTokenRequest,
): Promise<Extract<ResolvedCredential, { authType: "oauth2" }>> {
  return requestToken({
    ...input,
    fields: createRefreshTokenFields(input),
  });
}

export async function requestClientCredentialsToken(
  input: ClientCredentialsTokenRequest,
): Promise<Extract<ResolvedCredential, { authType: "oauth2" }>> {
  return requestToken({
    ...input,
    fields: createClientCredentialsFields(input),
  });
}

async function requestToken(input: TokenRequest): Promise<Extract<ResolvedCredential, { authType: "oauth2" }>> {
  const fields: Record<string, string> = { ...input.fields };
  const clientIdField = input.tokenRequestFields?.clientId;
  if (clientIdField !== false) {
    fields[clientIdField ?? "client_id"] = input.clientId;
  }
  const headers: Record<string, string> = {
    accept: "application/json",
  };
  let body: BodyInit;

  if (input.tokenEndpointAuthMethod === "client_secret_basic") {
    headers.authorization = `Basic ${Buffer.from(
      `${encodeOAuthBasicCredential(input.clientId)}:${encodeOAuthBasicCredential(input.clientSecret)}`,
    ).toString("base64")}`;
  } else if (input.tokenEndpointAuthMethod === "client_secret_post") {
    const clientSecretField = input.tokenRequestFields?.clientSecret;
    if (clientSecretField !== false) {
      fields[clientSecretField ?? "client_secret"] = input.clientSecret;
    }
  }

  if (input.tokenRequestFormat === "json") {
    headers["content-type"] = "application/json";
    body = JSON.stringify(fields);
  } else {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(fields);
  }

  let response: Response;
  try {
    response = await fetch(input.tokenUrl, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(oauthTokenRequestTimeoutMs),
    });
  } catch (error) {
    throw input.createError(
      error instanceof Error && error.name === "TimeoutError"
        ? "OAuth token request timed out."
        : "OAuth token request failed.",
    );
  }
  const rawPayload = await readTokenPayload(response, input.createError);
  const payload = unwrapTokenPayload(rawPayload, input.responseEnvelope);
  if (!response.ok || !isEnvelopeSuccess(rawPayload, input.responseEnvelope)) {
    const message = readTokenErrorMessage(rawPayload, payload, input.responseEnvelope) ?? "OAuth token request failed.";
    throw input.createError(sanitizeTokenErrorMessage(message, [input.clientSecret, ...(input.sensitiveValues ?? [])]));
  }

  const accessToken = requiredString(payload.access_token ?? payload.token, "access_token", input.createError);
  const tokenType = optionalString(payload.token_type) ?? "Bearer";
  const expiresIn = parseExpiresIn(payload.expires_in);
  const grantedScopes = parseGrantedScopes(payload.scope);
  return {
    authType: "oauth2",
    accessToken,
    tokenType,
    refreshToken: optionalString(payload.refresh_token),
    expiresAt: expiresIn !== undefined ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined,
    profile: {
      accountId: "oauth2",
      displayName: "OAuth Credential",
      grantedScopes,
    },
    metadata: createTokenMetadata(payload),
  };
}

function parseExpiresIn(value: unknown): number | undefined {
  const expiresIn = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(expiresIn) ? expiresIn : undefined;
}

function parseGrantedScopes(value: unknown): string[] {
  const scopes = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/) : [];
  return [
    ...new Set(
      scopes
        .filter((scope): scope is string => typeof scope === "string" && scope.trim() !== "")
        .map((scope) => scope.trim()),
    ),
  ];
}

function sanitizeTokenErrorMessage(message: string, sensitiveValues: string[]): string {
  let sanitized = message.replaceAll(/[\r\n]+/g, " ");
  for (const value of sensitiveValues) {
    if (value) {
      sanitized = sanitized.replaceAll(value, "[redacted]");
    }
  }
  return sanitized.slice(0, 1000);
}

async function readTokenPayload(
  response: Response,
  createError: OAuthTokenErrorFactory,
): Promise<Record<string, unknown>> {
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: oauthTokenResponseMaxBytes,
    fieldName: "OAuth token response",
    createError,
  });
  if (bytes.byteLength === 0) {
    return {};
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return typeof payload === "object" && payload != null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function createTokenMetadata(payload: Record<string, unknown>): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!isSensitiveTokenResponseField(key)) {
      metadata[key] = value;
    }
  }
  metadata.rawTokenType = payload.token_type;
  metadata.scope = payload.scope;
  return metadata;
}

function isSensitiveTokenResponseField(key: string): boolean {
  const normalized = key.replaceAll("_", "").replaceAll("-", "").toLowerCase();
  return ["accesstoken", "refreshtoken", "idtoken", "token", "clientsecret", "secret"].includes(normalized);
}

function encodeOAuthBasicCredential(value: string): string {
  return new URLSearchParams({ value }).toString().slice("value=".length);
}

function createAuthorizationCodeFields(input: AuthorizationCodeTokenRequest): Record<string, string> {
  const fields: Record<string, string> = {};
  const fieldMap = input.tokenRequestFields;
  setMappedField(
    fields,
    fieldMap?.authorizationCode?.grantType ?? fieldMap?.grantType,
    "grant_type",
    "authorization_code",
  );
  setMappedField(fields, fieldMap?.authorizationCode?.code ?? fieldMap?.code, "code", input.code);
  setMappedField(
    fields,
    fieldMap?.authorizationCode?.redirectUri ?? fieldMap?.redirectUri,
    "redirect_uri",
    input.redirectUri,
  );
  return {
    ...fields,
    ...(input.extraFields ?? {}),
  };
}

function createRefreshTokenFields(input: RefreshTokenRequest): Record<string, string> {
  const fields: Record<string, string> = {};
  const fieldMap = input.tokenRequestFields;
  setMappedField(fields, fieldMap?.refresh?.grantType ?? fieldMap?.grantType, "grant_type", "refresh_token");
  setMappedField(
    fields,
    fieldMap?.refresh?.refreshToken ?? fieldMap?.refreshToken,
    "refresh_token",
    input.refreshToken,
  );
  return fields;
}

function createClientCredentialsFields(input: ClientCredentialsTokenRequest): Record<string, string> {
  const fields: Record<string, string> = { ...(input.extraFields ?? {}) };
  const fieldMap = input.tokenRequestFields?.clientCredentials;
  setMappedField(
    fields,
    fieldMap?.grantType ?? input.tokenRequestFields?.grantType,
    "grant_type",
    "client_credentials",
  );
  if (input.scopes.length > 0) {
    setMappedField(fields, fieldMap?.scope, "scope", input.scopes.join(input.scopeSeparator ?? " "));
  }
  return fields;
}

function setMappedField(
  fields: Record<string, string>,
  fieldName: string | false | undefined,
  defaultFieldName: string,
  value: string,
): void {
  if (fieldName !== false) {
    fields[fieldName ?? defaultFieldName] = value;
  }
}

function unwrapTokenPayload(
  payload: Record<string, unknown>,
  envelope: OAuth2AuthDefinition["tokenResponseEnvelope"],
): Record<string, unknown> {
  if (!envelope) {
    return payload;
  }

  const nested = payload[envelope.dataField];
  return typeof nested === "object" && nested != null && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : {};
}

function isEnvelopeSuccess(
  payload: Record<string, unknown>,
  envelope: OAuth2AuthDefinition["tokenResponseEnvelope"],
): boolean {
  if (!envelope?.codeField) {
    return true;
  }

  return payload[envelope.codeField] === (envelope.successCode ?? 0);
}

function readTokenErrorMessage(
  rawPayload: Record<string, unknown>,
  payload: Record<string, unknown>,
  envelope: OAuth2AuthDefinition["tokenResponseEnvelope"],
): string | undefined {
  return (
    optionalString(rawPayload.error_description) ??
    optionalString(payload.error_description) ??
    optionalString(envelope?.messageField ? rawPayload[envelope.messageField] : undefined) ??
    optionalString(rawPayload.error) ??
    optionalString(payload.error)
  );
}
