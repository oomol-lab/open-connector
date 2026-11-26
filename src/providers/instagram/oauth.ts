import type {
  OAuthAccessTokenRefreshInput,
  OAuthCodeExchangeInput,
  OAuthTokenResult,
  ProviderOAuthRuntime,
} from "../../oauth/oauth-token.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { exchangeMetaCode } from "../meta/oauth.ts";
import { metaRequest } from "../meta/request.ts";
import {
  createProviderTimeout,
  providerInputError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";

const instagramLongLivedTokenUrl = "https://graph.instagram.com/access_token";
const instagramRefreshTokenUrl = "https://graph.instagram.com/refresh_access_token";
const instagramTokenResponseMaxBytes = 64 * 1024;
const instagramMaximumExpiresInSeconds = 366 * 24 * 60 * 60;

class InstagramTokenResponseError extends Error {}

interface InstagramTokenPayload extends Record<string, unknown> {
  access_token?: unknown;
  data?: unknown;
  error?: unknown;
  error_description?: unknown;
  error_message?: unknown;
  expires_in?: unknown;
  permissions?: unknown;
  token_type?: unknown;
}

interface InstagramTokenRequest {
  url: URL;
  operation: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  init?: RequestInit;
  sensitiveValues: string[];
  createError(message: string): Error;
}

/** Missing mode identifies existing Instagram Login app configurations and credentials. */
export function instagramLoginMode(extra: Record<string, unknown> | undefined): "instagram" | "unified" {
  const mode = optionalString(extra?.loginMode) ?? "instagram";
  if (mode === "instagram" || mode === "unified") return mode;
  throw providerInputError("loginMode must be instagram or unified.");
}

export const oauth: ProviderOAuthRuntime = {
  buildAuthorizationUrl({ authorizationUrl, clientConfig }): string {
    if (instagramLoginMode(clientConfig.extra) === "instagram") return authorizationUrl.toString();
    const url = new URL("https://www.facebook.com/dialog/oauth");
    for (const key of ["client_id", "redirect_uri", "response_type", "state"]) {
      const value = authorizationUrl.searchParams.get(key);
      if (value != null) url.searchParams.set(key, value);
    }
    url.searchParams.set("config_id", requiredInputString(clientConfig.extra.configId, "configId"));
    url.searchParams.set("override_default_response_type", "true");
    url.searchParams.set("prompt", "login");
    return url.toString();
  },
  async exchangeCode(input: OAuthCodeExchangeInput): Promise<OAuthTokenResult> {
    if (instagramLoginMode(input.clientConfig.extra) === "unified") {
      const token = await exchangeMetaCode(input);
      const business = await metaRequest(
        "me",
        {
          accessToken: token.accessToken,
          appSecret: input.clientConfig.clientSecret,
          fetcher: input.fetcher,
          signal: input.signal,
        },
        { query: { fields: "client_business_id" }, phase: "validate" },
      );
      token.metadata.clientBusinessId = requiredString(
        business.client_business_id,
        "Meta client business ID",
        input.createError,
      );
      return token;
    }
    const body = new FormData();
    body.set("client_id", input.clientConfig.clientId);
    body.set("client_secret", input.clientConfig.clientSecret);
    body.set("grant_type", "authorization_code");
    body.set("redirect_uri", input.redirectUri);
    body.set("code", input.code);
    const shortPayload = unwrapShortLivedTokenPayload(
      await requestInstagramToken({
        url: new URL(input.tokenUrl),
        operation: "authorization code exchange",
        fetcher: input.fetcher,
        signal: input.signal,
        init: { method: "POST", body },
        sensitiveValues: [input.code, input.clientConfig.clientSecret],
        createError: input.createError,
      }),
      input.createError,
    );
    const shortAccessToken = requiredString(
      shortPayload.access_token,
      "Instagram short-lived access token",
      input.createError,
    );
    const longLivedUrl = new URL(instagramLongLivedTokenUrl);
    longLivedUrl.searchParams.set("grant_type", "ig_exchange_token");
    longLivedUrl.searchParams.set("client_secret", input.clientConfig.clientSecret);
    longLivedUrl.searchParams.set("access_token", shortAccessToken);
    const longPayload = await requestInstagramToken({
      url: longLivedUrl,
      operation: "long-lived token exchange",
      fetcher: input.fetcher,
      signal: input.signal,
      sensitiveValues: [shortAccessToken, input.clientConfig.clientSecret],
      createError: input.createError,
    });

    return createInstagramTokenResult(longPayload, input.createError, normalizePermissions(shortPayload.permissions));
  },

  async refreshAccessToken(input: OAuthAccessTokenRefreshInput): Promise<OAuthTokenResult> {
    const url = new URL(instagramRefreshTokenUrl);
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", input.refreshToken);
    const payload = await requestInstagramToken({
      url,
      operation: "long-lived token refresh",
      fetcher: input.fetcher,
      sensitiveValues: [input.refreshToken],
      createError: input.createError,
    });
    return createInstagramTokenResult(payload, input.createError);
  },
};

async function requestInstagramToken(input: InstagramTokenRequest): Promise<InstagramTokenPayload> {
  const timeout = createProviderTimeout(input.signal);
  let response: Response;
  try {
    response = await input.fetcher(input.url, {
      ...input.init,
      headers: {
        "accept": "application/json",
        "user-agent": providerUserAgent,
        ...input.init?.headers,
      },
      signal: timeout.signal,
      redirect: "manual",
    });
  } catch {
    timeout.cleanup();
    if (input.signal?.aborted) {
      throw input.createError(`Instagram ${input.operation} was cancelled.`);
    }
    if (timeout.didTimeout()) {
      throw input.createError(`Instagram ${input.operation} timed out.`);
    }
    throw input.createError(`Instagram ${input.operation} failed without an HTTP response.`);
  }

  try {
    let payload: InstagramTokenPayload;
    try {
      payload = await readInstagramTokenPayload(response);
    } catch (error) {
      if (input.signal?.aborted) {
        throw input.createError(`Instagram ${input.operation} was cancelled.`);
      }
      if (timeout.didTimeout()) {
        throw input.createError(`Instagram ${input.operation} timed out.`);
      }
      if (error instanceof InstagramTokenResponseError) {
        throw input.createError(error.message);
      }
      throw input.createError(`Instagram ${input.operation} response body could not be read.`);
    }
    if (!response.ok) {
      const providerMessage = readSafeTokenErrorMessage(payload, input.sensitiveValues);
      throw input.createError(providerMessage ?? `Instagram ${input.operation} failed (HTTP ${response.status}).`);
    }
    return payload;
  } finally {
    timeout.cleanup();
  }
}

async function readInstagramTokenPayload(response: Response): Promise<InstagramTokenPayload> {
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: instagramTokenResponseMaxBytes,
    fieldName: "Instagram token response",
    createError: (message) => new InstagramTokenResponseError(message),
  });
  if (bytes.byteLength === 0) {
    throw new InstagramTokenResponseError("Instagram returned an empty token response.");
  }
  try {
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    const record = optionalRecord(payload);
    if (!record) throw new Error("invalid token response");
    return record as InstagramTokenPayload;
  } catch {
    throw new InstagramTokenResponseError("Instagram returned malformed token JSON.");
  }
}

