import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { RailwayActionContext } from "./runtime.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { createRailwayContext, railwayActionHandlers, validateRailwayCredential } from "./runtime.ts";

const service = "railway";

export const executors: ProviderExecutors = defineProviderExecutors<RailwayActionContext>({
  service,
  handlers: railwayActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<RailwayActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return createRailwayContext(credential.values, credential.apiKey, fetcher, context.signal);
  },
  fallbackMessage: "Railway request failed",
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateRailwayCredential(input.apiKey, input.values, fetcher, signal);
  },
};
