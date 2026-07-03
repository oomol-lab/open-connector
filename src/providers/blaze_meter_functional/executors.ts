import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { BlazeMeterFunctionalContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  blazeMeterFunctionalActionHandlers,
  requireBlazeMeterFunctionalApiKeyId,
  validateBlazeMeterFunctionalCredential,
} from "./runtime.ts";

const service = "blaze_meter_functional";

export const executors: ProviderExecutors = defineProviderExecutors<BlazeMeterFunctionalContext>({
  service,
  handlers: blazeMeterFunctionalActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<BlazeMeterFunctionalContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKeyId: requireBlazeMeterFunctionalApiKeyId(
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
    return validateBlazeMeterFunctionalCredential(input, fetcher, signal);
  },
};
