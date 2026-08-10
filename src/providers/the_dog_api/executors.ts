import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { theDogApiActionHandlers, validateTheDogApiCredential } from "./runtime.ts";

const service = "the_dog_api";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, theDogApiActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey: validateTheDogApiCredential,
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.thedogapi.com/v1/",
  auth: { type: "api_key_header", name: "x-api-key" },
});
