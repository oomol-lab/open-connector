import type { OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";
import type { OAuthTokenResult, ProviderOAuthRuntime } from "../../oauth/oauth-token.ts";

import { optionalString, optionalRawString, optionalInteger } from "../../core/cast.ts";
import {
  ProviderRequestError,
  basicAuthorizationHeader,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";
import { ebayApiBaseUrl, ebayScopes, ebayIdentityScope } from "./constants.ts";
import { readEbayResponse } from "./runtime.ts";
export const oauth: ProviderOAuthRuntime = {
  buildAuthorizationUrl({ authorizationUrl, clientConfig }) {
    if (!(clientConfig.requestedScopes ?? ebayScopes).includes(ebayIdentityScope)) {
      throw new ProviderRequestError(
        400,
        "eBay requires commerce.identity.readonly to identify the connected account",
        undefined,
        "invalid_input",
      );
    }
    authorizationUrl.searchParams.set("redirect_uri", requiredInputString(clientConfig.extra.ruName, "ruName"));
    return authorizationUrl.toString();
  },
  async exchangeCode(input) {
    const token = await exchangeToken(
      {
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: requiredInputString(input.clientConfig.extra.ruName, "ruName"),
      },
      input.clientConfig,
      input.fetcher,
    );
    if (!token.refreshToken) throw input.createError("eBay token response is missing refresh_token");
    return token;
  },
  async refreshAccessToken(input) {
    const token = await exchangeToken(
      {
        grant_type: "refresh_token",
        refresh_token: input.refreshToken,
        scope: (input.clientConfig.requestedScopes ?? ebayScopes).join(" "),
      },
      input.clientConfig,
      input.fetcher,
      input.createError,
    );
    return { ...token, refreshToken: token.refreshToken || input.refreshToken };
  },
};
async function exchangeToken(
  fields: Record<string, string>,
  clientConfig: OAuthClientConfig,
  fetcher: typeof fetch,
  invalidGrantError?: (message: string) => Error,
): Promise<OAuthTokenResult> {
  return runProviderRequest({ label: "eBay OAuth" }, async (signal) => {
    const response = await fetcher(`${ebayApiBaseUrl}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        authorization: basicAuthorizationHeader(`${clientConfig.clientId}:${clientConfig.clientSecret}`),
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams(fields),
      signal,
      redirect: "manual",
    });
    const payload = await readEbayResponse(response, invalidGrantError);
    const accessToken = optionalString(payload.access_token);
    const expiresIn = optionalInteger(payload.expires_in);
    if (!accessToken || expiresIn == null || expiresIn <= 0)
      throw new ProviderRequestError(
        502,
        "eBay token response is missing access_token or a positive expires_in",
        undefined,
        "provider_error",
      );
    return {
      accessToken,
      refreshToken: optionalString(payload.refresh_token) ?? "",
      tokenType: optionalString(payload.token_type) ?? "Bearer",
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      metadata: { scope: optionalRawString(payload.scope) },
    };
  });
}
