import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { docsbotAiActionHandlers, validateDocsbotAiCredential } from "./runtime.ts";

const service = "docsbot_ai";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, docsbotAiActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateDocsbotAiCredential(input.apiKey, fetcher, signal);
  },
};
