import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import { ProviderRequestError, withRetryAfterSeconds } from "../provider-runtime.ts";
import { neonActionHandlers, neonApiBaseUrl, validateNeonCredential } from "./runtime.ts";

const service = "neon";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, neonActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: neonApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, "Neon proxy request failed"),
      withRetryAfterSeconds(response),
      response.status === 401 || response.status === 403 ? "provider_error" : undefined,
    );
  },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateNeonCredential(input, fetcher, signal);
  },
};
