import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { executors, validatePipedriveCredential } from "./runtime.ts";

export { executors };

const service = "pipedrive";
const apiOrigin = "https://api.pipedrive.com";

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validatePipedriveCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiOrigin,
  auth: { type: "api_key_header", name: "x-api-token" },
});
