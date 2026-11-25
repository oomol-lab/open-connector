import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { requestJinshuju, baseUrl, headers, jinshujuHandlers } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("jinshuju", jinshujuHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, context) {
    const user = await requestJinshuju({ endpoint: "/me" }, { ...context, apiKey: input.apiKey });
    return {
      profile: { displayName: optionalString(user.name) ?? optionalString(user.email) ?? "Jinshuju" },
      metadata: {},
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "jinshuju",
  baseUrl,
  defaultHeaders: headers,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});
