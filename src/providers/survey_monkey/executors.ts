import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { BearerProviderContext } from "../provider-runtime.ts";

import { defineBearerProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  normalizeSurveyMonkeyApiBaseUrl,
  surveyMonkeyActionHandlers,
  validateSurveyMonkeyCredential,
} from "./runtime.ts";

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

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "survey_monkey",
  async baseUrl(context) {
    const credential = await context.getCredential("survey_monkey");
    const metadata = credential && "metadata" in credential ? credential.metadata : undefined;
    return normalizeSurveyMonkeyApiBaseUrl(metadata?.apiBaseUrl ?? "https://api.surveymonkey.com");
  },
  auth: { type: "bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateSurveyMonkeyCredential({ apiKey: input.apiKey }, fetcher);
  },
  oauth2(input, { fetcher }) {
    return validateSurveyMonkeyCredential({ apiKey: input.accessToken }, fetcher);
  },
};
