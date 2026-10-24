import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-proxy.ts";
import { executors, pineconeApiVersion, pineconeControlApiBaseUrl, validatePineconeCredential } from "./runtime.ts";

export { executors };

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "pinecone",
  baseUrl: pineconeControlApiBaseUrl,
  auth: { type: "api_key_header", name: "api-key" },
  customizeRequest({ headers }) {
    headers.set("x-pinecone-api-version", pineconeApiVersion);
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validatePineconeCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
