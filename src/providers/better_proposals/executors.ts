import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { betterProposalsActionHandlers, validateBetterProposalsCredential } from "./runtime.ts";

const service = "better_proposals";
const betterProposalsApiBaseUrl = "https://api.betterproposals.io";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, betterProposalsActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: betterProposalsApiBaseUrl,
  auth: { type: "api_key_header", name: "Bptoken" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBetterProposalsCredential(input.apiKey, fetcher, signal);
  },
};
