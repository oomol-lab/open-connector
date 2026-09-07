import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineBearerProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { netlifyActionHandlers, netlifyApiBaseUrl, validateNetlifyCredential } from "./runtime.ts";

const service = "netlify";

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, netlifyActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: netlifyApiBaseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    return validateNetlifyCredential(input.apiKey, fetcher);
  },
  async oauth2(input, { fetcher }) {
    return validateNetlifyCredential(input.accessToken, fetcher);
  },
};
