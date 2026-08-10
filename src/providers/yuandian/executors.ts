import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateYuandianCredential, yuandianActionHandlers } from "./runtime.ts";

const service = "yuandian";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, yuandianActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateYuandianCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://open.chineselaw.com/open",
  auth: { type: "api_key_header", name: "x-api-key" },
});
