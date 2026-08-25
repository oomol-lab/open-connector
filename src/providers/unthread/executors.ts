import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { executeUnthreadAction, validateUnthreadCredential } from "./runtime.ts";

const service = "unthread";

const handlers: ProviderActionHandlers<
  "unthread",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  create_account: (input, context) =>
    executeUnthreadAction({ apiKey: context.apiKey, values: {}, actionName: "create_account", input }, context.fetcher),
  get_account: (input, context) =>
    executeUnthreadAction({ apiKey: context.apiKey, values: {}, actionName: "get_account", input }, context.fetcher),
  list_accounts: (input, context) =>
    executeUnthreadAction({ apiKey: context.apiKey, values: {}, actionName: "list_accounts", input }, context.fetcher),
  update_account: (input, context) =>
    executeUnthreadAction({ apiKey: context.apiKey, values: {}, actionName: "update_account", input }, context.fetcher),
  delete_account: (input, context) =>
    executeUnthreadAction({ apiKey: context.apiKey, values: {}, actionName: "delete_account", input }, context.fetcher),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateUnthreadCredential({ apiKey: input.apiKey }, fetcher);
    return {
      profile: { displayName: result.accountLabel },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.unthread.io/api",
  auth: { type: "api_key_header", name: "X-Api-Key" },
  skipDnsValidation: true,
});
