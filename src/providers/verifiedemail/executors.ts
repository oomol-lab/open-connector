import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { validateVerifiedemailCredential, verifiedemailActionHandlers, verifiedemailApiBaseUrl } from "./runtime.ts";

const service = "verifiedemail";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, verifiedemailActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: verifiedemailApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateVerifiedemailCredential,
};
