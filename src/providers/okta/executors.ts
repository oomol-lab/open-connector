import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { OktaActionContext, OktaActionName } from "./runtime.ts";

import { defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { createOktaContext, oktaActionHandlers, validateOktaCredential } from "./runtime.ts";

const service = "okta";

export const executors: ProviderExecutors = defineProviderExecutors<OktaActionContext>({
  service,
  handlers: oktaActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<OktaActionContext> {
    const credential = await requireCustomCredential(context, service);
    return createOktaContext(credential.values, fetcher, context.signal);
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateOktaCredential(input.values, fetcher, signal);
  },
};

export type { OktaActionName };
