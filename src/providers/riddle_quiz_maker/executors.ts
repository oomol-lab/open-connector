import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { riddleQuizMakerActionHandlers, validateRiddleQuizMakerCredential } from "./runtime.ts";
const service = "riddle_quiz_maker";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, riddleQuizMakerActionHandlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://www.riddle.com/creator/api/v3/",
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateRiddleQuizMakerCredential(input.apiKey, fetcher, signal);
  },
};
