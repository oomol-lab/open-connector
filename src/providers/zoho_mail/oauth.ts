import type { ProviderOAuthRuntime, OAuthTokenResult } from "../../oauth/oauth-token.ts";

import { optionalNumber, optionalRawString, optionalString, optionalRecord } from "../../core/cast.ts";
import { readOAuthScopes } from "../../oauth/oauth-scopes.ts";
import { ProviderRequestError, requiredResponseRecord, runProviderRequest } from "../provider-runtime.ts";
import { resolveZohoCallbackDataCenter, resolveZohoDataCenter, zohoAccountsOrigin } from "./data-centers.ts";

export const oauth: ProviderOAuthRuntime = {
  buildAuthorizationUrl({ authorizationUrl, clientConfig }) {
    const url = new URL(authorizationUrl);
    url.host = new URL(zohoAccountsOrigin(clientConfig.extra.dataCenter)).host;
    return url.toString();
  },
  exchangeCode(input) {
    const dc = resolveZohoCallbackDataCenter(input.callbackQuery, input.clientConfig.extra.dataCenter);
    return requestToken(
      dc,
      new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        client_id: input.clientConfig.clientId,
        client_secret: input.clientConfig.clientSecret,
        redirect_uri: input.redirectUri,
      }),
      [],
      input.fetcher,
      input.signal,
    );
  },
  refreshAccessToken(input) {
    const dc = resolveZohoDataCenter(
      input.providerSecret?.dataCenter ?? input.metadata.dataCenter ?? input.clientConfig.extra.dataCenter,
    );
    return requestToken(
      dc,
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: input.refreshToken,
        client_id: input.clientConfig.clientId,
        client_secret: input.clientConfig.clientSecret,
      }),
      readOAuthScopes(input.metadata.scope) ?? [],
      input.fetcher,
    ).catch((error: unknown) => {
      if (!(error instanceof ProviderRequestError)) throw error;
      const failure = optionalRecord(error.details);
      // Zoho reports revoked refresh tokens as invalid_code; the shared lifecycle owns reconnect state.
      throw input.createError(error.message, {
        status: optionalNumber(failure?.httpStatus) ?? error.status,
        errorCode: failure?.errorCode === "invalid_code" ? "invalid_grant" : optionalString(failure?.errorCode),
      });
    });
  },
};
async function requestToken(
  dataCenter: string,
  body: URLSearchParams,
  previousScopes: string[],
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
): Promise<OAuthTokenResult> {
  return runProviderRequest({ label: "Zoho OAuth", signal: parentSignal }, async (signal) => {
    const response = await fetcher(new URL("/oauth/v2/token", zohoAccountsOrigin(dataCenter)), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal,
    });
    const payload = requiredResponseRecord(await response.json(), "Zoho token response");
    const error = optionalString(payload.error);
    if (!response.ok || error)
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        optionalString(payload.error_description) ?? error ?? `Zoho token request failed with ${response.status}`,
        { httpStatus: response.status, errorCode: error },
      );
    const accessToken = optionalString(payload.access_token);
    if (!accessToken) throw new ProviderRequestError(502, "Zoho token response is missing access_token");
    const expiresIn = optionalNumber(payload.expires_in) ?? 3600;
    if (!Number.isFinite(expiresIn) || expiresIn <= 0)
      throw new ProviderRequestError(502, "Zoho token response has invalid expires_in");
    const scope = optionalRawString(payload.scope);
    const scopes =
      scope === undefined
        ? previousScopes
        : scope
            .replaceAll(" ", ",")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
    return {
      accessToken,
      refreshToken: optionalString(payload.refresh_token) ?? body.get("refresh_token") ?? undefined,
      tokenType: optionalString(payload.token_type) ?? "Zoho-oauthtoken",
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      providerSecret: { dataCenter },
      metadata: {
        dataCenter,
        scope: scopes.join(" "),
        expires_in: expiresIn,
        apiDomain: optionalString(payload.api_domain),
      },
    };
  });
}
