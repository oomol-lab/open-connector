import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { executors, phantombusterApiBaseUrl, validatePhantombusterCredential } from "./runtime.ts";

export { executors };

const service = "phantombuster";

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validatePhantombusterCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: phantombusterApiBaseUrl,
  auth: { type: "api_key_header", name: "X-Phantombuster-Key" },
});
