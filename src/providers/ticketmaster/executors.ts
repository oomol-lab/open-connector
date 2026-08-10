import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { ticketmasterActionHandlers, validateTicketmasterCredential } from "./runtime.ts";

const service = "ticketmaster";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ticketmasterActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey: validateTicketmasterCredential,
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://app.ticketmaster.com",
  auth: { type: "api_key_query", name: "apikey" },
});
