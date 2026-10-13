import type { ProviderOAuthRuntime, OAuthTokenResult } from "../../oauth/oauth-token.ts";

import { timingSafeEqual } from "node:crypto";
import { hmacHex } from "../../core/aws-sigv4.ts";
import { optionalString, optionalNumber } from "../../core/cast.ts";
import { requiredResponseRecord, ProviderRequestError } from "../provider-runtime.ts";
import { requestShopifyJson } from "./client.ts";
import { normalizeShopDomain } from "./shop-domain.ts";

export const shopifyOAuth: ProviderOAuthRuntime = {
  async exchangeCode(input) {
    const shopDomain = normalizeShopDomain(new URL(input.tokenUrl).hostname);
    const query = new URLSearchParams(input.callbackQuery ?? input.callbackParameters);
    const keys = [...query.keys()];
    if (
      !input.state ||
      new Set(keys).size !== keys.length ||
      query.get("shop") !== shopDomain ||
      query.get("code") !== input.code ||
      query.get("state") !== input.state
    ) {
      throw input.createError("Shopify OAuth callback does not match the authorization request");
    }
    const supplied = query.get("hmac") ?? "";
    query.delete("hmac");
    query.sort();
    const message = [...query].map(([key, value]) => `${key}=${value}`).join("&");
    const expected = hmacHex(input.clientConfig.clientSecret, message);
    if (
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      throw input.createError("Invalid Shopify OAuth callback HMAC");
    }
    const { payload } = await requestShopifyJson(
      shopDomain,
      "",
      input.tokenUrl,
      {
        method: "POST",
        signal: input.signal,
        body: JSON.stringify({
          client_id: input.clientConfig.clientId,
          client_secret: input.clientConfig.clientSecret,
          code: input.code,
          expiring: true,
        }),
      },
      input.fetcher,
    );
    return normalizeToken(payload, shopDomain, input.clientConfig.clientId, input.fetcher);
  },
  async refreshAccessToken(input) {
    const shopDomain = normalizeShopDomain(optionalString(input.providerSecret?.shopDomain));
    if (input.providerSecret?.clientId !== input.clientConfig.clientId)
      throw input.createError("Shopify OAuth client changed; reconnect this store with the new app");
    const { payload } = await requestShopifyJson(
      shopDomain,
      "",
      `https://${shopDomain}/admin/oauth/access_token`,
      {
        method: "POST",
        body: JSON.stringify({
          client_id: input.clientConfig.clientId,
          client_secret: input.clientConfig.clientSecret,
          grant_type: "refresh_token",
          refresh_token: input.refreshToken,
        }),
      },
      input.fetcher,
    );
    return normalizeToken(
      payload,
      shopDomain,
      input.clientConfig.clientId,
      input.fetcher,
      optionalString(input.metadata.scope),
    );
  },
};

async function normalizeToken(
  payload: unknown,
  shopDomain: string,
  clientId: string,
  fetcher: typeof fetch,
  previousScope?: string,
): Promise<OAuthTokenResult> {
  const token = requiredResponseRecord(payload, "Shopify token response");
  const accessToken = optionalString(token.access_token);
  const refreshToken = optionalString(token.refresh_token);
  const seconds = optionalNumber(token.expires_in);
  if (
    !accessToken ||
    !refreshToken ||
    !seconds ||
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    seconds > 100 * 365 * 24 * 60 * 60
  )
    throw new ProviderRequestError(
      502,
      "Shopify expiring offline token is missing valid access_token, refresh_token or expires_in",
    );
  let scope = optionalString(token.scope) ?? previousScope;
  if (scope === undefined) {
    const { payload: granted } = await requestShopifyJson(
      shopDomain,
      accessToken,
      `https://${shopDomain}/admin/oauth/access_scopes.json`,
      { method: "GET" },
      fetcher,
    );
    const scopes = requiredResponseRecord(granted, "Shopify scopes").access_scopes;
    if (!Array.isArray(scopes)) throw new ProviderRequestError(502, "Shopify response is missing access_scopes");
    scope = scopes
      .map((item) => {
        const handle = optionalString(requiredResponseRecord(item, "scope").handle);
        if (!handle) throw new ProviderRequestError(502, "Shopify scope is missing handle");
        return handle;
      })
      .join(",");
  }
  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
    providerSecret: { shopDomain, clientId },
    metadata: { shopDomain, scope, expires_in: seconds },
  };
}
