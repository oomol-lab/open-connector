import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ciscoMerakiActionHandlers, ciscoMerakiApiBaseUrl, validateCiscoMerakiCredential } from "./runtime.ts";

const service = "cisco_meraki";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ciscoMerakiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: ciscoMerakiApiBaseUrl,
  auth: {
    type: "api_key_header",
    name: "X-Cisco-Meraki-API-Key",
  },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateCiscoMerakiCredential(input.apiKey, fetcher, signal);
  },
};
