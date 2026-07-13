import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { DokployActionContext } from "./runtime.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { createDokployContext, dokployActionHandlers, validateDokployCredential } from "./runtime.ts";

const service = "dokploy";

export const executors: ProviderExecutors = defineProviderExecutors<DokployActionContext>({
  service,
  handlers: dokployActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<DokployActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return createDokployContext(credential.values, credential.apiKey, fetcher, context.signal, context.transitFiles);
  },
  fallbackMessage: "Dokploy request failed",
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateDokployCredential(input.values, input.apiKey, fetcher, signal);
  },
};
