import type { ActionDefinition } from "../../core/types.ts";

import { defineProviderAction } from "../../core/provider-definition.ts";
import { slackActions } from "../slack/actions.ts";

const service = "slackbot";

export const slackbotActions: ActionDefinition[] = slackActions
  .filter((action) => action.name != "search_messages")
  .map((action) =>
    defineProviderAction(service, {
      name: action.name,
      description: action.description,
      requiredScopes: action.requiredScopes,
      inputSchema: action.inputSchema,
      outputSchema: action.outputSchema,
    }),
  );
