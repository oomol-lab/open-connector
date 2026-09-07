import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy, mapProviderActionSources } from "../provider-runtime.ts";
import { executeReadMeAction, readmeActionHandlers, readmeApiBaseUrl, validateReadMeCredential } from "./runtime.ts";

const service = "readme";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: readmeApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

const readmeExecutorHandlers = mapProviderActionSources(
  service,
  readmeActionHandlers,
  (name) => (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    executeReadMeAction({ apiKey: context.apiKey, actionName: name, input }, context.fetcher),
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, readmeExecutorHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateReadMeCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
