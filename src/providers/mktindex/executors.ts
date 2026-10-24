import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { providerInputError } from "../provider-runtime.ts";
import { mktindexActions } from "./actions.ts";
import { mktindexApiBaseUrl } from "./request.ts";
import { mktindexActionHandlers, validateMktindexCredential } from "./runtime.ts";
const service = "mktindex";
const handlers = mapProviderActionHandlers(service, mktindexActions, (action) => {
  const handler = mktindexActionHandlers[action.name];
  if (!handler)
    return async () => {
      throw providerInputError(`Unknown mktindex action: ${action.name}`);
    };
  return (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    handler(input, { apiKey: context.apiKey, fetcher: context.fetcher });
});
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: mktindexApiBaseUrl,
  auth: { type: "api_key_header", name: "MOOJING-APIKEY" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateMktindexCredential({ apiKey: input.apiKey }, fetcher);
  },
};
