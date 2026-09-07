import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { executors, postgridVerifyApiBaseUrl, validatePostgridVerifyCredential } from "./runtime.ts";

export { executors };

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "postgrid_verify",
  baseUrl: postgridVerifyApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validatePostgridVerifyCredential({ apiKey: input.apiKey, ...input.values }, fetcher, signal);
  },
};
