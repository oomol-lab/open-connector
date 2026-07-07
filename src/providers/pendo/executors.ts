import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { executors, pendoApiBaseUrl, validatePendoCredential } from "./runtime.ts";

export { executors };

const service = "pendo";

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validatePendoCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: pendoApiBaseUrl,
  auth: { type: "api_key_header", name: "x-pendo-integration-key" },
});
