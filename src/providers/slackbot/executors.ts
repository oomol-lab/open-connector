import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { SlackActionHandler } from "../slack/runtime.ts";

import { getProviderActionHandler, mapProviderActionHandlers } from "../provider-runtime.ts";
import { defineSlackProviderExecutors, slackActionHandlers, slackCredentialValidators } from "../slack/runtime.ts";
import { slackbotActions } from "./actions.ts";

const service = "slackbot";

const slackbotActionHandlers: ProviderActionHandlers<"slackbot", SlackActionHandler> = mapProviderActionHandlers(
  service,
  slackbotActions,
  (action) => {
    const handler = getProviderActionHandler(slackActionHandlers, action.name);
    if (!handler) {
      throw new Error(`Missing shared Slack handler for action: ${action.name}`);
    }
    return handler;
  },
);

export const executors: ProviderExecutors = defineSlackProviderExecutors(service, "bot", slackbotActionHandlers);

export const credentialValidators: CredentialValidators = slackCredentialValidators;
