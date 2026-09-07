import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { executors, pdflessApiBaseUrl, validatePdflessCredential } from "./runtime.ts";

export { executors };

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "pdfless",
  baseUrl: pdflessApiBaseUrl,
  auth: { type: "api_key_header", name: "apikey" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validatePdflessCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
