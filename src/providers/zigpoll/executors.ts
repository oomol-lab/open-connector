import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateZigpollCredential, zigpollActionHandlers, zigpollApiBaseUrl } from "./runtime.ts";

const service = "zigpoll";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, zigpollActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: zigpollApiBaseUrl,
  auth: { type: "api_key_header", name: "Authorization" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateZigpollCredential({ apiKey: input.apiKey }, fetcher, signal);
  },
};
