import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { xingpanActionHandlers, xingpanApiBaseUrl, validateXingpanCredential } from "./runtime.ts";

const service = "xingpan";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, xingpanActionHandlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: xingpanApiBaseUrl,
  auth: { type: "api_key_query_or_form_body", name: "access_token" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateXingpanCredential(input.apiKey, fetcher, signal);
  },
};
