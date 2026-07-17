import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateWebOfScienceExpandedCredential, webOfScienceExpandedActionHandlers } from "./runtime.ts";

const service = "web_of_science_expanded";
const webOfScienceExpandedApiBaseUrl = "https://wos-api.clarivate.com/api/wos";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, webOfScienceExpandedActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: webOfScienceExpandedApiBaseUrl,
  auth: { type: "api_key_header", name: "X-ApiKey" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWebOfScienceExpandedCredential(input.apiKey, fetcher, signal);
  },
};
