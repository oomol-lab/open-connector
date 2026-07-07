import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { executors, payhipApiBaseUrl, validatePayhipCredential } from "./runtime.ts";

export { executors };

const service = "payhip";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: payhipApiBaseUrl,
  auth: {
    type: "api_key_header",
    name: "payhip-api-key",
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validatePayhipCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
