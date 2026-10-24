import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { jigsawstackActionHandlers, validateJigsawstackCredential } from "./runtime.ts";

const service = "jigsawstack";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, jigsawstackActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey: validateJigsawstackCredential,
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.jigsawstack.com",
  auth: { type: "api_key_header", name: "x-api-key" },
});
