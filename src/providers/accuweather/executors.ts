import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { accuweatherActionHandlers, validateAccuweatherCredential } from "./runtime.ts";

const service = "accuweather";
const accuweatherApiBaseUrl = "https://dataservice.accuweather.com";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, accuweatherActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: accuweatherApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("accept-encoding", "gzip,deflate");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateAccuweatherCredential(input.apiKey, fetcher, signal);
  },
};
