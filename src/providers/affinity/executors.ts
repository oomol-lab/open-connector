import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { affinityActionHandlers, validateAffinityCredential } from "./runtime.ts";

const service = "affinity";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: affinityActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAffinityCredential(input.apiKey, fetcher, signal);
  },
};
