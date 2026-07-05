import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { esignaturesIoActionHandlers, validateEsignaturesIoCredential } from "./runtime.ts";

const service = "esignatures_io";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, esignaturesIoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateEsignaturesIoCredential(input.apiKey, fetcher, signal);
  },
};
