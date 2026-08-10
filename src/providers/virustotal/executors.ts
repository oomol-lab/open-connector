import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateVirustotalCredential, virustotalActionHandlers } from "./runtime.ts";

const service = "virustotal";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, virustotalActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateVirustotalCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://www.virustotal.com/api/v3",
  auth: { type: "api_key_header", name: "x-apikey" },
});
