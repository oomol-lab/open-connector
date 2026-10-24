import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { createProviderFetch } from "../provider-runtime.ts";
import { toriiImageTranslatorActionHandlers, validateCredential } from "./runtime.ts";

const service = "torii_image_translator";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, toriiImageTranslatorActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateCredential(input.apiKey, createProviderFetch({ fetch: fetcher, skipDnsValidation: true }), signal);
  },
};
