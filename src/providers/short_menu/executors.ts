import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { shortMenuActionHandlers, validateShortMenuCredential } from "./runtime.ts";

const service = "short_menu";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, shortMenuActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }): ReturnType<typeof validateShortMenuCredential> {
    return validateShortMenuCredential({ ...input.values, apiKey: input.apiKey }, fetcher);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.shortmenu.com",
  auth: { type: "api_key_header", name: "x-api-key" },
});
