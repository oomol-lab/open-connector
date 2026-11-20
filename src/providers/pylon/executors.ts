import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-proxy.ts";
import { executors, pylonApiBaseUrl, validatePylonCredential } from "./runtime.ts";

export { executors };
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "pylon",
  baseUrl: pylonApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  defaultHeaders: { "accept": "application/json", "content-type": "application/json" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validatePylonCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
