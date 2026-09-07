import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  energyPerformanceCertificatesActionHandlers,
  energyPerformanceCertificatesApiBaseUrl,
  validateEnergyPerformanceCertificatesCredential,
} from "./runtime.ts";

const service = "energy_performance_certificates";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  service,
  energyPerformanceCertificatesActionHandlers,
);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: energyPerformanceCertificatesApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateEnergyPerformanceCertificatesCredential(input.apiKey, fetcher, signal);
  },
};
