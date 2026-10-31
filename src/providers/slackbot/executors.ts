import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";
import type { SlackActionHandler } from "../slack/runtime.ts";

import { getProviderActionHandler, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  defineSlackProviderExecutors,
  slackActionHandlers,
  slackApiBaseUrl,
  slackbotInstallationHandler,
  slackCredentialValidators,
} from "../slack/runtime.ts";
import { slackbotActions } from "./actions.ts";
import { slackBotEvents } from "./trigger-on-event.ts";

const service = "slackbot";

const slackbotActionHandlers: ProviderActionHandlers<"slackbot", SlackActionHandler> = mapProviderActionHandlers(
  service,
  slackbotActions,
  (action) => {
    if (action.name === "get_installation") return slackbotInstallationHandler;
    const handler = getProviderActionHandler(slackActionHandlers, action.name);
    if (!handler) {
      throw new Error(`Missing shared Slack handler for action: ${action.name}`);
    }
    return handler;
  },
);

export const executors: ProviderExecutors = defineSlackProviderExecutors(service, "bot", slackbotActionHandlers);

// The Trigger runner reaches the Slack Web API through this proxy, so shared Source operations need it too.
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: slackApiBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = slackCredentialValidators;

export const triggers: readonly IntegrationDefinition[] = [slackBotEvents];
