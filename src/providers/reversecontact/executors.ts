import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { reversecontactActionHandlers, reversecontactApiBaseUrl, validateReversecontactCredential } from "./runtime.ts";

const handlers = {
  enrich_person: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    reversecontactActionHandlers.enrich_person(
      { apiKey: context.apiKey, actionName: "enrich_person", input },
      context.fetcher,
    ),
  enrich_company: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    reversecontactActionHandlers.enrich_company(
      { apiKey: context.apiKey, actionName: "enrich_company", input },
      context.fetcher,
    ),
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("reversecontact", handlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "reversecontact",
  baseUrl: reversecontactApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateReversecontactCredential({ apiKey: input.apiKey }, fetcher);
    return { profile: { displayName: result.accountLabel }, grantedScopes: [], metadata: result.providerMetadata };
  },
};
