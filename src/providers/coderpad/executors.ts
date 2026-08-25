import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { executeCoderpadAction, validateCoderpadCredential } from "./runtime.ts";

const service = "coderpad";

const handlers: ProviderActionHandlers<
  "coderpad",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  list_pads: (input, context) => executeCoderpadAction("list_pads", input, context.apiKey, context.fetcher),
  get_pad: (input, context) => executeCoderpadAction("get_pad", input, context.apiKey, context.fetcher),
  create_pad: (input, context) => executeCoderpadAction("create_pad", input, context.apiKey, context.fetcher),
  list_pad_events: (input, context) => executeCoderpadAction("list_pad_events", input, context.apiKey, context.fetcher),
  list_questions: (input, context) => executeCoderpadAction("list_questions", input, context.apiKey, context.fetcher),
  get_question: (input, context) => executeCoderpadAction("get_question", input, context.apiKey, context.fetcher),
  get_organization: (input, context) =>
    executeCoderpadAction("get_organization", input, context.apiKey, context.fetcher),
  get_organization_stats: (input, context) =>
    executeCoderpadAction("get_organization_stats", input, context.apiKey, context.fetcher),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateCoderpadCredential(input.apiKey, fetcher);
    return {
      profile: { displayName: result.accountLabel },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://app.coderpad.io",
  auth: { type: "api_key_authorization", prefix: 'Token token="', suffix: '"' },
  skipDnsValidation: true,
});
