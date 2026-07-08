import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { McdonaldsCnContext } from "./runtime.ts";

import { defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { createMcdonaldsCnContext, mcdonaldsCnActionHandlers, validateMcdonaldsCnCredential } from "./runtime.ts";

const service = "mcdonalds_cn";

export const executors: ProviderExecutors = defineProviderExecutors<McdonaldsCnContext>({
  service,
  handlers: mcdonaldsCnActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<McdonaldsCnContext> {
    const credential = await requireCustomCredential(context, service);
    return createMcdonaldsCnContext(credential.values, fetcher, context.signal);
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateMcdonaldsCnCredential(input.values, fetcher, signal);
  },
};
