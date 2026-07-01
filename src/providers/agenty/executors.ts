import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { AgentyRuntimeContext } from "./runtime.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { agentyActionHandlers, validateAgentyApiKey } from "./runtime.ts";

const service = "agenty";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: agentyActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    const providerContext: AgentyRuntimeContext = {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
    if (context.transitFiles) {
      providerContext.transitFiles = context.transitFiles;
    }
    return providerContext;
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAgentyApiKey(input.apiKey, fetcher, signal);
  },
};
