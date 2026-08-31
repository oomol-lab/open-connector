import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { executors, qianfanApiBaseUrl, qianfanApiOrigin, validateQianfanCredential } from "./runtime.ts";

export { executors };

const service = "qianfan";

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateQianfanCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: qianfanApiOrigin,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ endpoint, url, headers }) {
    const baseUrl = qianfanProxyBaseUrl(endpoint);
    if (baseUrl !== qianfanApiOrigin) {
      url.pathname = `${new URL(baseUrl).pathname}${url.pathname}`;
    }
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
  skipDnsValidation: true,
});

function qianfanProxyBaseUrl(endpoint: string): string {
  if (endpoint === "/v2" || endpoint.startsWith("/v2/") || endpoint.startsWith("/video/generations")) {
    return qianfanApiOrigin;
  }
  return qianfanApiBaseUrl;
}
