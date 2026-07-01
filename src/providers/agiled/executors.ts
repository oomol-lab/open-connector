import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { agiledActionHandlers, readAgiledBrand, validateAgiledCredential } from "./runtime.ts";

const service = "agiled";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: agiledActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      brand: readAgiledBrand(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAgiledCredential(
      {
        apiKey: input.apiKey,
        ...input.values,
      },
      fetcher,
      signal,
    );
  },
};
