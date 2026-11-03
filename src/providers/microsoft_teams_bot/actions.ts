import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "microsoft_teams_bot";

const serviceUrl = s.nonEmptyString(
  "Bot Connector service URL for the conversation, taken from the inbound activity the bot received. Falls back to the credential's default service URL.",
);
const conversationId = s.nonEmptyString(
  "Teams conversation ID, taken from an inbound activity or a created conversation.",
);
const activityId = s.nonEmptyString("ID of an existing activity in the conversation.");
const threadId = s.nonEmptyString(
  "Numeric ID of a channel thread's root message. Routes the call into that thread instead of the channel's main conversation.",
);
const text = s.nonEmptyString("Message text. Optional when attachments are given.");
const textFormat = s.stringEnum(["plain", "markdown", "xml"], {
  description: "How the text is rendered. Defaults to markdown.",
});
// Bot Framework card content types that Teams renders in bot messages; animation, audio and video cards are not.
const cardContentTypes = [
  "application/vnd.microsoft.card.adaptive",
  "application/vnd.microsoft.card.hero",
  "application/vnd.microsoft.card.thumbnail",
  "application/vnd.microsoft.card.receipt",
  "application/vnd.microsoft.card.signin",
  "application/vnd.microsoft.card.oauth",
  "application/vnd.microsoft.teams.card.o365connector",
  "application/vnd.microsoft.teams.card.list",
];
const attachments = s.array(
  s.object(
    {
      contentType: s.stringEnum(cardContentTypes, { description: "Card type." }),
      content: s.unknownObject("The card JSON as an object, such as an Adaptive Card."),
    },
    { required: ["contentType", "content"], description: "A card attached to the message." },
  ),
  {
    minItems: 1,
    maxItems: 10,
    description:
      "Cards to attach. Teams splits a message with both text and cards into separate messages and returns an ID for only one, so put the text inside the card when the card will be updated later.",
  },
);
const attachmentLayout = s.stringEnum(["list", "carousel"], {
  description: "How several cards are shown. Defaults to list.",
});
const resourceResponse = s.looseObject(
  { id: s.string("ID of the activity the Bot Connector created or changed.") },
  { description: "Bot Connector resource response." },
);
const channelAccount = s.object(
  {
    id: s.string("Channel-specific account ID."),
    name: s.string("Account display name."),
    aadObjectId: s.string("Microsoft Entra object ID."),
    email: s.string("Email address."),
    userPrincipalName: s.string("User principal name."),
    givenName: s.string("Given name."),
    surname: s.string("Surname."),
    tenantId: s.string("Microsoft Entra tenant ID."),
  },
  {
    additionalProperties: true,
    description: "Teams conversation member.",
    optional: ["name", "aadObjectId", "email", "userPrincipalName", "givenName", "surname", "tenantId"],
  },
);

