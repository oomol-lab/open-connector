import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { slackConversationTypes, slackNormalizedConversationTypes } from "./constants.ts";

const service = "slack";

const nonEmptyString = (description: string): JsonSchema => s.nonEmptyString(description);
const channelIdSchema = nonEmptyString("The Slack conversation or channel ID.");
const messageTsSchema = nonEmptyString("The Slack message timestamp, for example '1711.0001'.");
const userIdSchema = nonEmptyString("The Slack user ID.");
const fileIdSchema = nonEmptyString("The Slack file ID.");

const conversationTypeSchema = s.stringEnum([...slackConversationTypes], {
  description: "A Slack conversation type.",
});

const slackBlockSchema = s.unknownObject(
  "A Slack Block Kit block object. Pass the block exactly as Slack documents it.",
);
const slackAttachmentSchema = s.unknownObject(
  "A Slack legacy attachment object. Prefer blocks for new messages when possible.",
);

const messageContentProperties = {
  text: s.string({
    description:
      "Plain text message content. When blocks are provided, Slack uses this as notification and accessibility fallback text.",
  }),
  blocks: s.array(slackBlockSchema, {
    minItems: 1,
    description: "Slack Block Kit blocks to render in the message.",
  }),
  attachments: s.array(slackAttachmentSchema, {
    minItems: 1,
    description: "Slack legacy attachments to include in the message.",
  }),
  unfurlLinks: s.boolean({ description: "Whether Slack should unfurl links in the message." }),
  unfurlMedia: s.boolean({ description: "Whether Slack should unfurl media in the message." }),
  metadata: s.unknownObject("Slack message metadata to attach to the message."),
};

const slackMessageSchema = s.looseObject(
  {
    ts: s.string({ description: "The message timestamp identifier." }),
    userId: s.string({ description: "The user ID of the message author." }),
    text: s.string({ description: "The text content of the message." }),
  },
  { description: "A Slack message record." },
);

const conversationSchema = s.object(
  {
    channelId: s.string({ description: "The unique identifier of the conversation." }),
    name: s.nullable(s.string({ description: "The name of the conversation when available." })),
    type: s.stringEnum([...slackNormalizedConversationTypes], {
      description: "The normalized Slack conversation type.",
    }),
    isArchived: s.nullable(s.boolean({ description: "Whether the conversation is archived." })),
    isPrivate: s.nullable(s.boolean({ description: "Whether the conversation is private." })),
    isMember: s.nullable(s.boolean({ description: "Whether the bot user is a member." })),
    memberCount: s.integer({ description: "The member count when Slack provides it." }),
    topic: s.nullable(s.string({ description: "The conversation topic." })),
    purpose: s.nullable(s.string({ description: "The conversation purpose." })),
    userId: s.string({ description: "The linked user identifier for IM conversations." }),
    locale: s.string({ description: "The locale returned by Slack when requested." }),
  },
  {
    required: ["channelId", "name", "type", "isArchived", "isPrivate", "isMember", "topic", "purpose"],
    description: "A normalized Slack conversation record.",
  },
);

const userSchema = s.object(
  {
    userId: s.string({ description: "The unique identifier of the user." }),
    username: s.nullable(s.string({ description: "The username of the user." })),
    realName: s.nullable(s.string({ description: "The real name of the user." })),
    displayName: s.nullable(s.string({ description: "The display name of the user." })),
    isBot: s.nullable(s.boolean({ description: "Whether the user is a bot user." })),
    isDeleted: s.nullable(s.boolean({ description: "Whether the user is deleted." })),
    isAdmin: s.nullable(s.boolean({ description: "Whether the user is an admin." })),
    isOwner: s.nullable(s.boolean({ description: "Whether the user is an owner." })),
    locale: s.string({ description: "The locale returned by Slack when requested." }),
  },
  {
    required: ["userId", "username", "realName", "displayName", "isBot", "isDeleted", "isAdmin", "isOwner"],
    description: "A normalized Slack user record.",
  },
);

