import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { myOtpAppActionHandlers, myOtpAppApiBaseUrl, validateMyOtpApp } from "./runtime.ts";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("myotp_app", myOtpAppActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "myotp_app",
  baseUrl: myOtpAppApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMyOtpApp({ apiKey: input.apiKey, fetcher, signal });
  },
};
