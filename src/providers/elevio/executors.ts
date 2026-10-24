import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ResolvedCredential,
} from "../../core/types.ts";

import { requiredString } from "../../core/cast.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { createElevioContext, elevioActionHandlers, elevioApiBaseUrl, validateElevioCredential } from "./runtime.ts";

const service = "elevio";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: elevioActionHandlers,
  createContext: createElevioContext,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: elevioApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  customizeRequest({ headers, credential }) {
    const apiCredential = credential as Extract<ResolvedCredential, { authType: "api_key" }>;
    headers.set(
      "authorization",
      `Bearer ${requiredString(apiCredential.values.jwt, "jwt", (message) => new ProviderRequestError(400, message))}`,
    );
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateElevioCredential(input, fetcher, signal);
  },
};
