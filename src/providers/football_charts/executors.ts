import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  createFootballChartsContext,
  footballChartsActionHandlers,
  footballChartsApiBaseUrl,
  readFootballChartsError,
  validateFootballChartsCredential,
} from "./runtime.ts";

const service = "football_charts";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: footballChartsActionHandlers,
  createContext: createFootballChartsContext,
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: footballChartsApiBaseUrl,
  auth: { type: "optional_api_key_header", name: "Authorization", prefix: "Bearer " },
  readError: (response) => readFootballChartsError(response, "execute"),
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateFootballChartsCredential,
};
