import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import {
  defineSlackProviderExecutors,
  slackActionHandlers,
  slackApiBaseUrl,
  slackCredentialValidators,
} from "./runtime.ts";

const service = "slack";

export const executors: ProviderExecutors = defineSlackProviderExecutors(service, "user", slackActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: slackApiBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = slackCredentialValidators;
