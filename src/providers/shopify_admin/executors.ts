import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import {
  buildShopifyAdminApiBaseUrl,
  normalizeShopDomain,
  shopifyAdminActionHandlers,
  validateShopifyAdminCredential,
} from "./runtime.ts";

const service = "shopify_admin";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: shopifyAdminActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    const shopDomain = normalizeShopDomain(optionalString(credential.values.shopDomain));
    return {
      apiKey: credential.apiKey,
      shopDomain,
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "shopify_admin request failed",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return buildShopifyAdminApiBaseUrl(normalizeShopDomain(optionalString(credential.values.shopDomain)));
  },
  auth: { type: "api_key_header", name: "x-shopify-access-token" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const shopDomain = optionalString(input.values.shopDomain);
    if (!shopDomain) {
      throw new ProviderRequestError(400, "shopDomain is required");
    }
    return validateShopifyAdminCredential(input.apiKey, shopDomain, fetcher, signal);
  },
};
