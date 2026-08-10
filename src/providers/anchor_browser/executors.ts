import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { anchorBrowserActionHandlers, validateAnchorBrowserCredential } from "./runtime.ts";

const service = "anchor_browser";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, anchorBrowserActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAnchorBrowserCredential({ apiKey: input.apiKey }, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.anchorbrowser.io",
  auth: { type: "api_key_header", name: "anchor-api-key" },
});
