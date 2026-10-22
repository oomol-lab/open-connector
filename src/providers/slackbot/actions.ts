import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { slackActions } from "../slack/actions.ts";

const service = "slackbot";

const sharedActions: ActionDefinition[] = slackActions
  .filter(
    (action) =>
      action.name != "search_messages" && action.name != "search_context" && action.name != "get_current_user",
  )
  .map((action) =>
    defineProviderAction(service, {
      name: action.name,
      operationType: action.operationType,
      description: action.description,
      requiredScopes: action.requiredScopes,
      inputSchema: action.inputSchema,
      outputSchema: action.outputSchema,
    }),
  );

const getInstallation: ActionDefinition = defineProviderAction(service, {
  name: "get_installation",
  operationType: "read",
  description:
    "Get the workspace and authorizing user from stored OAuth metadata. This information is available only for OAuth connections. Returns null for API-key connections or incomplete OAuth metadata. OAuth credentials may be refreshed before execution.",
  requiredScopes: [],
  inputSchema: s.object({}),
  outputSchema: s.nullable(
    s.object(
      {
        teamId: s.nonEmptyString("The Slack workspace ID the app was installed in."),
        teamName: s.nullable(s.string({ description: "The workspace display name, when the install carried one." })),
        authedUserId: s.nonEmptyString("The Slack user ID of the person who approved the install."),
        botUserId: s.nonEmptyString("The Slack user ID of the app's bot user."),
        appId: s.nullable(s.string({ description: "The Slack app ID, when the install carried one." })),
      },
      { required: ["teamId", "teamName", "authedUserId", "botUserId", "appId"] },
    ),
  ),
});

export const slackbotActions: ActionDefinition[] = [...sharedActions, getInstallation];
