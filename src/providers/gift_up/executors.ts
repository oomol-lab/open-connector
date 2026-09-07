import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { giftUpActionHandlers, giftUpApiBaseUrl, validateGiftUpCredential } from "./runtime.ts";

const service = "gift_up";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, giftUpActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: giftUpApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateGiftUpCredential,
};
