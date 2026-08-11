import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { resendActionHandlers, validateResendCredential } from "./runtime.ts";

const service = "resend";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, resendActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateResendCredential(input.apiKey, fetcher, signal);
  },
};
