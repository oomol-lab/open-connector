import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";

import { defineBearerProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  fetchTypeformCurrentAccount,
  typeformActionHandlers,
  typeformApiBaseUrl,
  validateTypeformCredential,
} from "./runtime.ts";
import { typeformResponse } from "./trigger-on-form-response.ts";

const service = "typeform";

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, typeformActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: typeformApiBaseUrl,
  auth: { type: "bearer" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTypeformCredential(input.apiKey, fetcher, signal);
  },
  oauth2(input, { fetcher, signal }) {
    return fetchTypeformCurrentAccount(input.accessToken, fetcher, signal);
  },
};

export const triggers: readonly IntegrationDefinition[] = [typeformResponse];
