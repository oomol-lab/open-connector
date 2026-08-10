import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { shortpixelActionHandlers, validateShortpixelCredential } from "./runtime.ts";

const service = "shortpixel";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, shortpixelActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }): ReturnType<typeof validateShortpixelCredential> {
    return validateShortpixelCredential({ ...input.values, apiKey: input.apiKey }, fetcher);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.shortpixel.com/v2",
  auth: { type: "api_key_query", name: "key" },
});
