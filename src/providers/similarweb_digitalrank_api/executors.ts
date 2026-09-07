import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  similarwebApiBaseUrl,
  similarwebDigitalRankApiActionHandlers,
  validateSimilarwebDigitalRankApiCredential,
} from "./runtime.ts";

const service = "similarweb_digitalrank_api";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  service,
  similarwebDigitalRankApiActionHandlers,
);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: similarwebApiBaseUrl,
  auth: { type: "api_key_query", name: "api_key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSimilarwebDigitalRankApiCredential(input.apiKey, fetcher, signal);
  },
};