function unwrapShortLivedTokenPayload(
  payload: InstagramTokenPayload,
  createError: (message: string) => Error,
): InstagramTokenPayload {
  if (!Array.isArray(payload.data)) return payload;
  const item = optionalRecord(payload.data[0]);
  if (!item) {
    throw createError("Instagram short-lived token response is missing data[0].");
  }
  return item as InstagramTokenPayload;
}

function createInstagramTokenResult(
  payload: InstagramTokenPayload,
  createError: (message: string) => Error,
  permissions?: string,
): OAuthTokenResult {
  const accessToken = requiredString(payload.access_token, "Instagram access token", createError);
  const expiresIn = readExpiresIn(payload.expires_in);
  if (expiresIn === undefined) {
    throw createError("Instagram token response is missing a positive expires_in.");
  }
  const metadata: Record<string, unknown> = { expires_in: expiresIn };
  if (permissions) metadata.permissions = permissions;
  return {
    accessToken,
    refreshToken: accessToken,
    tokenType: optionalString(payload.token_type) ?? "Bearer",
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    metadata,
  };
}

function readSafeTokenErrorMessage(payload: InstagramTokenPayload, sensitiveValues: string[]): string | undefined {
  const error = optionalRecord(payload.error);
  const message =
    optionalString(error?.message) ??
    optionalString(payload.error_description) ??
    optionalString(payload.error_message);
  if (!message) return undefined;
  return sensitiveValues.some((value) => value && message.includes(value)) ? undefined : message;
}

function normalizePermissions(value: unknown): string | undefined {
  const permissions = typeof value === "string" ? value.split(/[\s,]+/) : Array.isArray(value) ? value : [];
  const normalized = permissions
    .map((permission) => (typeof permission === "string" ? permission.trim() : ""))
    .filter(Boolean);
  return normalized.length > 0 ? [...new Set(normalized)].join(",") : undefined;
}

function readExpiresIn(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 && number <= instagramMaximumExpiresInSeconds ? number : undefined;
}
