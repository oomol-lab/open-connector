import type { OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";
import type { OAuthTokenResult, ProviderOAuthRuntime } from "../../oauth/oauth-token.ts";

import { optionalString, optionalInteger } from "../../core/cast.ts";
import { ProviderRequestError, requiredInputString, runProviderRequest } from "../provider-runtime.ts";
import { etsyTokenUrl, etsyDefaultScopes } from "./constants.ts";
import { readEtsyResponse, etsyApiKey } from "./runtime.ts";
export const oauth: ProviderOAuthRuntime = {
  buildAuthorizationUrl({ authorizationUrl, clientConfig }) {
    etsyApiKey(clientConfig);
    if (!(clientConfig.requestedScopes ?? etsyDefaultScopes).includes("shops_r"))
      throw new ProviderRequestError(
        400,
        "Etsy requires shops_r to identify the connected shop",
        undefined,
        "invalid_input",
      );
    return authorizationUrl.toString();
  },
  async exchangeCode(input) {
    const token = await exchangeToken(
      {
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.redirectUri,
        code_verifier: requiredInputString(input.codeVerifier, "codeVerifier"),
      },
      input.clientConfig,
      input.clientConfig.requestedScopes ?? etsyDefaultScopes,
      input.fetcher,
    );
    if (!token.refreshToken) throw input.createError("Etsy token response is missing refresh_token");
    return {
      ...token,
      providerSecret: {
        clientId: input.clientConfig.clientId,
        sharedSecret: input.clientConfig.secretExtra.sharedSecret,
      },
    };
  },
  async refreshAccessToken(input) {
    const token = await exchangeToken(
      { grant_type: "refresh_token", refresh_token: input.refreshToken },
      input.clientConfig,
      input.clientConfig.requestedScopes ?? etsyDefaultScopes,
      input.fetcher,
    );
    return {
      ...token,
      refreshToken: token.refreshToken || input.refreshToken,
      providerSecret: {
        clientId: input.clientConfig.clientId,
        sharedSecret: input.clientConfig.secretExtra.sharedSecret,
      },
    };
  },
};
async function exchangeToken(
  fields: Record<string, string>,
  clientConfig: OAuthClientConfig,
  fallbackScopes: string[],
  fetcher: typeof fetch,
): Promise<OAuthTokenResult> {
  return runProviderRequest({ label: "Etsy OAuth" }, async (signal) => {
    const response = await fetcher(etsyTokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ ...fields, client_id: clientConfig.clientId }),
      signal,
      redirect: "manual",
    });
    const payload = await readEtsyResponse(response);
    const accessToken = optionalString(payload.access_token);
    const expiresIn = optionalInteger(payload.expires_in);
    if (!accessToken || expiresIn == null || expiresIn <= 0)
      throw new ProviderRequestError(
        502,
        "Etsy token response is missing access_token or a positive expires_in",
        undefined,
        "provider_error",
      );
    return {
      accessToken,
      refreshToken: optionalString(payload.refresh_token) ?? "",
      tokenType: optionalString(payload.token_type) ?? "Bearer",
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      metadata: { scope: optionalString(payload.scope) ?? fallbackScopes.join(" ") },
    };
  });
}
