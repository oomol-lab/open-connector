import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { elorusApiBaseUrl, elorusExecutors, validateElorusCredential } from "./runtime.ts";

export const executors: ProviderExecutors = elorusExecutors;

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "elorus",
  baseUrl: elorusApiBaseUrl,
  auth: {
    type: "credential_headers",
    headers: [
      { name: "Authorization", source: { type: "api_key" }, prefix: "Token " },
      { name: "X-Elorus-Organization", source: { type: "credential_value", name: "organizationId" } },
    ],
  },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateElorusCredential(input, fetcher, signal);
  },
};
