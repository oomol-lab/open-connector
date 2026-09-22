import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { looseArray, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, providerResponseError, requireOAuthCredential } from "../provider-runtime.ts";
import { shopeeActions } from "./actions.ts";
import { executeShopeeAction, fetchShopeeEntityInfo } from "./runtime.ts";

const service = "shopee";
interface ShopeeContext {
  clientConfig: OAuthClientConfig;
  providerSecret?: Record<string, unknown>;
  fetcher: typeof fetch;
}
type Handler = (input: Record<string, unknown>, context: ShopeeContext) => Promise<unknown>;

const handlers = Object.fromEntries(
  shopeeActions.map((action) => [
    action.name,
    (input: Record<string, unknown>, context: ShopeeContext) => executeShopeeAction(action.name, input, context),
  ]),
) as ProviderActionHandlers<"shopee", Handler>;

export const executors: ProviderExecutors = defineProviderExecutors<ShopeeContext>({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher): Promise<ShopeeContext> {
    const credential = await requireOAuthCredential(context, service);
    return {
      clientConfig: readClientConfig(credential.providerSecret),
      providerSecret: credential.providerSecret,
      fetcher,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const clientConfig = readClientConfig(input.providerSecret);
    const merchantId = firstPositiveInteger(input.metadata.merchantIds);
    const shopId = firstPositiveInteger(input.metadata.shopIds);
    if (merchantId != null) {
      const merchant = await fetchShopeeEntityInfo({
        entityType: "merchant",
        entityId: merchantId,
        accessToken: input.accessToken,
        clientConfig,
        fetcher,
      });
      return {
        profile: {
          accountId: `merchant:${merchantId}`,
          displayName: optionalString(merchant.merchant_name) ?? `Shopee merchant ${merchantId}`,
          grantedScopes: ["all"],
        },
      };
    }
    if (shopId != null) {
      const shop = await fetchShopeeEntityInfo({
        entityType: "shop",
        entityId: shopId,
        accessToken: input.accessToken,
        clientConfig,
        fetcher,
      });
      return {
        profile: {
          accountId: `shop:${shopId}`,
          displayName: optionalString(shop.shop_name) ?? `Shopee shop ${shopId}`,
          grantedScopes: ["all"],
        },
      };
    }
    throw providerResponseError("Shopee connection has no authorized merchant or shop.");
  },
};

function readClientConfig(providerSecret: Record<string, unknown> | undefined): OAuthClientConfig {
  const value = optionalRecord(providerSecret?.signingConfig);
  const clientId = optionalString(value?.clientId);
  const clientSecret = optionalString(value?.clientSecret);
  const apiBaseUrl = optionalString(value?.apiBaseUrl);
  if (!clientId || !clientSecret || !apiBaseUrl) {
    throw providerResponseError("Shopee connection is missing its signing configuration.");
  }
  return {
    service,
    clientId,
    clientSecret,
    extra: { apiBaseUrl },
    secretExtra: {},
  };
}

function firstPositiveInteger(value: unknown): number | undefined {
  for (const item of looseArray(value)) {
    const integer = optionalInteger(item);
    if (integer != null && integer > 0) return integer;
  }
  return undefined;
}
