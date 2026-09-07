import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";
import { zipArchiveApiActionHandlers, zipArchiveApiBaseUrl } from "./runtime.ts";

const service = "zip_archive_api";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, zipArchiveApiActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: zipArchiveApiBaseUrl,
  auth: { type: "api_key_query", name: "secret" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    if (!input.apiKey.trim()) throw new ProviderRequestError(400, "ArchiveAPI secret key is required");
    return {
      profile: { displayName: "ArchiveAPI Secret Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: zipArchiveApiBaseUrl, credentialValidation: "non_empty_only" },
    };
  },
};
