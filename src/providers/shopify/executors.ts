import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  buildShopifyRestApiBaseUrl,
  normalizeShopDomain,
  shopifyActionHandlers,
  validateShopifyCredential,
} from "./runtime.ts";

const service = "shopify";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: shopifyActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      shopDomain: normalizeShopDomain(optionalString(credential.values.shopDomain)),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return buildShopifyRestApiBaseUrl(normalizeShopDomain(optionalString(credential.values.shopDomain)));
  },
  auth: { type: "api_key_header", name: "x-shopify-access-token" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateShopifyCredential(input, fetcher, signal);
  },
};
