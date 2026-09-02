import type { OAuth2AuthDefinition } from "../core/types.ts";
import type { OAuthClientConfig } from "./oauth-client-config-service.ts";

import { optionalRecord, optionalString, requiredString } from "../core/cast.ts";
import { readBoundedResponseBytes } from "../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerFetch,
  providerUserAgent,
} from "../providers/provider-runtime.ts";

const oauthTokenResponseMaxBytes = 1024 * 1024;
/** Longest `expires_in` we accept; anything larger overflows the ECMAScript `Date` range. */
const maxExpiresInSeconds = 100 * 365 * 24 * 60 * 60;

class OAuthTokenResponseSizeError extends Error {}

/** Normalized provider token data returned to the shared OAuth lifecycle. */
export interface OAuthTokenResult {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: string;
  metadata: Record<string, unknown>;
}

export interface OAuthCodeExchangeInput {
  code: string;
  clientConfig: OAuthClientConfig;
  redirectUri: string;
  tokenUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  createError(message: string): Error;
}

export interface OAuthAccessTokenRefreshInput {
  refreshToken: string;
  clientConfig: OAuthClientConfig;
  fetcher: typeof fetch;
  createError(message: string): Error;
}

/** Provider-local overrides for token protocols that do not follow the standard OAuth request shape. */
export interface ProviderOAuthRuntime {
  exchangeCode?(input: OAuthCodeExchangeInput): Promise<OAuthTokenResult>;
  refreshAccessToken?(input: OAuthAccessTokenRefreshInput): Promise<OAuthTokenResult>;
}

export interface OAuthTokenRequestOptions {
  clientId: string;
  clientSecret: string;
  responseEnvelope?: OAuth2AuthDefinition["tokenResponseEnvelope"];
  tokenRequestFields?: OAuth2AuthDefinition["tokenRequestFields"];
  tokenEndpointAuthMethod: "client_secret_basic" | "client_secret_post" | "none";
  tokenRequestFormat?: "form" | "json";
  tokenUrl: string;
  signal?: AbortSignal;
}

interface AuthorizationCodeTokenRequest extends OAuthTokenRequestOptions {
  code: string;
  state?: string;
  redirectUri: string;
  extraFields?: Record<string, string>;
  createError: OAuthTokenErrorFactory;
}

interface RefreshTokenRequest extends OAuthTokenRequestOptions {
  refreshToken: string;
  extraFields?: Record<string, string>;
  createError: OAuthTokenErrorFactory;
}

interface TokenRequest extends OAuthTokenRequestOptions {
  fields: Record<string, string>;
  createError: OAuthTokenErrorFactory;
}

export type OAuthTokenErrorFactory = (message: string) => Error;

export async function requestAuthorizationCodeToken(input: AuthorizationCodeTokenRequest): Promise<OAuthTokenResult> {
  return requestToken({
    ...input,
    fields: createAuthorizationCodeFields(input),
  });
}

export async function requestRefreshToken(input: RefreshTokenRequest): Promise<OAuthTokenResult> {
  return requestToken({
    ...input,
    fields: createRefreshTokenFields(input),
  });
}

