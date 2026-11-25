import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderOAuthRuntime } from "../../oauth/oauth-token.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { PollDefinition } from "../../triggers/common/poll.ts";

import { defineProviderProxy } from "../provider-proxy.ts";
import { revokeAccessToken } from "./revocation.ts";
import {
  defineSlackProviderExecutors,
  slackActionHandlers,
  slackApiBaseUrl,
  slackCredentialValidators,
} from "./runtime.ts";
import { slackMessagePosted } from "./trigger-on-message-posted.ts";

const service = "slack";

export const executors: ProviderExecutors = defineSlackProviderExecutors(service, "user", slackActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: slackApiBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = slackCredentialValidators;

export const triggers: readonly (IntegrationDefinition | PollDefinition)[] = [slackMessagePosted];

export const oauth: ProviderOAuthRuntime = { revokeAccessToken };
