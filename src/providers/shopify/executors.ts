import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ResolvedCredential,
} from "../../core/types.ts";
import type { ProviderOAuthRuntime } from "../../oauth/oauth-token.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { PollDefinition } from "../../triggers/common/poll.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requiredResponseRecord,
} from "../provider-runtime.ts";
import { bulkHandlers } from "./bulk.ts";
import { catalogHandlers } from "./catalog.ts";
import { buildShopifyApiBaseUrl, requestShopifyGraphQL } from "./client.ts";
import { contentActionHandlers } from "./content-runtime.ts";
import { customersHandlers } from "./customers.ts";
import { graphqlHandlers } from "./graphql.ts";
import { inventoryHandlers } from "./inventory.ts";
import { shopifyOAuth } from "./oauth.ts";
import { operationHandlers } from "./operations.ts";
import { ordersHandlers } from "./orders.ts";
import { normalizeShopDomain } from "./shop-domain.ts";
import { shopHandlers } from "./shop.ts";
import { shopifyShopEvent } from "./trigger-on-shop-event.ts";

const service = "shopify";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: {
    ...operationHandlers,
    ...shopHandlers,
    ...catalogHandlers,
    ...ordersHandlers,
    ...customersHandlers,
    ...inventoryHandlers,
    ...bulkHandlers,
    ...graphqlHandlers,
    ...contentActionHandlers,
  },
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireShopifyCredential(context);
    return {
      accessToken: shopifyAccessToken(credential),
      shopDomain: shopifyCredentialDomain(credential),
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    return buildShopifyApiBaseUrl(shopifyCredentialDomain(await requireShopifyCredential(context)));
  },
  auth: { type: "none" },
  async customizeRequest({ context, headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("x-shopify-access-token", shopifyAccessToken(await requireShopifyCredential(context)));
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateShopifyCredential(
      input.apiKey,
      normalizeShopDomain(optionalString(input.values.shopDomain)),
      [],
      fetcher,
      signal,
    );
  },
  oauth2(input, { fetcher, signal }) {
    return validateShopifyCredential(
      input.accessToken,
      shopifyCredentialDomain(input),
      parseShopifyScopes(input.metadata.scope),
      fetcher,
      signal,
    );
  },
};

type ShopifyCredential = Exclude<ResolvedCredential, { authType: "no_auth" | "custom_credential" }>;

async function requireShopifyCredential(context: ExecutionContext): Promise<ShopifyCredential> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "api_key" || credential?.authType === "oauth2") {
    return credential;
  }
  throw new ProviderRequestError(401, "Configure Shopify credentials first.");
}

function shopifyAccessToken(credential: ShopifyCredential): string {
  return credential.authType === "api_key" ? credential.apiKey : credential.accessToken;
}

function shopifyCredentialDomain(credential: ShopifyCredential): string {
  if (credential.authType === "api_key") {
    return normalizeShopDomain(optionalString(credential.values.shopDomain));
  }
  const clientExtra = optionalRecord(credential.metadata.oauthClientExtra);
  const storedDomain = optionalString(credential.metadata.shopDomain);
  if (storedDomain) {
    return normalizeShopDomain(storedDomain);
  }
  const shopSubdomain = optionalString(clientExtra?.shopSubdomain);
  return normalizeShopDomain(shopSubdomain ? `${shopSubdomain}.myshopify.com` : undefined);
}

function parseShopifyScopes(value: unknown): string[] {
  return (optionalString(value) ?? "")
    .split(/[ ,]+/u)
    .map((scope) => scope.trim())
    .filter(Boolean)
    .flatMap((scope) => (scope.startsWith("write_") ? [scope, `read_${scope.slice(6)}`] : [scope]));
}

export const oauth: ProviderOAuthRuntime = shopifyOAuth;

export const triggers: readonly (IntegrationDefinition | PollDefinition)[] = [shopifyShopEvent];

async function validateShopifyCredential(
  accessToken: string,
  shopDomain: string,
  grantedScopes: string[],
  fetcher: typeof fetch,
  signal?: AbortSignal,
) {
  const payload = await requestShopifyGraphQL({ accessToken, shopDomain, signal }, fetcher, {
    query: "query ShopifyAccount { shop { id name myshopifyDomain } }",
  });
  const shop = requiredResponseRecord(requiredResponseRecord(payload.data, "data").shop, "shop");
  return {
    profile: { accountId: `shopify:${shopDomain}`, displayName: optionalString(shop.name) ?? shopDomain },
    grantedScopes,
    metadata: {
      shopDomain,
      apiBaseUrl: buildShopifyApiBaseUrl(shopDomain),
      shopId: shop.id,
      myshopifyDomain: shop.myshopifyDomain,
    },
  };
}
