import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { algoliaActionHandlers, readAlgoliaApplicationId, validateAlgoliaCredential } from "./runtime.ts";

const service = "algolia";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: algoliaActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      applicationId: readAlgoliaApplicationId(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAlgoliaCredential(
      {
        apiKey: input.apiKey,
        applicationId: input.values.applicationId,
      },
      fetcher,
      signal,
    );
  },
};
