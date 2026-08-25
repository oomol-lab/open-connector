import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { BearerProviderContext } from "../provider-runtime.ts";

import { defineBearerProviderExecutors } from "../provider-runtime.ts";
import { surveyMonkeyActionHandlers, validateSurveyMonkeyCredential } from "./runtime.ts";

const handlers = Object.fromEntries(
  Object.entries(surveyMonkeyActionHandlers).map(([name, handler]) => [
    name,
    (input: Record<string, unknown>, context: BearerProviderContext) =>
      handler(input, { ...context, apiBaseUrl: "https://api.surveymonkey.com" }),
  ]),
);

export const executors: ProviderExecutors = defineBearerProviderExecutors("survey_monkey", handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateSurveyMonkeyCredential({ apiKey: input.apiKey }, fetcher);
  },
  oauth2(input, { fetcher }) {
    return validateSurveyMonkeyCredential({ apiKey: input.accessToken }, fetcher);
  },
};
