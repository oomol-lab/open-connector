import type {
  OAuthAccessTokenRefreshInput,
  OAuthCodeExchangeInput,
  OAuthTokenResult,
  ProviderOAuthRuntime,
} from "../../oauth/oauth-token.ts";

import { optionalInteger } from "../../core/cast.ts";
import {
  createInitialShopeeTokenInventory,
  parseShopeePartnerId,
  refreshShopeeTokenInventory,
  requestShopeeToken,
} from "./runtime.ts";

export const oauth: ProviderOAuthRuntime = {
  async exchangeCode(input: OAuthCodeExchangeInput): Promise<OAuthTokenResult> {
    const shopId = positiveInteger(input.callbackParameters?.shop_id);
    const mainAccountId = positiveInteger(input.callbackParameters?.main_account_id);
    if ((shopId == null) === (mainAccountId == null)) {
      throw input.createError("Shopee callback must include exactly one of shop_id or main_account_id.");
    }
    const token = await requestShopeeToken({
      clientConfig: input.clientConfig,
      path: "/api/v2/auth/token/get",
      body: {
        partner_id: parseShopeePartnerId(input.clientConfig),
        code: input.code,
        shop_id: shopId,
        main_account_id: mainAccountId,
      },
      fetcher: input.fetcher,
    });
    const shopIds = token.shopIds.length > 0 ? token.shopIds : shopId == null ? [] : [shopId];
    if (shopIds.length === 0 && token.merchantIds.length === 0) {
      throw input.createError("Shopee token response did not include any authorized shop or merchant IDs.");
    }
    const inventory = createInitialShopeeTokenInventory({ ...token, shopIds });
    return {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenType: "Shopee",
      expiresAt: token.expiresAt,
      providerSecret: {
        tokenInventory: inventory,
        signingConfig: createSigningConfig(input.clientConfig),
      },
      metadata: {
        mainAccountId,
        shopIds,
        merchantIds: token.merchantIds,
        expires_in: expiresIn(token.expiresAt),
      },
    };
  },

  async refreshAccessToken(input: OAuthAccessTokenRefreshInput): Promise<OAuthTokenResult> {
    const refreshed = await refreshShopeeTokenInventory({
      clientConfig: input.clientConfig,
      providerSecret: input.providerSecret,
      fallbackRefreshToken: input.refreshToken,
      fetcher: input.fetcher,
    });
    return {
      accessToken: refreshed.representative.accessToken,
      refreshToken: refreshed.representative.refreshToken,
      tokenType: "Shopee",
      expiresAt: earliestExpiry(refreshed.inventory),
      providerSecret: {
        tokenInventory: refreshed.inventory,
        signingConfig: createSigningConfig(input.clientConfig),
      },
      metadata: {},
    };
  },
};

function createSigningConfig(clientConfig: OAuthCodeExchangeInput["clientConfig"]) {
  return {
    clientId: clientConfig.clientId,
    clientSecret: clientConfig.clientSecret,
    apiBaseUrl: clientConfig.extra.apiBaseUrl,
  };
}

function positiveInteger(value: unknown): number | undefined {
  const result = optionalInteger(value) ?? (typeof value === "string" ? Number(value) : undefined);
  return result != null && result > 0 ? result : undefined;
}

function expiresIn(expiresAt: string): number {
  return Math.max(1, Math.floor((Date.parse(expiresAt) - Date.now()) / 1_000));
}

function earliestExpiry(inventory: {
  shops: Record<string, { expiresAt: string }>;
  merchants: Record<string, { expiresAt: string }>;
}): string {
  const expiries = [...Object.values(inventory.shops), ...Object.values(inventory.merchants)]
    .map((token) => token.expiresAt)
    .filter(Boolean)
    .sort();
  const earliest = expiries[0];
  if (!earliest) {
    throw new Error("Shopee token refresh returned no expiry.");
  }
  return earliest;
}
