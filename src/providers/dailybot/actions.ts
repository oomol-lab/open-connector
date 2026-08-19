import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dailybot";
const rawObject = s.looseObject("The raw Dailybot object returned by the API.");
const emptyInput = s.actionInput({}, [], "The input payload for this action.");
const count = s.nonNegativeInteger("Total number of results available.");
const userUuid = s.nonEmptyString("The Dailybot user UUID.");
const teamId = s.nonEmptyString("The Dailybot team identifier.");
const limit = s.integer({ minimum: 1, maximum: 250, description: "Number of results to return." });
const offset = s.nonNegativeInteger("Pagination offset for the result set.");

const organization = s.looseRequiredObject("Dailybot organization.", {
  id: s.string("The Dailybot organization identifier."),
  name: s.string("The organization name."),
});
const profile = s.looseRequiredObject("Authenticated Dailybot user context.", {
  id: s.string("The authenticated user identifier."),
  email: s.email("The authenticated user email address."),
});
const user = s.looseRequiredObject("Dailybot user.", {
  uuid: s.string("The Dailybot user UUID."),
  email: s.email("The user email address."),
});
const team = s.looseRequiredObject("Dailybot team.", {
  id: s.string("The Dailybot team identifier."),
  name: s.string("The team name."),
});
const member = s.looseRequiredObject("Dailybot team member.", {
  uuid: s.string("The team member's user UUID."),
});

function output(properties: Record<string, JsonSchema>, description: string): JsonSchema {
  return s.actionOutput(properties, description);
}

export const dailybotActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_me",
    description: "Get the authenticated Dailybot user context and linked organization.",
    inputSchema: emptyInput,
    outputSchema: output({ profile }, "The authenticated user context returned by Dailybot."),
  }),
  defineProviderAction(service, {
    name: "get_organization",
    description: "Get the Dailybot organization details for the authenticated API key.",
    inputSchema: emptyInput,
    outputSchema: output({ organization }, "The organization details returned by Dailybot."),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List users in the authenticated Dailybot organization.",
    inputSchema: s.object(
      {
        is_active: s.boolean("Filter users by active status."),
        role: s.stringEnum(["admin", "member"], { description: "Filter users by role." }),
        limit,
        offset,
      },
      { optional: ["is_active", "role", "limit", "offset"], description: "The input payload for this action." },
    ),
    outputSchema: output(
      { count, users: s.array(user, { description: "The users returned by Dailybot." }) },
      "The paginated user list returned by Dailybot.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get a specific user from the authenticated Dailybot organization.",
    inputSchema: s.actionInput({ user_uuid: userUuid }, ["user_uuid"]),
    outputSchema: output({ user }, "The user details returned by Dailybot."),
  }),
  defineProviderAction(service, {
    name: "list_teams",
    description: "List teams in the authenticated Dailybot organization.",
    inputSchema: s.object({ limit, offset }, { optional: ["limit", "offset"], description: "The input payload." }),
    outputSchema: output(
      { count, teams: s.array(team, { description: "The teams returned by Dailybot." }) },
      "The paginated team list returned by Dailybot.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_team",
    description: "Get a specific team from the authenticated Dailybot organization.",
    inputSchema: s.actionInput({ team_id: teamId }, ["team_id"]),
    outputSchema: output({ team }, "The team details returned by Dailybot."),
  }),
  defineProviderAction(service, {
    name: "list_team_members",
    description: "List members of a specific Dailybot team.",
    inputSchema: s.actionInput({ team_id: teamId }, ["team_id"]),
    outputSchema: output(
      { count, members: s.array(member, { description: "The team members returned by Dailybot." }) },
      "The team member list returned by Dailybot.",
    ),
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send a chat message to a Dailybot user, team, or channel.",
    inputSchema: s.actionInput(
      {
        target_type: s.stringEnum(["user", "team", "channel"], { description: "The recipient type." }),
        target_uuid: s.nonEmptyString("The recipient UUID for the message."),
        message: s.nonEmptyString("The message text to send."),
        platform: s.stringEnum(["slack", "msteams", "discord", "google_chat"], {
          description: "The chat platform to use for delivery.",
        }),
      },
      ["target_type", "target_uuid", "message"],
    ),
    outputSchema: output({ delivery: rawObject }, "The message delivery result returned by Dailybot."),
  }),
  defineProviderAction(service, {
    name: "send_email",
    description: "Send an email notification through Dailybot.",
    inputSchema: s.actionInput(
      {
        user_uuid: userUuid,
        subject: s.nonEmptyString("The email subject line."),
        body: s.nonEmptyString("The email body, as plain text or HTML."),
      },
      ["user_uuid", "subject", "body"],
    ),
    outputSchema: output({ delivery: rawObject }, "The email delivery result returned by Dailybot."),
  }),
  defineProviderAction(service, {
    name: "open_conversation",
    description: "Open a direct Dailybot conversation with a user.",
    inputSchema: s.object(
      {
        user_uuid: userUuid,
        initial_message: s.nonEmptyString("The optional first message to send with the conversation."),
      },
      { required: ["user_uuid"], optional: ["initial_message"], description: "The input payload." },
    ),
    outputSchema: output({ conversation: rawObject }, "The direct conversation result returned by Dailybot."),
  }),
];
