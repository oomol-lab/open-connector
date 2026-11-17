import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { seventeenTrackActionHandlers, seventeenTrackApiBaseUrl, validateSeventeenTrackCredential } from "./runtime.ts";

const service = "17track";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, seventeenTrackActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: seventeenTrackApiBaseUrl,
  auth: { type: "api_key_header", name: "17token" },
  skipDnsValidation: true,
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, "17track proxy request failed"),
      undefined,
      "provider_error",
    );
  },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSeventeenTrackCredential(input.apiKey, fetcher, signal);
  },
};