const channelSummarySchema = s.object(
  {
    channelId: s.string({ description: "The unique identifier of the channel." }),
    name: s.string({ description: "The name of the channel." }),
  },
  { required: ["channelId", "name"], description: "A Slack channel summary." },
);

const postedMessageOutputSchema = s.object(
  {
    ts: s.string({ description: "The timestamp identifier of the posted message." }),
    channelId: s.string({ description: "The channel ID where the message was posted." }),
  },
  { required: ["ts", "channelId"], description: "The output payload for a posted Slack message." },
);

const messageReferenceOutputSchema = s.object(
  {
    channelId: s.string({ description: "The conversation identifier containing the message." }),
    messageTs: s.string({ description: "The timestamp identifier of the message." }),
  },
  { required: ["channelId", "messageTs"], description: "The output payload for a Slack message reference." },
);

const fileSchema = s.looseObject(
  {
    fileId: s.string({ description: "The Slack file ID." }),
    name: s.string({ description: "The file name." }),
    title: s.string({ description: "The file title." }),
    mimetype: s.string({ description: "The file MIME type." }),
    urlPrivate: s.string({ description: "The private Slack URL for the file when returned." }),
  },
  { description: "A Slack file object returned by the Web API." },
);

const reactionItemSchema = s.unknownObject("A Slack item with reactions.");

