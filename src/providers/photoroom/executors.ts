import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { createProviderFetch, defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { photoroomActionHandlers, validatePhotoroomCredential } from "./runtime.ts";

const service = "photoroom";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, photoroomActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      skipDnsValidation: true,
    });
    return validatePhotoroomCredential(input.apiKey, guardedFetcher, signal);
  },
};
