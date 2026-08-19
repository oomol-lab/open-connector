import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { executePractitestAction, validatePractitestCredential } from "./runtime.ts";

const service = "practitest";

const handlers: ProviderActionHandlers<
  "practitest",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  list_projects: (input, context) =>
    executePractitestAction(
      { apiKey: context.apiKey, values: {}, actionName: "list_projects", input },
      context.fetcher,
    ),
  get_project: (input, context) =>
    executePractitestAction({ apiKey: context.apiKey, values: {}, actionName: "get_project", input }, context.fetcher),
  list_tests: (input, context) =>
    executePractitestAction({ apiKey: context.apiKey, values: {}, actionName: "list_tests", input }, context.fetcher),
  get_test: (input, context) =>
    executePractitestAction({ apiKey: context.apiKey, values: {}, actionName: "get_test", input }, context.fetcher),
  create_test: (input, context) =>
    executePractitestAction({ apiKey: context.apiKey, values: {}, actionName: "create_test", input }, context.fetcher),
  update_test: (input, context) =>
    executePractitestAction({ apiKey: context.apiKey, values: {}, actionName: "update_test", input }, context.fetcher),
  delete_test: (input, context) =>
    executePractitestAction({ apiKey: context.apiKey, values: {}, actionName: "delete_test", input }, context.fetcher),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validatePractitestCredential({ apiKey: input.apiKey }, fetcher);
    return {
      profile: { displayName: result.accountLabel },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.practitest.com/api/v2",
  auth: { type: "api_key_header", name: "PTToken" },
  skipDnsValidation: true,
});
