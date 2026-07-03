import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { bigDataCloudActionHandlers, validateBigDataCloudCredential } from "./runtime.ts";

const service = "big_data_cloud";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bigDataCloudActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBigDataCloudCredential(input.apiKey, fetcher, signal);
  },
};
