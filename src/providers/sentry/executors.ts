import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";

import { defineOAuthProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { sentryActionHandlers, sentryApiBaseUrl, validateSentryCredential } from "./runtime.ts";
import { sentryIssueAlert } from "./trigger-on-issue-alert.ts";

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

export const triggers: readonly IntegrationDefinition[] = [sentryIssueAlert];
