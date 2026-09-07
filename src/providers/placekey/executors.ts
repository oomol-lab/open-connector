import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { executors, placekeyApiBaseUrl, validatePlacekeyCredential } from "./runtime.ts";

export { executors };

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "placekey",
  baseUrl: placekeyApiBaseUrl,
  auth: { type: "api_key_header", name: "apikey" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validatePlacekeyCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
