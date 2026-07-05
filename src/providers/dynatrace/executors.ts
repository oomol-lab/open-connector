import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { DynatraceContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { dynatraceActionHandlers, normalizeDynatraceEnvironmentUrl, validateDynatraceCredential } from "./runtime.ts";

const service = "dynatrace";

export const executors: ProviderExecutors = defineProviderExecutors<DynatraceContext>({
  service,
  handlers: dynatraceActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<DynatraceContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      environmentUrl: normalizeDynatraceEnvironmentUrl(
        credential.values.environmentUrl ?? optionalString(credential.metadata.environmentUrl),
      ),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateDynatraceCredential(input.apiKey, input.values.environmentUrl, fetcher, signal);
  },
};
