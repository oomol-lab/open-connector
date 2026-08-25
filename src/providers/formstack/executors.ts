import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { formstackActionHandlers, validateFormstackCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("formstack", formstackActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateFormstackCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
