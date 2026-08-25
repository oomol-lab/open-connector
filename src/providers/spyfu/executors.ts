import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy, mapProviderActionSources } from "../provider-runtime.ts";
import { spyfuActionHandlers, spyfuProxyBaseUrl, validateSpyfuCredential } from "./runtime.ts";

const handlers = mapProviderActionSources(
  "spyfu",
  spyfuActionHandlers,
  (_name, handler) => (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    handler(input, context.fetcher, context.apiKey),
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("spyfu", handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "spyfu",
  baseUrl: spyfuProxyBaseUrl,
  auth: { type: "api_key_query", name: "api_key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateSpyfuCredential({ apiKey: input.apiKey }, fetcher).then((result) => ({
      profile: { accountId: `spyfu:${input.apiKey.slice(-8)}`, displayName: result.accountLabel },
      metadata: result.providerMetadata,
    }));
  },
};
