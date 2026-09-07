import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { executors, pushsaferApiBaseUrl, validatePushsaferCredential } from "./runtime.ts";

export { executors };

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "pushsafer",
  baseUrl: pushsaferApiBaseUrl,
  auth: { type: "api_key_query", name: "k" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validatePushsaferCredential({ apiKey: input.apiKey, ...input.values }, fetcher, signal);
  },
};
