import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { checkoutComActionHandlers, createCheckoutContext, resolveCheckoutBase, validateCheckout } from "./runtime.ts";
export const executors: ProviderExecutors = defineProviderExecutors({
  service: "checkout_com",
  handlers: checkoutComActionHandlers,
  createContext: createCheckoutContext,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "checkout_com",
  async baseUrl(context) {
    return resolveCheckoutBase((await requireApiKeyCredential(context, "checkout_com")).values);
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateCheckout(input, fetcher, signal);
  },
};
