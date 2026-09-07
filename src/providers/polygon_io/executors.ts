import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { executors, polygonIoApiBaseUrl, validatePolygonIoCredential } from "./runtime.ts";

export { executors };

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "polygon_io",
  baseUrl: polygonIoApiBaseUrl,
  auth: { type: "api_key_query", name: "apiKey" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validatePolygonIoCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
