import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { validateVirustotalCredential, virustotalActionHandlers } from "./runtime.ts";

const service = "virustotal";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, virustotalActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateVirustotalCredential(input.apiKey, fetcher, signal);
  },
};