export const slackActions: ActionDefinition[] = [
  action({
    name: "list_channels",
    description: "List Slack public channels visible to the bot.",
    requiredScopes: ["channels:read"],
    inputSchema: s.object(
      {
        limit: s.integer({ minimum: 1, maximum: 100, description: "The maximum number of channels to return." }),
      },
      { description: "Input parameters for listing Slack channels." },
    ),
    outputSchema: s.object(
      { channels: s.array(channelSummarySchema, { description: "The list of Slack channels." }) },
      { required: ["channels"], description: "The output payload for this action." },
    ),
  }),
  action({
    name: "get_channel_messages",
    description: "Get recent messages from a Slack conversation.",
    requiredScopes: ["channels:history", "groups:history", "im:history", "mpim:history"],
    inputSchema: s.object(
      {
        channelId: channelIdSchema,
        limit: s.integer({ minimum: 1, maximum: 100, description: "The maximum number of messages to return." }),
      },
      { required: ["channelId"], description: "Input parameters for reading Slack conversation history." },
    ),
    outputSchema: s.object(
      {
        messages: s.array(slackMessageSchema, { description: "The list of messages in the conversation." }),
        hasMore: s.boolean({ description: "Whether more messages are available beyond this page." }),
      },
      { required: ["messages", "hasMore"], description: "The output payload for this action." },
    ),
  }),
  action({
    name: "post_message",
    description:
      "Post a Slack message. Use text for plain messages, or blocks for rich Block Kit layouts with text as fallback.",
    requiredScopes: ["chat:write"],
    inputSchema: messageInputSchema("Input parameters for posting a Slack message."),
    outputSchema: postedMessageOutputSchema,
  }),
  action({
    name: "reply_message",
    description: "Reply to a Slack thread. Use text, blocks, or attachments for the reply content.",
    requiredScopes: ["chat:write"],
    inputSchema: messageInputSchema(
      "Input parameters for replying to a Slack thread.",
      {
        threadTs: nonEmptyString("The timestamp of the parent message to reply to."),
        replyBroadcast: s.boolean({ description: "Whether Slack should also broadcast the reply to the channel." }),
      },
      ["threadTs"],
    ),
    outputSchema: postedMessageOutputSchema,
  }),
  action({
    name: "get_thread",
    description: "Get messages in a Slack thread.",
    requiredScopes: ["channels:history", "groups:history", "im:history", "mpim:history"],
    inputSchema: s.object(
      {
        channelId: channelIdSchema,
        threadTs: nonEmptyString("The timestamp of the parent message."),
      },
      { required: ["channelId", "threadTs"], description: "Input parameters for reading a Slack thread." },
    ),
    outputSchema: s.object(
      {
        messages: s.array(slackMessageSchema, { description: "The list of messages in the thread." }),
        hasMore: s.boolean({ description: "Whether more messages are available beyond this page." }),
      },
      { required: ["messages", "hasMore"], description: "The output payload for this action." },
    ),
  }),
  action({
    name: "list_conversations",
    description: "List Slack conversations visible to the bot.",
    requiredScopes: ["channels:read", "groups:read", "im:read", "mpim:read"],
    inputSchema: s.object(
      {
        limit: s.integer({ minimum: 1, maximum: 200, description: "The maximum number of conversations to return." }),
        cursor: s.string({ description: "The Slack pagination cursor." }),
        types: s.array(conversationTypeSchema, { minItems: 1, description: "Conversation types to include." }),
        excludeArchived: s.boolean({ description: "Whether archived conversations should be excluded." }),
      },
      { description: "Input parameters for listing Slack conversations." },
    ),
    outputSchema: s.object(
      {
        conversations: s.array(conversationSchema, { description: "The list of Slack conversations." }),
        nextCursor: s.nullable(s.string({ description: "The cursor for the next page." })),
      },
      { required: ["conversations", "nextCursor"], description: "The output payload for this action." },
    ),
  }),
  action({
    name: "get_conversation",
    description: "Get metadata for a Slack conversation.",
    requiredScopes: ["channels:read", "groups:read", "im:read", "mpim:read"],
    inputSchema: s.object(
      {
        channelId: channelIdSchema,
        includeLocale: s.boolean({ description: "Whether Slack should include the locale field." }),
        includeNumMembers: s.boolean({ description: "Whether Slack should include the member count field." }),
      },
      { required: ["channelId"], description: "Input parameters for fetching a Slack conversation." },
    ),
    outputSchema: s.object(
      { conversation: conversationSchema },
      { required: ["conversation"], description: "The output payload for this action." },
    ),
  }),
  action({
    name: "open_conversation",
    description: "Open or resume a direct message with one Slack user.",
    requiredScopes: ["im:write"],
    inputSchema: s.object(
      {
        userIds: s.array(userIdSchema, {
          minItems: 1,
          maxItems: 1,
          description: "The single Slack user to include in the DM.",
        }),
        preventCreation: s.boolean({ description: "Whether Slack should avoid creating a new conversation." }),
      },
      { required: ["userIds"], description: "Input parameters for opening a Slack DM." },
    ),
    outputSchema: s.object(
      {
        channelId: s.string({ description: "The opened Slack conversation ID." }),
        conversation: conversationSchema,
      },
      { required: ["channelId", "conversation"], description: "The output payload for this action." },
    ),
  }),
  action({
    name: "list_users",
    description: "List Slack users visible to the bot.",
    requiredScopes: ["users:read"],
    inputSchema: s.object(
      {
        limit: s.integer({ minimum: 1, maximum: 200, description: "The maximum number of users to return." }),
        cursor: s.string({ description: "The Slack pagination cursor." }),
        includeLocale: s.boolean({ description: "Whether Slack should include the locale field." }),
      },
      { description: "Input parameters for listing Slack users." },
    ),
    outputSchema: s.object(
      {
        users: s.array(userSchema, { description: "The list of Slack users." }),
        nextCursor: s.nullable(s.string({ description: "The cursor for the next page." })),
      },
      { required: ["users", "nextCursor"], description: "The output payload for this action." },
    ),
  }),
  action({
    name: "get_user",
    description: "Get metadata for a Slack user.",
    requiredScopes: ["users:read"],
    inputSchema: s.object(
      {
        userId: userIdSchema,
        includeLocale: s.boolean({ description: "Whether Slack should include the locale field." }),
      },
      { required: ["userId"], description: "Input parameters for fetching a Slack user." },
    ),
    outputSchema: s.object(
      { user: userSchema },
      { required: ["user"], description: "The output payload for this action." },
    ),
  }),
  action({
    name: "post_ephemeral_message",
    description: "Post an ephemeral Slack message visible only to one user in a conversation.",
    requiredScopes: ["chat:write"],
    inputSchema: messageInputSchema(
      "Input parameters for posting an ephemeral Slack message.",
      { userId: s.string({ description: "The user who should receive the ephemeral message." }) },
      ["userId"],
    ),
    outputSchema: s.object(
      {
        channelId: s.string({ description: "The conversation identifier where the message was sent." }),
        messageTs: s.string({ description: "The timestamp identifier of the ephemeral message." }),
      },
      { required: ["channelId", "messageTs"], description: "The output payload for this action." },
    ),
  }),
  action({
    name: "get_message_permalink",
    description: "Get a permalink for a Slack message.",
    requiredScopes: ["channels:history", "groups:history", "im:history", "mpim:history"],
    inputSchema: s.object(
      {
        channelId: channelIdSchema,
        messageTs: messageTsSchema,
      },
      { required: ["channelId", "messageTs"], description: "Input parameters for fetching a Slack message permalink." },
    ),
    outputSchema: s.object(
      {
        channelId: s.string({ description: "The conversation identifier containing the target message." }),
        messageTs: s.string({ description: "The timestamp identifier of the target message." }),
        permalink: s.string({ description: "The permalink URL returned by Slack." }),
      },
      { required: ["channelId", "messageTs", "permalink"], description: "The output payload for this action." },
    ),
  }),
  action({
    name: "update_message",
    description:
      "Update a Slack message posted by the bot. Provide text, blocks, or attachments as the new message content.",
    requiredScopes: ["chat:write"],
    inputSchema: messageInputSchema("Input parameters for updating a Slack message.", { messageTs: messageTsSchema }, [
      "messageTs",
    ]),
    outputSchema: messageReferenceOutputSchema,
  }),
  action({
    name: "delete_message",
    description: "Delete a Slack message posted by the bot.",
    requiredScopes: ["chat:write"],
    inputSchema: s.object(
      {
        channelId: channelIdSchema,
        messageTs: messageTsSchema,
      },
      { required: ["channelId", "messageTs"], description: "Input parameters for deleting a Slack message." },
    ),
    outputSchema: messageReferenceOutputSchema,
  }),
  action({
    name: "schedule_message",
    description: "Schedule a Slack message to be posted later. Use text or blocks for the scheduled content.",
    requiredScopes: ["chat:write"],
    inputSchema: messageInputSchema(
      "Input parameters for scheduling a Slack message.",
      { postAt: s.integer({ description: "The Unix timestamp when Slack should post the message." }) },
      ["postAt"],
    ),
    outputSchema: s.object(
      {
        channelId: s.string({ description: "The conversation identifier where the message will be posted." }),
        scheduledMessageId: s.string({ description: "The scheduled message identifier returned by Slack." }),
        postAt: s.integer({ description: "The Unix timestamp when Slack will post the message." }),
      },
      { required: ["channelId", "scheduledMessageId", "postAt"], description: "The output payload for this action." },
    ),
  }),
  action({
    name: "add_reaction",
    description: "Add an emoji reaction to a Slack message.",
    requiredScopes: ["reactions:write"],
    inputSchema: reactionInputSchema("Input parameters for adding a Slack reaction."),
    outputSchema: successOutputSchema("Whether Slack accepted the reaction request."),
  }),
  action({
    name: "remove_reaction",
    description: "Remove an emoji reaction from a Slack message.",
    requiredScopes: ["reactions:write"],
    inputSchema: reactionInputSchema("Input parameters for removing a Slack reaction."),
    outputSchema: successOutputSchema("Whether Slack accepted the reaction removal request."),
  }),
  action({
    name: "get_reactions",
    description: "Get reactions for a Slack message.",
    requiredScopes: ["reactions:read"],
    inputSchema: s.object(
      {
        channelId: channelIdSchema,
        messageTs: messageTsSchema,
        full: s.boolean({ description: "Whether Slack should return the complete reaction user lists." }),
      },
      { required: ["channelId", "messageTs"], description: "Input parameters for reading Slack reactions." },
    ),
    outputSchema: s.object(
      { item: reactionItemSchema },
      { required: ["item"], description: "The output payload for this action." },
    ),
  }),
  action({
    name: "upload_file",
    description:
      "Upload a file to Slack using the current external upload flow. Provide fileUrl; binary content is fetched by the connector runtime.",
    requiredScopes: ["files:write"],
    inputSchema: s.object(
      {
        filename: nonEmptyString("The file name Slack should display."),
        fileUrl: s.url("A URL whose response body should be uploaded to Slack."),
        title: s.string({ description: "Optional file title shown in Slack." }),
        channelId: channelIdSchema,
        initialComment: s.string({ description: "Optional message text to post with the file." }),
        threadTs: messageTsSchema,
        mimeType: nonEmptyString("The content type to send while uploading the file."),
        altText: s.string({ description: "Alternative text for the uploaded file when Slack supports it." }),
        snippetType: s.string({ description: "Slack snippet type for text snippets." }),
      },
      { required: ["filename", "fileUrl"], description: "Input parameters for uploading a Slack file." },
    ),
    outputSchema: s.object(
      {
        fileId: s.string({ description: "The uploaded Slack file ID." }),
        files: s.array(fileSchema, { description: "Files returned by Slack after completing the upload." }),
      },
      { required: ["fileId", "files"], description: "The output payload for this action." },
    ),
  }),
  action({
    name: "list_files",
    description: "List Slack files visible to the bot, optionally filtered by channel or user.",
    requiredScopes: ["files:read"],
    inputSchema: s.object(
      {
        channelId: channelIdSchema,
        userId: userIdSchema,
        types: s.string({ description: "Comma-separated Slack file type filters, for example 'images,pdfs'." }),
        page: s.integer({ minimum: 1, description: "The page number to fetch." }),
        count: s.integer({ minimum: 1, maximum: 1000, description: "The number of files to return." }),
      },
      { description: "Input parameters for listing Slack files." },
    ),
    outputSchema: s.object(
      {
        files: s.array(fileSchema, { description: "The Slack files returned by Slack." }),
        paging: s.unknownObject("Slack paging metadata when returned."),
      },
      { required: ["files", "paging"], description: "The output payload for this action." },
    ),
  }),
  action({
    name: "get_file",
    description: "Get metadata for a Slack file.",
    requiredScopes: ["files:read"],
    inputSchema: s.object(
      { fileId: fileIdSchema },
      { required: ["fileId"], description: "Input parameters for fetching a Slack file." },
    ),
    outputSchema: s.object(
      { file: fileSchema },
      { required: ["file"], description: "The output payload for this action." },
    ),
  }),
  action({
    name: "delete_file",
    description: "Delete a Slack file.",
    requiredScopes: ["files:write"],
    inputSchema: s.object(
      { fileId: fileIdSchema },
      { required: ["fileId"], description: "Input parameters for deleting a Slack file." },
    ),
    outputSchema: s.object(
      {
        success: s.boolean({ description: "Whether Slack accepted the file delete request." }),
        fileId: s.string({ description: "The Slack file ID that was deleted." }),
      },
      { required: ["success", "fileId"], description: "The output payload for this action." },
    ),
  }),
];

function action(input: Omit<Parameters<typeof defineProviderAction>[1], "providerPermissions">): ActionDefinition {
  return defineProviderAction(service, input);
}

function messageInputSchema(
  description: string,
  extraProperties: Record<string, JsonSchema> = {},
  extraRequired: string[] = [],
): JsonSchema {
  const properties = {
    channelId: channelIdSchema,
    ...messageContentProperties,
    ...extraProperties,
  };
  return {
    ...s.object(properties, {
      required: ["channelId", ...extraRequired],
      description,
    }),
    anyOf: [{ required: ["text"] }, { required: ["blocks"] }, { required: ["attachments"] }],
  };
}

function reactionInputSchema(description: string): JsonSchema {
  return s.object(
    {
      channelId: channelIdSchema,
      messageTs: messageTsSchema,
      name: nonEmptyString("The emoji reaction name without surrounding colons."),
    },
    { required: ["channelId", "messageTs", "name"], description },
  );
}

function successOutputSchema(description: string): JsonSchema {
  return s.object(
    { success: s.boolean({ description }) },
    { required: ["success"], description: "The output payload for this action." },
  );
}
