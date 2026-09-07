import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { hotspotsystemActionHandlers, hotspotsystemApiBaseUrl, validateHotspotsystemCredential } from "./runtime.ts";

const service = "hotspotsystem";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, hotspotsystemActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: hotspotsystemApiBaseUrl,
  auth: { type: "api_key_header", name: "sn-apikey" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateHotspotsystemCredential,
};
