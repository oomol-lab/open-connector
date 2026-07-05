import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { FreshsalesActionContext } from "./runtime.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { freshsalesActionHandlers, resolveFreshsalesBaseUrl, validateFreshsalesCredential } from "./runtime.ts";

const service = "freshsales";

export const executors: ProviderExecutors = defineProviderExecutors<FreshsalesActionContext>({
  service,
  handlers: freshsalesActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<FreshsalesActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: resolveFreshsalesBaseUrl(credential.values, credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateFreshsalesCredential(input.apiKey, input.values, fetcher, signal);
  },
};
