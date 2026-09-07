import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  smartrecruitersActionHandlers,
  smartrecruitersApiBaseUrl,
  validateSmartRecruitersCredential,
} from "./runtime.ts";

const service = "smartrecruiters";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, smartrecruitersActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: smartrecruitersApiBaseUrl,
  auth: { type: "api_key_header", name: "X-SmartToken" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSmartRecruitersCredential(input.apiKey, fetcher, signal);
  },
};
