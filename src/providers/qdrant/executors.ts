import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { createQdrantContext, qdrantActionHandlers, validateQdrantCredential } from "./runtime.ts";

const service = "qdrant";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: qdrantActionHandlers,
  async createContext(context: ExecutionContext, fetcher): Promise<ReturnType<typeof createQdrantContext>> {
    const credential = await requireCustomCredential(context, service);
    return createQdrantContext(credential.values, fetcher, context.signal);
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    return validateQdrantCredential(input.values, fetcher, signal);
  },
};
