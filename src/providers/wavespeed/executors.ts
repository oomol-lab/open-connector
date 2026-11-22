import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-proxy.ts";
import { executors, validateWavespeedCredential, wavespeedApiBaseUrl } from "./runtime.ts";

export { executors };

const service = "wavespeed";

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWavespeedCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: wavespeedApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});
