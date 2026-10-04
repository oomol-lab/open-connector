import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  getyoutubetranscriptActionHandlers,
  getyoutubetranscriptApiBaseUrl,
  validateGetyoutubetranscriptCredential,
} from "./runtime.ts";

const service = "getyoutubetranscript";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, getyoutubetranscriptActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateGetyoutubetranscriptCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: getyoutubetranscriptApiBaseUrl,
  auth: { type: "bearer" },
});
