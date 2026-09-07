import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { nasdaqActionHandlers, nasdaqApiBaseUrl, validateNasdaqCredential } from "./runtime.ts";

const service = "nasdaq";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, nasdaqActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: nasdaqApiBaseUrl,
  auth: { type: "api_key_header", name: "X-Api-Token" },
  skipDnsValidation: true,
  async customizeRequest({ context, url, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    url.searchParams.set("api_key", credential.apiKey);
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateNasdaqCredential(input, fetcher, signal);
  },
};
