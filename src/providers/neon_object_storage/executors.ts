import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { validateNeonCredential } from "../neon/runtime.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { neonObjectStorageActionHandlers } from "./runtime.ts";

const service = "neon_object_storage";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, neonObjectStorageActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateNeonCredential(input, fetcher, signal);
  },
};
