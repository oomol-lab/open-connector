import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { validateWebshareCredential, webshareActionHandlers } from "./runtime.ts";

const service = "webshare";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, webshareActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWebshareCredential(input.apiKey, fetcher, signal);
  },
};
