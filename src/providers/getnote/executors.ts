import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { getnoteActionHandlers, readGetnoteClientId, validateGetnoteCredential } from "./runtime.ts";

const service = "getnote";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: getnoteActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    const clientId = readGetnoteClientId({
      values: credential.values,
      metadata: credential.metadata,
    });

    return {
      apiKey: credential.apiKey,
      clientId,
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "Getnote request failed.",
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    readGetnoteClientId({
      values: input.values,
    });

    return validateGetnoteCredential(input, fetcher, signal);
  },
};
