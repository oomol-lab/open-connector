import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineOAuthProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { zeplinActionHandlers, zeplinApiBaseUrl, validateZeplinCredential } from "./runtime.ts";

const service = "zeplin";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, zeplinActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: zeplinApiBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  oauth2(input, { fetcher, signal }) {
    return validateZeplinCredential(input.accessToken, fetcher, signal);
  },
};
