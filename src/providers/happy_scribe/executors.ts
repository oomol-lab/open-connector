import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { executeHappyScribeAction, validateHappyScribeCredential } from "./runtime.ts";

const service = "happy_scribe";

const handlers: ProviderActionHandlers<
  "happy_scribe",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  list_organizations: (input, context) =>
    executeHappyScribeAction(
      { apiKey: context.apiKey, values: {}, actionName: "list_organizations", input },
      context.fetcher,
    ),
  create_transcription_order: (input, context) =>
    executeHappyScribeAction(
      { apiKey: context.apiKey, values: {}, actionName: "create_transcription_order", input },
      context.fetcher,
    ),
  create_translation_order: (input, context) =>
    executeHappyScribeAction(
      { apiKey: context.apiKey, values: {}, actionName: "create_translation_order", input },
      context.fetcher,
    ),
  get_order: (input, context) =>
    executeHappyScribeAction({ apiKey: context.apiKey, values: {}, actionName: "get_order", input }, context.fetcher),
  confirm_order: (input, context) =>
    executeHappyScribeAction(
      { apiKey: context.apiKey, values: {}, actionName: "confirm_order", input },
      context.fetcher,
    ),
  list_transcriptions: (input, context) =>
    executeHappyScribeAction(
      { apiKey: context.apiKey, values: {}, actionName: "list_transcriptions", input },
      context.fetcher,
    ),
  get_transcription: (input, context) =>
    executeHappyScribeAction(
      { apiKey: context.apiKey, values: {}, actionName: "get_transcription", input },
      context.fetcher,
    ),
  update_transcription: (input, context) =>
    executeHappyScribeAction(
      { apiKey: context.apiKey, values: {}, actionName: "update_transcription", input },
      context.fetcher,
    ),
  delete_transcription: (input, context) =>
    executeHappyScribeAction(
      { apiKey: context.apiKey, values: {}, actionName: "delete_transcription", input },
      context.fetcher,
    ),
  create_export: (input, context) =>
    executeHappyScribeAction(
      { apiKey: context.apiKey, values: {}, actionName: "create_export", input },
      context.fetcher,
    ),
  get_export: (input, context) =>
    executeHappyScribeAction({ apiKey: context.apiKey, values: {}, actionName: "get_export", input }, context.fetcher),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateHappyScribeCredential({ apiKey: input.apiKey }, fetcher);
    return {
      profile: { displayName: result.accountLabel },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://www.happyscribe.com/api/v1",
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});
