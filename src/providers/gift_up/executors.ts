import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { giftUpActionHandlers, giftUpApiBaseUrl, validateGiftUpCredential } from "./runtime.ts";

const service = "gift_up";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, giftUpActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: giftUpApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  defaultHeaders: { "accept": "application/json", "content-type": "application/json" },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateGiftUpCredential,
};
