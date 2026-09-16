import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  microsoftTeamsChannelMessageReadScopes,
  microsoftTeamsChannelMessageSendScopes,
  microsoftTeamsChannelScopes,
  microsoftTeamsChatMessageSendScopes,
  microsoftTeamsChatReadScopes,
  microsoftTeamsProfileScopes,
  microsoftTeamsTeamScopes,
} from "./scopes.ts";

const service = "microsoft_teams";

interface MicrosoftTeamsActionSource {
  name: string;
  description: string;
  requiredScopes: string[];
  providerPermissions: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const rawObject = s.record(true, { description: "A Microsoft Graph object." });
const teamId = s.nonEmptyString("Microsoft Teams team ID.");
const channelId = s.nonEmptyString("Microsoft Teams channel ID.");
const chatId = s.nonEmptyString("Microsoft Teams chat ID.");
const messageId = s.nonEmptyString("Microsoft Teams message ID.");
const nextLink = s.url("Opaque Microsoft Graph pagination URL returned by a previous call.");
const select = s.stringArray("Microsoft Graph fields to include in the response.", { minItems: 1 });
const user = s.looseObject(
  {
    id: s.nonEmptyString("Microsoft account ID."),
    displayName: s.string("Account display name."),
    mail: s.nullableString("Primary email address."),
    userPrincipalName: s.string("User principal name."),
  },
  { description: "Current Microsoft account profile." },
);
const team = s.looseObject(
  {
    id: s.nonEmptyString("Team ID."),
    displayName: s.nonEmptyString("Team display name."),
    description: s.nullableString("Team description."),
    webUrl: s.string("Microsoft Teams web URL."),
    isArchived: s.boolean("Whether the team is archived."),
    tenantId: s.string("Microsoft Entra tenant ID."),
  },
  { description: "Microsoft Teams team resource." },
);
const channel = s.looseObject(
  {
    id: s.nonEmptyString("Channel ID."),
    displayName: s.nonEmptyString("Channel display name."),
    description: s.nullableString("Channel description."),
    membershipType: s.string("Standard, private, or shared membership type."),
    webUrl: s.string("Microsoft Teams channel URL."),
    tenantId: s.string("Microsoft Entra tenant ID."),
  },
  { description: "Microsoft Teams channel resource." },
);
const chat = s.looseObject(
  {
    id: s.nonEmptyString("Chat ID."),
    topic: s.nullableString("Chat topic."),
    chatType: s.string("One-on-one, group, or meeting chat type."),
    webUrl: s.string("Microsoft Teams chat URL."),
    tenantId: s.string("Microsoft Entra tenant ID."),
    members: s.array(rawObject, { description: "Chat members when expanded." }),
    lastMessagePreview: rawObject,
  },
  { description: "Microsoft Teams chat resource." },
);
const itemBody = s.object(
  {
    contentType: s.stringEnum(["text", "html"], { description: "Message body content type." }),
    content: s.string("Message body content."),
  },
  { required: ["contentType", "content"], description: "Teams message body." },
);
const attachment = s.looseObject(
  {
    id: s.string("Attachment ID referenced by the message body."),
    contentType: s.nonEmptyString("Attachment MIME type or reference type."),
    contentUrl: s.nullableString("URL for a reference attachment."),
    content: s.nullableString("Serialized attachment content."),
    name: s.nullableString("Attachment name."),
    thumbnailUrl: s.nullableString("Attachment thumbnail URL."),
  },
  { description: "Teams chat message attachment." },
);
const mention = s.looseObject(
  {
    id: s.integer({ minimum: 0, description: "Mention identifier used by the body markup." }),
    mentionText: s.nonEmptyString("Text displayed for the mention."),
    mentioned: rawObject,
  },
  { description: "Teams chat message mention." },
);
const message = s.looseObject(
  {
    id: s.nonEmptyString("Message ID."),
    replyToId: s.nullableString("Parent message ID for a channel reply."),
    messageType: s.string("Message type."),
    createdDateTime: s.string("Creation timestamp."),
    lastModifiedDateTime: s.string("Last modification timestamp."),
    deletedDateTime: s.nullableString("Deletion timestamp."),
    subject: s.nullableString("Channel post subject."),
    summary: s.nullableString("Notification summary."),
    importance: s.string("Message importance."),
    locale: s.string("Message locale."),
    webUrl: s.string("Microsoft Teams message URL."),
    from: rawObject,
    body: rawObject,
    channelIdentity: rawObject,
    chatId: s.string("Chat containing the message."),
    attachments: s.array(rawObject, { description: "Message attachments." }),
    mentions: s.array(rawObject, { description: "Message mentions." }),
    reactions: s.array(rawObject, { description: "Message reactions." }),
    replies: s.array(rawObject, { description: "Channel replies expanded with the root message." }),
    repliesNextLink: s.nullableString("Next-page URL for additional expanded replies."),
  },
  { description: "Microsoft Teams chat message resource." },
);
const messageWriteFields = {
  body: itemBody,
  subject: s.string("Channel post subject."),
  summary: s.string("Notification summary."),
  importance: s.stringEnum(["normal", "high", "urgent"], { description: "Message importance." }),
  locale: s.string("Message locale."),
  attachments: s.array(attachment, { description: "Message attachments." }),
  mentions: s.array(mention, { description: "Message mentions matching body markup." }),
};

function input(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.actionInput(properties, required, "Microsoft Teams action input.");
}

function paginated(itemName: string, itemSchema: JsonSchema): JsonSchema {
  return s.object(
    {
      [itemName]: s.array(itemSchema, { description: `Microsoft Graph ${itemName} results.` }),
      nextLink: s.nullableString("Next-page URL, or null when no page remains."),
    },
    { required: [itemName, "nextLink"], description: "Paginated Microsoft Teams response." },
  );
}

const actions: MicrosoftTeamsActionSource[] = [
  action(
    "get_current_user",
    "Get the profile for the connected Microsoft work or school account.",
    microsoftTeamsProfileScopes,
    input({}),
    user,
  ),
  action(
    "list_joined_teams",
    "List teams that the connected account has joined.",
    microsoftTeamsTeamScopes,
    input({}),
    paginated("teams", team),
  ),
  action(
    "get_team",
    "Get one Microsoft team by ID.",
    microsoftTeamsTeamScopes,
    input({ teamId, select }, ["teamId"]),
    team,
  ),
  action(
    "list_team_channels",
    "List channels visible to the connected account in a team.",
    microsoftTeamsChannelScopes,
    input({ teamId, select, filter: s.string("OData filter expression."), nextLink }, ["teamId"]),
    paginated("channels", channel),
  ),
  action(
    "get_channel",
    "Get one channel in a Microsoft team.",
    microsoftTeamsChannelScopes,
    input({ teamId, channelId, select }, ["teamId", "channelId"]),
    channel,
  ),
  action(
    "list_channel_messages",
    "List channel posts with optionally expanded replies, or continue root-message or reply pagination.",
    microsoftTeamsChannelMessageReadScopes,
    input(
      {
        teamId,
        channelId,
        top: s.integer({ minimum: 1, maximum: 50, description: "Maximum root messages to return." }),
        includeReplies: s.boolean("Whether to expand replies on each root message."),
        nextLink,
      },
      ["teamId", "channelId"],
    ),
    paginated("messages", message),
  ),
  action(
    "list_chats",
    "List chats that include the connected account.",
    microsoftTeamsChatReadScopes,
    input({
      top: s.integer({ minimum: 1, maximum: 50, description: "Maximum chats to return." }),
      filter: s.string("Supported Microsoft Graph chat filter."),
      orderby: s.string("Supported Microsoft Graph chat ordering."),
      expand: s.stringEnum(["members", "lastMessagePreview", "members,lastMessagePreview"], {
        description: "Related chat data to expand.",
      }),
      nextLink,
    }),
    paginated("chats", chat),
  ),
  action(
    "list_chat_messages",
    "List messages from an existing one-on-one, group, or meeting chat.",
    microsoftTeamsChatReadScopes,
    input(
      {
        chatId,
        top: s.integer({ minimum: 1, maximum: 50, description: "Maximum messages to return." }),
        orderby: s.string("Supported Microsoft Graph message ordering."),
        filter: s.string("Supported Microsoft Graph message filter."),
        nextLink,
      },
      ["chatId"],
    ),
    paginated("messages", message),
  ),
  action(
    "send_channel_message",
    "Send a new root message to a Microsoft Teams channel.",
    microsoftTeamsChannelMessageSendScopes,
    input({ teamId, channelId, ...messageWriteFields }, ["teamId", "channelId", "body"]),
    message,
  ),
  action(
    "reply_to_channel_message",
    "Reply to an existing root message in a Microsoft Teams channel.",
    microsoftTeamsChannelMessageSendScopes,
    input({ teamId, channelId, messageId, ...messageWriteFields }, ["teamId", "channelId", "messageId", "body"]),
    message,
  ),
  action(
    "send_chat_message",
    "Send a message to an existing one-on-one, group, or meeting chat.",
    microsoftTeamsChatMessageSendScopes,
    input({ chatId, ...messageWriteFields }, ["chatId", "body"]),
    message,
  ),
];

export const microsoftTeamsActions: ActionDefinition[] = actions.map((source) => defineProviderAction(service, source));

function action(
  name: string,
  description: string,
  scopes: string[],
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): MicrosoftTeamsActionSource {
  return {
    name,
    description,
    requiredScopes: scopes,
    providerPermissions: scopes,
    inputSchema,
    outputSchema,
  };
}
