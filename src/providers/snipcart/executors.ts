import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { executeSnipcartAction, validateSnipcartCredential } from "./runtime.ts";

const service = "snipcart";

const handlers: ProviderActionHandlers<
  "snipcart",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  list_orders: (input, context) => executeSnipcartAction("list_orders", input, context.apiKey, context.fetcher),
  get_order: (input, context) => executeSnipcartAction("get_order", input, context.apiKey, context.fetcher),
  list_customers: (input, context) => executeSnipcartAction("list_customers", input, context.apiKey, context.fetcher),
  get_customer: (input, context) => executeSnipcartAction("get_customer", input, context.apiKey, context.fetcher),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateSnipcartCredential(input.apiKey, fetcher);
    return {
      profile: { displayName: result.accountLabel },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://app.snipcart.com/api",
  auth: { type: "api_key_basic", suffix: "" },
  skipDnsValidation: true,
});
