import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { requiredResponseRecord, requiredInputString } from "../provider-runtime.ts";
import { yuanfenjuActionHandlers, yuanfenjuApiBaseUrl, requestYuanfenju, yuanfenjuAccountPath } from "./runtime.ts";

const service = "yuanfenju";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, yuanfenjuActionHandlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: yuanfenjuApiBaseUrl,
  auth: { type: "api_key_query_or_form_body", name: "api_key", bodyMethods: ["POST"] },
  redirect: "manual",
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const result = await requestYuanfenju(
      yuanfenjuAccountPath,
      {},
      { apiKey: requiredInputString(input.apiKey, "apiKey"), fetcher, signal },
    );
    const account = requiredResponseRecord(result.data, "yuanfenju account");
    return {
      profile: {
        displayName:
          optionalString(account.merchant_nickname) ?? optionalString(account.merchant_email) ?? "Yuanfenju Account",
      },
      grantedScopes: [],
      metadata: { apiBaseUrl: yuanfenjuApiBaseUrl, validationEndpoint: yuanfenjuAccountPath },
    };
  },
};
