import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ticketTailorActionHandlers, validateTicketTailorCredential } from "./runtime.ts";
const service = "ticket_tailor";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ticketTailorActionHandlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.tickettailor.com",
  auth: { type: "api_key_basic", suffix: ":" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTicketTailorCredential(input.apiKey, fetcher, signal);
  },
};
