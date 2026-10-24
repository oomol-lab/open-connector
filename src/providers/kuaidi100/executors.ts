import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { kuaidi100ActionHandlers, validateKuaidi100Credential } from "./runtime.ts";

const service = "kuaidi100";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, kuaidi100ActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateKuaidi100Credential(input.apiKey, fetcher, signal);
  },
};
