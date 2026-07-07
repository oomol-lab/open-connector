import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { timelinkActionHandlers, timelinkApiBaseUrl, validateTimelinkCredential } from "./runtime.ts";

const service = "timelink";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, timelinkActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: timelinkApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }): ReturnType<typeof validateTimelinkCredential> {
    return validateTimelinkCredential({ ...input.values, apiKey: input.apiKey }, fetcher);
  },
};