async function requestToken(input: TokenRequest): Promise<OAuthTokenResult> {
  const fields: Record<string, string> = { ...input.fields };
  const clientIdField = input.tokenRequestFields?.clientId;
  if (clientIdField !== false) {
    fields[clientIdField ?? "client_id"] = input.clientId;
  }
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
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

  const timeout = createProviderTimeout(input.signal);
  let response: Response;
  try {
    response = await providerFetch(input.tokenUrl, {
      method: "POST",
      headers,
      body,
      signal: timeout.signal,
      // Workers has no "error" redirect mode; "manual" surfaces any 3xx as a
      // non-ok response, which the check below rejects. Same intent as "error"
      // (never follow a redirect from the token endpoint), edge-compatible.
      redirect: "manual",
    });
  } catch (error) {
    timeout.cleanup();
    if (input.signal?.aborted) {
      throw input.createError("OAuth token request was cancelled.");
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw input.createError("OAuth token request timed out.");
    }
    // A rejected fetch has no HTTP response to inspect, but the request may
    // still have reached the provider before the connection failed.
    throw input.createError(`OAuth token request failed without an HTTP response: ${describeCause(error)}`);
  }
  try {
    const bytes = await readTokenResponseBytes(response, input.createError);
    const rawPayload = decodeTokenPayload(bytes);
    const payload = unwrapTokenPayload(rawPayload, input.responseEnvelope);
    if (!response.ok || !isEnvelopeSuccess(rawPayload, input.responseEnvelope)) {
      const providerMessage = readTokenErrorMessage(rawPayload, payload, input.responseEnvelope);
      const bodyDescription = bytes.byteLength === 0 ? "empty body" : "unrecognized response body";
      throw input.createError(
        providerMessage ??
          // Token endpoints and intermediaries can echo request credentials. Keep
          // arbitrary response bytes out of the public error while distinguishing
          // an empty body from a non-conforming one.
          `OAuth token request failed (HTTP ${response.status}, ${bodyDescription}).`,
      );
    }

    const accessToken = requiredString(payload.access_token ?? payload.token, "access_token", input.createError);
    const tokenType = optionalString(payload.token_type) ?? "Bearer";
    return {
      accessToken,
      tokenType,
      refreshToken: optionalString(payload.refresh_token),
      expiresAt: expiresAtFromLifetime(payload.expires_in),
      metadata: createTokenMetadata(payload),
    };
  } finally {
    timeout.cleanup();
  }
}

/** Read a bounded token response and map body-stream failures to a safe OAuth error. */
async function readTokenResponseBytes(response: Response, createError: OAuthTokenErrorFactory): Promise<Uint8Array> {
  try {
    return await readBoundedResponseBytes(response, {
      maxBytes: oauthTokenResponseMaxBytes,
      fieldName: "OAuth token response",
      createError: (message) => new OAuthTokenResponseSizeError(message),
    });
  } catch (error) {
    if (error instanceof OAuthTokenResponseSizeError) {
      throw createError(error.message);
    }
    throw createError(`OAuth token request failed (HTTP ${response.status}, response body could not be read).`);
  }
}

/** Decode a JSON object body, or `{}` for an empty, non-JSON, or non-object one. */
function decodeTokenPayload(bytes: Uint8Array): Record<string, unknown> {
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

/**
 * Describe a transport-level failure: the error name, its message, and the
 * platform `cause.code` (`ENOTFOUND`, `ECONNREFUSED`, `CERT_HAS_EXPIRED`, ...),
 * which is usually the part that identifies the failure.
 */
function describeCause(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const code = optionalString(optionalRecord(error.cause)?.code);
  const suffix = code ? ` (cause: ${code})` : "";
  // A plain `Error` name adds nothing; a subclass name (TypeError, TimeoutError,
  // AbortError) is often the only thing distinguishing the failure.
  const prefix = error.name === "Error" || error.name === "" ? "" : `${error.name}: `;
  return `${prefix}${error.message}${suffix}`;
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

/**
 * Build the absolute expiry for an OAuth `expires_in` lifetime, or undefined when
 * the provider did not report a usable one.
 */
export function expiresAtFromLifetime(value: unknown): string | undefined {
  const seconds = readExpiresInSeconds(value);
  return seconds === undefined ? undefined : new Date(Date.now() + seconds * 1000).toISOString();
}

/**
 * Parse OAuth `expires_in` lifetimes. Providers commonly return a JSON number,
 * but some return the same value as a string, which used to be dropped so the
 * credential never carried an `expiresAt` and was never proactively refreshed.
 *
 * Non-positive and absurd lifetimes are reported as missing instead. A provider
 * that answers `0` almost always means "no expiry known", not "this token is
 * already dead": honouring it literally would make every request refresh (or,
 * without a refresh token, fail) right after a successful connect. Values past
 * `maxExpiresInSeconds` would overflow `new Date(...).toISOString()` into a
 * `RangeError` that escapes the OAuth error wrapper.
 */
function readExpiresInSeconds(value: unknown): number | undefined {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 && parsed <= maxExpiresInSeconds ? parsed : undefined;
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
  const stateField = fieldMap?.authorizationCode?.state;
  if (input.state !== undefined && stateField !== undefined) {
    setMappedField(fields, stateField, "state", input.state);
  }
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
  return {
    ...fields,
    ...(input.extraFields ?? {}),
  };
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
