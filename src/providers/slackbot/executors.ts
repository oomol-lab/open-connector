import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { SlackActionHandler } from "../slack/runtime.ts";

import { getProviderActionHandler, mapProviderActionHandlers } from "../provider-runtime.ts";
import {
  defineSlackProviderExecutors,
  slackActionHandlers,
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

export const credentialValidators: CredentialValidators = slackCredentialValidators;

export const triggers: readonly IntegrationDefinition[] = [slackBotEvents];
