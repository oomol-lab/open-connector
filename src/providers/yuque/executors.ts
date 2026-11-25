import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalString, optionalScalarString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { requiredResponseRecord } from "../provider-runtime.ts";
import { requestYuque, yuqueBaseUrl, yuqueHeaders, yuqueHandlers } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("yuque", yuqueHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, context) {
    const payload = await requestYuque(input.apiKey, context, "/user");
    const user = requiredResponseRecord(payload.data, "Yuque current user");
    return {
      profile: {
        accountId: optionalScalarString(user.id),
        displayName: optionalString(user.name) ?? optionalString(user.login) ?? "Yuque Account",
      },
      metadata: { apiBaseUrl: yuqueBaseUrl },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "yuque",
  baseUrl: yuqueBaseUrl,
  defaultHeaders: yuqueHeaders,
  auth: { type: "api_key_header", name: "X-Auth-Token" },
  skipDnsValidation: true,
});
