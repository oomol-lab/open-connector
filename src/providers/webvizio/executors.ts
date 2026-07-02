import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { validateWebvizioCredential, webvizioActionHandlers } from "./runtime.ts";

const service = "webvizio";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, webvizioActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWebvizioCredential(input.apiKey, fetcher, signal);
  },
};
