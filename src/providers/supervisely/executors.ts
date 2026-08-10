import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { superviselyActionHandlers, validateSuperviselyCredential } from "./runtime.ts";

const service = "supervisely";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, superviselyActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSuperviselyCredential(input, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://app.supervisely.com/public/api/v3",
  auth: { type: "api_key_header", name: "x-api-key" },
});
