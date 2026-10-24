import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ticketSourceActionHandlers, ticketSourceApiBaseUrl, validateTicketSourceCredential } from "./runtime.ts";

const service = "ticket_source";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ticketSourceActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: ticketSourceApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateTicketSourceCredential(input.apiKey, fetcher);
  },
};
