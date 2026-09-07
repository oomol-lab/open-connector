import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { executors, platerecognizerApiBaseUrl, validatePlaterecognizerCredential } from "./runtime.ts";

export { executors };
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "platerecognizer",
  baseUrl: platerecognizerApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Token " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validatePlaterecognizerCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
