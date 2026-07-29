import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { createProviderFetch, defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { createLingxingContext, lingxingActionHandlers, validateLingxingCredential } from "./runtime.ts";

const service = "lingxing";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: lingxingActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireCustomCredential(context, service);
    return createLingxingContext(credential.values, fetcher, context.signal);
  },
  fallbackMessage: "Lingxing MCP request failed",
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({ fetch: fetcher });
    return validateLingxingCredential(input.values, guardedFetcher, signal);
  },
};
