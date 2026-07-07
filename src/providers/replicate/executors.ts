import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { executors, replicateApiBaseUrl, validateReplicateCredential } from "./runtime.ts";

export { executors };

const service = "replicate";

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateReplicateCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: replicateApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});
