import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { executeInsitesAction, insitesApiBaseUrl, validateInsitesCredential } from "./runtime.ts";

const handlers = {
  start_audit: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    executeInsitesAction("start_audit", input, context.apiKey, context.fetcher),
  get_audit: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    executeInsitesAction("get_audit", input, context.apiKey, context.fetcher),
  get_llm_audit: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    executeInsitesAction("get_llm_audit", input, context.apiKey, context.fetcher),
  list_audits: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    executeInsitesAction("list_audits", input, context.apiKey, context.fetcher),
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("insites", handlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "insites",
  baseUrl: insitesApiBaseUrl,
  auth: { type: "api_key_header", name: "api-key" },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateInsitesCredential({ apiKey: input.apiKey }, fetcher);
    return { profile: { displayName: result.accountLabel }, grantedScopes: [], metadata: result.providerMetadata };
  },
};
