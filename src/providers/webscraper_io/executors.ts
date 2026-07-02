import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { validateWebscraperIoCredential, webscraperIoActionHandlers } from "./runtime.ts";

const service = "webscraper_io";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, webscraperIoActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWebscraperIoCredential(input.apiKey, fetcher, signal);
  },
};
