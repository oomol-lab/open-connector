import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { executors, prospeoApiBaseUrl, validateProspeoCredential } from "./runtime.ts";

export { executors };

const service = "prospeo";

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateProspeoCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: prospeoApiBaseUrl,
  auth: { type: "api_key_header", name: "X-KEY" },
});
