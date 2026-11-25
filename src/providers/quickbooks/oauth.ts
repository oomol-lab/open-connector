import type {
  OAuthAccessTokenRefreshInput,
  OAuthCodeExchangeInput,
  OAuthTokenResult,
  ProviderOAuthRuntime,
} from "../../oauth/oauth-token.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { expiresAtFromLifetime, requestTokenRevocation, selectOAuthRevocationToken } from "../../oauth/oauth-token.ts";
import {
  basicAuthorizationHeader,
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
} from "../provider-runtime.ts";
import { quickbooksTokenUrl } from "./constants.ts";
import { resolveQuickbooksEnvironment } from "./runtime.ts";

const tokenResponseMaxBytes = 1024 * 1024;

interface QuickbooksTokenRequest {
  fields: Record<string, string>;
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  createError(message: string): Error;
}

/**
 * QuickBooks has two non-standard token behaviors, both kept out of the shared
 * OAuth code. The company (`realmId`) arrives as a callback query parameter, not
 * in the token response, and every API call needs it, so it is stored next to
 * the tokens in `providerSecret`, which refresh carries forward untouched. Intuit
 * also identifies the client through the Basic Authorization header alone
 * (RFC 6749 §2.3.1), so the token requests here never repeat `client_id` in the
 * form body.
 */
export const oauth: ProviderOAuthRuntime = {
  async revokeAccessToken(input): Promise<void> {
    const token = selectOAuthRevocationToken(input);
    if (!token) return;

    await requestTokenRevocation({
      revocationUrl: "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
      request: {
        body: JSON.stringify({ token: token.token }),
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
          "authorization": basicAuthorizationHeader(
            `${input.clientConfig.clientId}:${input.clientConfig.clientSecret}`,
          ),
        },
      },
      fetcher: input.fetcher,
      createError: input.createError,
    });
  },
  async exchangeCode(input: OAuthCodeExchangeInput): Promise<OAuthTokenResult> {
    const realmId = optionalString(input.callbackParameters?.realmId);
    if (!realmId) {
      throw input.createError(
        "QuickBooks did not return a realmId on the callback, so no company is selected. Authorize again and choose a company.",
      );
    }
    const environment = resolveQuickbooksEnvironment(input.clientConfig.extra.environment, input.createError);
    const token = await requestQuickbooksToken({
      fields: { grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri },
      clientId: input.clientConfig.clientId,
      clientSecret: input.clientConfig.clientSecret,
      tokenUrl: input.tokenUrl,
      fetcher: input.fetcher,
      signal: input.signal,
      createError: input.createError,
    });
    return { ...token, providerSecret: { realmId, environment } };
  },

  async refreshAccessToken(input: OAuthAccessTokenRefreshInput): Promise<OAuthTokenResult> {
    return requestQuickbooksToken({
      fields: { grant_type: "refresh_token", refresh_token: input.refreshToken },
      clientId: input.clientConfig.clientId,
      clientSecret: input.clientConfig.clientSecret,
      tokenUrl: quickbooksTokenUrl,
      fetcher: input.fetcher,
      createError: input.createError,
    });
  },
};

async function requestQuickbooksToken(input: QuickbooksTokenRequest): Promise<OAuthTokenResult> {
  const timeout = createProviderTimeout(input.signal);
  try {
    let response: Response;
    try {
      response = await input.fetcher(input.tokenUrl, {
        method: "POST",
        headers: {
          "accept": "application/json",
          "authorization": basicAuthorizationHeader(`${input.clientId}:${input.clientSecret}`),
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": providerUserAgent,
        },
        body: new URLSearchParams(input.fields),
        signal: timeout.signal,
        redirect: "manual",
      });
    } catch (error) {
      if (input.signal?.aborted) {
        throw input.createError("QuickBooks token request was cancelled.");
      }
      if (timeout.didTimeout() || isAbortLikeError(error)) {
        throw input.createError("QuickBooks token request timed out.");
      }
      throw input.createError("QuickBooks token request failed without an HTTP response.");
    }

    let payload: Record<string, unknown>;
    try {
      const bytes = await readBoundedResponseBytes(response, {
        maxBytes: tokenResponseMaxBytes,
        fieldName: "QuickBooks token response",
        signal: timeout.signal,
        createError: input.createError,
      });
      payload = optionalRecord(bytes.byteLength === 0 ? {} : JSON.parse(new TextDecoder().decode(bytes))) ?? {};
    } catch {
      payload = {};
    }
    if (!response.ok) {
      // Only the status and Intuit's `error` code are reported, never the body.
      const code = optionalString(payload.error);
      throw input.createError(`QuickBooks token request failed (HTTP ${response.status}${code ? `, ${code}` : ""}).`);
    }

    const { access_token: _accessToken, refresh_token: _refreshToken, ...metadata } = payload;
    return {
      accessToken: requiredString(payload.access_token, "access_token", input.createError),
      refreshToken: optionalString(payload.refresh_token),
      tokenType: optionalString(payload.token_type) ?? "Bearer",
      expiresAt: expiresAtFromLifetime(payload.expires_in),
      metadata,
    };
  } finally {
    timeout.cleanup();
  }
}
