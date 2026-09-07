import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateWebinarjamCredential, webinarjamActionHandlers, webinarjamApiBaseUrl } from "./runtime.ts";

const service = "webinarjam";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, webinarjamActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: webinarjamApiBaseUrl,
  auth: { type: "api_key_query_or_form_body", name: "api_key", bodyMethods: ["POST"] },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): ReturnType<typeof validateWebinarjamCredential> {
    return validateWebinarjamCredential({ apiKey: input.apiKey, fetcher, signal });
  },
};
