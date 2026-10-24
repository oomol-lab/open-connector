import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import { defineApiKeyProviderExecutors, mapProviderActionNames } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { stealthgptActions } from "./actions.ts";
import { executeStealthgptAction, stealthgptApiBaseUrl, validateStealthgptCredential } from "./runtime.ts";

const service = "stealthgpt";
type StealthgptHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"stealthgpt", StealthgptHandler> = mapProviderActionNames(
  service,
  stealthgptActions.map((action) => action.name),
  (actionName) => (input, context) =>
    executeStealthgptAction(actionName, input, context.apiKey, context.fetcher, context.signal),
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: stealthgptApiBaseUrl,
  auth: { type: "api_key_header", name: "api-token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateStealthgptCredential(input.apiKey, fetcher, signal);
  },
};
