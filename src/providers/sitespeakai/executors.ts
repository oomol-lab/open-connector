import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  sitespeakaiActionHandlers,
  sitespeakaiApiBaseUrl,
  sitespeakaiApiVersion,
  validateSitespeakaiCredential,
} from "./runtime.ts";

const service = "sitespeakai";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, sitespeakaiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: `${sitespeakaiApiBaseUrl}/${sitespeakaiApiVersion}`,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSitespeakaiCredential(input.apiKey, fetcher, signal);
  },
};
