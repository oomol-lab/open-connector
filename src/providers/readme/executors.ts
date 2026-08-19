import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, mapProviderActionSources } from "../provider-runtime.ts";
import { executeReadMeAction, readmeActionHandlers, validateReadMeCredential } from "./runtime.ts";

const service = "readme";

const readmeExecutorHandlers = mapProviderActionSources(
  service,
  readmeActionHandlers,
  (name) => (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    executeReadMeAction({ apiKey: context.apiKey, actionName: name, input }, context.fetcher),
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, readmeExecutorHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateReadMeCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
