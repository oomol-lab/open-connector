import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { executeTeamupAction, validateTeamupCredential } from "./runtime.ts";

const service = "teamup";

const handlers: ProviderActionHandlers<
  "teamup",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  list_events: (input, context) =>
    executeTeamupAction({ apiKey: context.apiKey, values: {}, actionName: "list_events", input }, context.fetcher),
  get_event: (input, context) =>
    executeTeamupAction({ apiKey: context.apiKey, values: {}, actionName: "get_event", input }, context.fetcher),
  create_event: (input, context) =>
    executeTeamupAction({ apiKey: context.apiKey, values: {}, actionName: "create_event", input }, context.fetcher),
  update_event: (input, context) =>
    executeTeamupAction({ apiKey: context.apiKey, values: {}, actionName: "update_event", input }, context.fetcher),
  delete_event: (input, context) =>
    executeTeamupAction({ apiKey: context.apiKey, values: {}, actionName: "delete_event", input }, context.fetcher),
  list_subcalendars: (input, context) =>
    executeTeamupAction(
      { apiKey: context.apiKey, values: {}, actionName: "list_subcalendars", input },
      context.fetcher,
    ),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateTeamupCredential({ apiKey: input.apiKey }, fetcher);
    return {
      profile: { displayName: result.accountLabel },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.teamup.com",
  auth: { type: "api_key_header", name: "Teamup-Token" },
  skipDnsValidation: true,
});
