import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateWebOfScienceCredential, webOfScienceActionHandlers } from "./runtime.ts";

const service = "web_of_science";
const webOfScienceApiBaseUrl = "https://api.clarivate.com/apis/wos-starter/v1";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, webOfScienceActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: webOfScienceApiBaseUrl,
  auth: { type: "api_key_header", name: "X-ApiKey" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWebOfScienceCredential(input.apiKey, fetcher, signal);
  },
};
