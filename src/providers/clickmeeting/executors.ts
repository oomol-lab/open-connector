import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { clickMeetingActionHandlers, clickMeetingApiBaseUrl, validateClickMeetingCredential } from "./runtime.ts";

const service = "clickmeeting";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, clickMeetingActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: clickMeetingApiBaseUrl,
  auth: { type: "api_key_header", name: "X-Api-Key" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateClickMeetingCredential(input.apiKey, fetcher, signal);
  },
};
