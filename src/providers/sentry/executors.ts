import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineOAuthProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { sentryActionHandlers, sentryApiBaseUrl, validateSentryCredential } from "./runtime.ts";

const service = "sentry";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, sentryActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: sentryApiBaseUrl,
  auth: { type: "oauth_bearer" },
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    return validateSentryCredential(input.accessToken, fetcher);
  },
};