const actions: Parameters<typeof defineProviderAction>[1][] = [
  {
    name: "send_message",
    operationType: "write",
    description:
      "Send a new message from the bot into an existing Teams conversation, with text, cards such as an Adaptive Card, or both.",
    inputSchema: s.actionInput(
      {
        serviceUrl: s.optional(serviceUrl),
        conversationId,
        threadId: s.optional(threadId),
        text: s.optional(text),
        textFormat: s.optional(textFormat),
        attachments: s.optional(attachments),
        attachmentLayout: s.optional(attachmentLayout),
      },
      ["conversationId"],
    ),
    outputSchema: resourceResponse,
  },
  {
    name: "reply_to_message",
    operationType: "write",
    description:
      "Reply to an existing activity in a Teams conversation, with text, cards such as an Adaptive Card, or both.",
    inputSchema: s.actionInput(
      {
        serviceUrl: s.optional(serviceUrl),
        conversationId,
        threadId: s.optional(threadId),
        activityId,
        text: s.optional(text),
        textFormat: s.optional(textFormat),
        attachments: s.optional(attachments),
        attachmentLayout: s.optional(attachmentLayout),
      },
      ["conversationId", "activityId"],
    ),
    outputSchema: resourceResponse,
  },
  {
    name: "update_message",
    operationType: "write",
    description:
      "Replace a message the bot previously sent. The new text and cards replace the old message entirely, so leaving out attachments removes its cards, for example to swap a card with buttons for one without.",
    inputSchema: s.actionInput(
      {
        serviceUrl: s.optional(serviceUrl),
        conversationId,
        threadId: s.optional(threadId),
        activityId,
        text: s.optional(text),
        textFormat: s.optional(textFormat),
        attachments: s.optional(attachments),
        attachmentLayout: s.optional(attachmentLayout),
      },
      ["conversationId", "activityId"],
    ),
    outputSchema: resourceResponse,
  },
  {
    name: "delete_message",
    operationType: "destructive",
    description: "Delete a message the bot previously sent.",
    inputSchema: s.actionInput(
      { serviceUrl: s.optional(serviceUrl), conversationId, threadId: s.optional(threadId), activityId },
      ["conversationId", "activityId"],
    ),
    outputSchema: s.actionOutput({ deleted: s.boolean("Whether the Bot Connector accepted the deletion.") }),
  },
  {
    name: "create_conversation",
    operationType: "write",
    description:
      "Start a proactive one-on-one conversation with a user, or a new thread in a team's general channel, and optionally post a first message.",
    inputSchema: s.actionInput(
      {
        serviceUrl: s.optional(serviceUrl),
        memberId: s.optional(
          s.nonEmptyString(
            "Teams user ID (for example 29:...) to start a one-on-one conversation with; email and UPN are not supported. Omit when targeting a team.",
          ),
        ),
        teamId: s.optional(
          s.nonEmptyString(
            "Teams team ID to start a new thread in the team's general channel. Requires text. Omit for a one-on-one chat.",
          ),
        ),
        tenantId: s.optional(
          s.nonEmptyString("Tenant of the target user or team. Defaults to the credential's tenant."),
        ),
        text: s.optional(
          s.nonEmptyString(
            "Initial message text. Required when teamId is provided; optional for a one-on-one conversation.",
          ),
        ),
        textFormat: s.optional(textFormat),
      },
      [],
    ),
    outputSchema: s.object(
      {
        id: s.string("ID of the created conversation."),
        activityId: s.string("ID of the first message, when text was sent."),
        serviceUrl: s.string("Service URL to use for follow-up actions in this conversation."),
      },
      {
        additionalProperties: true,
        description: "Created conversation reference.",
        optional: ["activityId", "serviceUrl"],
      },
    ),
  },
  {
    name: "list_conversation_members",
    operationType: "read",
    description: "List one page of the members of a Teams conversation.",
    inputSchema: s.actionInput(
      {
        serviceUrl: s.optional(serviceUrl),
        conversationId,
        pageSize: s.optional(
          s.integer("Members per page, from 50 to 500. Teams defaults to 200.", { minimum: 50, maximum: 500 }),
        ),
        continuationToken: s.optional(s.nonEmptyString("Token from a previous page's continuationToken.")),
      },
      ["conversationId"],
    ),
    outputSchema: s.actionOutput(
      {
        members: s.array(channelAccount, { description: "Members in this page." }),
        continuationToken: s.optional(s.string("Token for the next page. Absent on the last page.")),
      },
      "Page of conversation members.",
      ["members"],
    ),
  },
  {
    name: "list_team_channels",
    operationType: "read",
    description:
      "List the channels of a team the bot is installed in. The Bot Connector cannot list the teams a bot is in: learn a team's ID from channelData.team.id on its activities, such as the conversationUpdate Teams sends when the bot is added to the team.",
    inputSchema: s.actionInput(
      {
        serviceUrl: s.optional(serviceUrl),
        teamId: s.nonEmptyString("Teams team ID, taken from channelData.team.id on an activity from the team."),
      },
      ["teamId"],
    ),
    outputSchema: s.actionOutput(
      {
        channels: s.array(
          s.object(
            {
              id: s.string("Channel ID, usable as conversationId. The General channel's ID equals the team ID."),
              name: s.string("Channel name. Teams returns no name for the General channel, so it is named General."),
            },
            { description: "A channel of the team." },
          ),
          { description: "Channels of the team." },
        ),
      },
      "Channels of a Teams team.",
      ["channels"],
    ),
  },
];

export const microsoftTeamsBotActions: ActionDefinition[] = actions.map((action) =>
  defineProviderAction(service, action),
);
