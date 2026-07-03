import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { bigpictureIoActionHandlers, validateBigpictureIoCredential } from "./runtime.ts";

const service = "bigpicture_io";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bigpictureIoActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBigpictureIoCredential(input.apiKey, fetcher, signal);
  },
};
