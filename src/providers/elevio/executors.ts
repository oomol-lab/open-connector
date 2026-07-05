import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineProviderExecutors } from "../provider-runtime.ts";
import { createElevioContext, elevioActionHandlers, validateElevioCredential } from "./runtime.ts";

const service = "elevio";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: elevioActionHandlers,
  createContext: createElevioContext,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateElevioCredential(input, fetcher, signal);
  },
};
