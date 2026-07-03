import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { BlazeMeterPerformanceContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  blazeMeterPerformanceActionHandlers,
  requireBlazeMeterPerformanceApiKeyId,
  validateBlazeMeterPerformanceCredential,
} from "./runtime.ts";

const service = "blaze_meter_performance";

export const executors: ProviderExecutors = defineProviderExecutors<BlazeMeterPerformanceContext>({
  service,
  handlers: blazeMeterPerformanceActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<BlazeMeterPerformanceContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKeyId: requireBlazeMeterPerformanceApiKeyId(
        optionalString(credential.values.apiKeyId) ?? optionalString(credential.metadata.apiKeyId),
      ),
      apiSecret: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBlazeMeterPerformanceCredential(input, fetcher, signal);
  },
};
