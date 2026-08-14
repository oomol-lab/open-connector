import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ResolvedCredential,
} from "../../core/types.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";
import {
  buildShopifyRestApiBaseUrl,
  normalizeShopDomain,
  shopifyActionHandlers,
  validateShopifyCredential,
} from "./runtime.ts";
import { shopifyReadContentScope } from "./scopes.ts";

const service = "shopify";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: shopifyActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireShopifyCredential(context);
    return {
      accessToken: shopifyAccessToken(credential),
      shopDomain: shopifyCredentialDomain(credential),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    return buildShopifyRestApiBaseUrl(shopifyCredentialDomain(await requireShopifyCredential(context)));
  },
  auth: { type: "none" },
  async customizeRequest({ context, headers }) {
    headers.set("x-shopify-access-token", shopifyAccessToken(await requireShopifyCredential(context)));
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateShopifyCredential(
      input.apiKey,
      normalizeShopDomain(optionalString(input.values.shopDomain)),
      [shopifyReadContentScope],
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
  return normalizeShopDomain(optionalString(credential.metadata.shopDomain) ?? optionalString(clientExtra?.shopDomain));
}

function parseShopifyScopes(value: unknown): string[] {
  return (optionalString(value) ?? "")
    .split(/[ ,]+/u)
    .map((scope) => scope.trim())
    .filter(Boolean);
}
