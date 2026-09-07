import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineBearerProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { giteeActionHandlers, giteeApiBaseUrl, parseGiteeScopes, validateGiteeCredential } from "./runtime.ts";

const service = "gitee";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: giteeApiBaseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, giteeActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateGiteeCredential(input.apiKey, fetcher, signal);
  },
  oauth2(input, { fetcher, signal }) {
    return validateGiteeCredential(input.accessToken, fetcher, signal, parseGiteeScopes(input.metadata.scope));
  },
};
