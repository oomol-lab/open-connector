import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, mapProviderActionSources } from "../provider-runtime.ts";
import { deepgramActionHandlers, validateDeepgramCredential } from "./runtime.ts";

const service = "deepgram";

const handlers = mapProviderActionSources(
  service,
  deepgramActionHandlers,
  (_name, handler) => (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    handler(input, context.fetcher, context.apiKey),
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    return validateDeepgramCredential({ apiKey: input.apiKey }, fetcher);
  },
};
