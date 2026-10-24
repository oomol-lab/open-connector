import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { executors, venafiCloudBaseUrls, validateVenafiCloudCredential } from "./runtime.ts";

export { executors };

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "venafitlsprotectcloud",
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, "venafitlsprotectcloud");
    return credential.metadata.region === "eu" ? venafiCloudBaseUrls.eu : venafiCloudBaseUrls.us;
  },
  auth: { type: "api_key_header", name: "tppl-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateVenafiCloudCredential({ apiKey: input.apiKey, ...input.values }, fetcher, signal);
  },
};
