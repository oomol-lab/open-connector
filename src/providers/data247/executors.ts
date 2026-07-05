import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { data247ActionHandlers, validateData247Credential } from "./runtime.ts";

const service = "data247";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, data247ActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateData247Credential(input.apiKey, fetcher, signal);
  },
};
