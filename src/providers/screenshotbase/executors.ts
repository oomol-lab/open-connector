import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { screenshotbaseActionHandlers, validateScreenshotbaseCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "screenshotbase",
  screenshotbaseActionHandlers,
  { skipDnsValidation: true },
);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateScreenshotbaseCredential(input, fetcher);
  },
};
