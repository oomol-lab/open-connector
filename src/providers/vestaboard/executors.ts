import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { validateVestaboardCredential, vestaboardActionHandlers } from "./runtime.ts";

const service = "vestaboard";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, vestaboardActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateVestaboardCredential(input.apiKey, fetcher, signal);
  },
};
