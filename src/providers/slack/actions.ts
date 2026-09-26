import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { slackConversationTypes, slackNormalizedConversationTypes } from "./constants.ts";

const service = "slack";

const channelIdSchema = s.nonEmptyString("The Slack conversation or channel ID.");
const messageTsSchema = s.nonEmptyString("The Slack message timestamp, for example '1711.0001'.");
const userIdSchema = s.nonEmptyString("The Slack user ID.");
const fileIdSchema = s.nonEmptyString("The Slack file ID.");
const searchSortSchema = s.stringEnum(["score", "timestamp"], {
  description: "How Slack should sort search results.",
});
const sortDirectionSchema = s.stringEnum(["asc", "desc"], {
  description: "The sort direction for Slack search results.",
});
const conversationTypeSchema = s.stringEnum([...slackConversationTypes], {
  description: "A Slack conversation type.",
});

// `conversations.history` and `conversations.replies` take the same time
// window, so it is declared once. The bounds are Slack `ts` strings
// ("<epoch seconds>.<6 digits>"), NOT epoch integers: Slack compares them
// against the message `ts` lexically-as-decimal, and a bare integer is a
// legal value for that same field. Left as `string` rather than a pattern
// so a caller can pass a `ts` it read back from a message verbatim.
const historyWindowProperties = {
  oldest: s.string({
    description:
      "Only return messages after this Slack timestamp, for example '1700000000.123456'. The message at exactly this timestamp is included only when inclusive is true.",
  }),
  latest: s.string({
    description:
      "Only return messages before this Slack timestamp. Defaults to now. The message at exactly this timestamp is included only when inclusive is true.",
  }),
  inclusive: s.boolean({
    description:
      "Include messages whose timestamp equals oldest or latest. Slack ignores this unless one of those bounds is set.",
  }),
};

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

const slackReactionSchema = s.looseObject(
  {
    name: s.string({ description: "The emoji name of the reaction." }),
    count: s.integer({ description: "How many users added this reaction." }),
    userIds: s.array(s.string({ description: "A Slack user ID." }), {
      description: "The users who added this reaction, as far as Slack reports them.",
    }),
  },
  { description: "A reaction summary on a Slack message." },
);

// Only fields the executor actually normalizes are declared. The object is
// loose, but that permits extras it does NOT make them appear: the executor
// builds each row explicitly, so an undeclared Slack field is simply not
// emitted. Deliberately absent: `blocks`, `attachments` and `files`. Those
// are unbounded nested payloads on a row shape that ETL reads in bulk, and
// each wants its own normalized contract rather than a raw passthrough.
const slackMessageSchema = s.looseObject(
  {
    ts: s.string({ description: "The message timestamp identifier." }),
    type: s.string({ description: "The Slack message type, normally 'message'." }),
    subtype: s.string({
      description: "The Slack message subtype ('channel_join', 'bot_message', …) when the message has one.",
    }),
    userId: s.string({ description: "The user ID of the message author." }),
    botId: s.string({ description: "The bot ID of the message author when a bot posted it." }),
    appId: s.string({ description: "The Slack app ID that posted the message when an app posted it." }),
    username: s.string({ description: "The display username Slack attached to a bot or app message." }),
    teamId: s.string({ description: "The Slack team ID the message belongs to." }),
    clientMsgId: s.string({ description: "The client-generated message identifier when Slack returns one." }),
    text: s.string({ description: "The text content of the message." }),
    editedTs: s.string({ description: "The timestamp of the most recent edit, when the message was edited." }),
    threadTs: s.string({
      description:
        "The timestamp of the thread parent. Equal to ts on a thread parent, and absent on a message that is not in a thread.",
    }),
    parentUserId: s.string({ description: "The author of the thread parent, on a threaded reply." }),
    replyCount: s.integer({ description: "The number of replies to this thread parent." }),
    replyUsersCount: s.integer({ description: "The number of distinct users who replied to this thread parent." }),
    latestReply: s.string({ description: "The timestamp of the most recent reply to this thread parent." }),
    isLocked: s.boolean({ description: "Whether the thread is locked." }),
    reactions: s.array(slackReactionSchema, { description: "Reaction summaries attached to the message." }),
  },
  { description: "A Slack message record." },
);

const searchMessageMatchSchema = s.looseObject(
  {
    matchId: s.string({ description: "Slack's search result item identifier." }),
    channelId: s.string({ description: "The conversation identifier containing the message." }),
    channelName: s.nullable(s.string({ description: "The conversation name when Slack returns one." })),
    ts: s.string({ description: "The message timestamp identifier." }),
    userId: s.string({ description: "The user ID of the message author." }),
    username: s.string({ description: "The username of the message author when Slack returns one." }),
    text: s.string({ description: "The matching message text." }),
    permalink: s.string({ description: "A Slack permalink for the matching message." }),
    teamId: s.string({ description: "The Slack team ID returned for the match." }),
    type: s.string({ description: "The Slack result type." }),
  },
  { description: "A normalized Slack message search match." },
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
    isMember: s.nullable(s.boolean({ description: "Whether the connected Slack identity is a member." })),
    memberCount: s.integer({ description: "The member count when Slack provides it." }),
    topic: s.nullable(s.string({ description: "The conversation topic." })),
    purpose: s.nullable(s.string({ description: "The conversation purpose." })),
    userId: s.string({ description: "The linked user identifier for IM conversations." }),
    locale: s.string({ description: "The locale returned by Slack when requested." }),
    created: s.integer({ description: "Creation time as a Unix timestamp when Slack provides it." }),
    updated: s.integer({ description: "Last update time in epoch milliseconds when Slack provides it." }),
    creatorId: s.string({ description: "The user who created the conversation when Slack provides it." }),
    isShared: s.boolean({ description: "Whether the conversation is shared with another workspace." }),
    isExtShared: s.boolean({ description: "Whether the conversation is shared with an external organization." }),
    isOrgShared: s.boolean({ description: "Whether the conversation is shared across the organization." }),
    contextTeamId: s.string({ description: "The team ID the conversation is read in when Slack provides it." }),
    lastRead: s.string({ description: "The last-read message timestamp when Slack provides it." }),
    unreadCount: s.integer({ description: "The unread message count when Slack provides it." }),
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
    email: s.string({ description: "The profile email when the token may read it." }),
    tz: s.string({ description: "The user's time zone identifier when Slack provides it." }),
    tzOffset: s.integer({ description: "The user's UTC offset in seconds when Slack provides it." }),
    updated: s.integer({ description: "Last profile update as a Unix timestamp when Slack provides it." }),
    teamId: s.string({ description: "The user's team ID when Slack provides it." }),
    isRestricted: s.boolean({ description: "Whether the user is a guest (multi-channel)." }),
    isUltraRestricted: s.boolean({ description: "Whether the user is a single-channel guest." }),
    isAppUser: s.boolean({ description: "Whether the user is an app user." }),
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
    name: "get_current_user",
    operationType: "read",
    description:
      "Get the workspace and user identity of the connected Slack credential, including whether it belongs to a bot.",
    requiredScopes: [],
    inputSchema: s.object({}),
    outputSchema: s.object(
      {
        teamId: s.nonEmptyString("The Slack workspace ID."),
        userId: userIdSchema,
        isBot: s.boolean({ description: "Whether auth.test identifies this credential with a bot_id." }),
      },
      { required: ["teamId", "userId", "isBot"] },
    ),
  }),
  action({
    name: "list_channels",
    operationType: "read",
    description: "List Slack public channels visible to the connected Slack identity.",
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
    operationType: "read",
    description: "Get recent messages from a Slack conversation.",
    requiredScopes: ["channels:history", "groups:history", "im:history", "mpim:history"],
    inputSchema: s.object(
      {
        channelId: channelIdSchema,
        // 999 is `conversations.history`'s documented ceiling. The former 100
        // was this action's own invention and cost a request per 100 messages.
        limit: s.integer({ minimum: 1, maximum: 999, description: "The maximum number of messages to return." }),
        cursor: s.string({
          description: "The Slack pagination cursor from a previous page. Omit for the first page.",
        }),
        ...historyWindowProperties,
      },
      { required: ["channelId"], description: "Input parameters for reading Slack conversation history." },
    ),
    outputSchema: s.object(
      {
        messages: s.array(slackMessageSchema, { description: "The list of messages in the conversation." }),
        hasMore: s.boolean({ description: "Whether more messages are available beyond this page." }),
        nextCursor: s.string({
          description: "The cursor for the next page, or an empty string when this is the last page.",
        }),
      },
      { required: ["messages", "hasMore", "nextCursor"], description: "The output payload for this action." },
    ),
  }),
  action({
    name: "conversations_members",
    operationType: "read",
    description:
      "List the member user IDs of a Slack conversation. Returns one page; pass the cursor from nextCursor until it comes back empty.",
    requiredScopes: ["channels:read", "groups:read", "im:read", "mpim:read"],
    inputSchema: s.object(
      {
        channelId: channelIdSchema,
        cursor: s.string({
          description: "The Slack pagination cursor from a previous page. Omit for the first page.",
        }),
        limit: s.integer({
          minimum: 1,
          maximum: 1000,
          description: "The maximum number of members to return per page.",
        }),
      },
      { required: ["channelId"], description: "Input parameters for listing Slack conversation members." },
    ),
    outputSchema: s.object(
      {
        memberIds: s.array(userIdSchema, {
          description: "The Slack user IDs that are members of the conversation.",
        }),
        nextCursor: s.string({
          description: "The cursor for the next page, or an empty string when this is the last page.",
        }),
      },
      { required: ["memberIds", "nextCursor"], description: "The output payload for this action." },
    ),
  }),
  action({
    name: "search_messages",
    operationType: "read",
    description:
      "Search Slack messages visible to the connected user. Supports Slack search modifiers such as in:channel_name and from:<@UserID>.",
    requiredScopes: ["search:read"],
    inputSchema: s.object(
      {
        query: s.nonEmptyString("The Slack search query."),
        count: s.integer({
          minimum: 1,
          maximum: 100,
          description: "The number of results to return per page.",
        }),
        page: s.integer({ minimum: 1, maximum: 100, description: "The Slack page number to fetch." }),
        cursor: s.string({
          description: "The Slack cursor for cursormark pagination. Use '*' for the first request.",
        }),
        highlight: s.boolean({ description: "Whether Slack should mark query terms in matching text." }),
        sort: searchSortSchema,
        sortDir: sortDirectionSchema,
        teamId: s.string({ description: "The encoded team ID to search when using an org-level token." }),
      },
      { required: ["query"], description: "Input parameters for searching Slack messages." },
    ),
    outputSchema: s.object(
      {
        query: s.string({ description: "The search query Slack executed." }),
        matches: s.array(searchMessageMatchSchema, { description: "The matching Slack messages." }),
        total: s.integer({ description: "The total number of matches Slack reports." }),
        pagination: s.unknownObject("Slack pagination metadata when returned."),
        paging: s.unknownObject("Slack legacy paging metadata when returned."),
        nextCursor: s.nullable(s.string({ description: "The cursor for the next page when Slack returns one." })),
      },
      {
        required: ["query", "matches", "total", "pagination", "paging", "nextCursor"],
        description: "The output payload for this action.",
      },
    ),
  }),
  action({
    name: "search_context",
    operationType: "read",
    description: "Search Slack messages with the granular Real-time Search API.",
    requiredScopes: ["search:read.public"],
    inputSchema: s.object(
      {
        query: s.nonEmptyString("The Slack search query."),
        channelTypes: s.array(
          s.stringEnum(["public_channel", "private_channel"], {
            description: "The Slack channel type to search.",
          }),
          { minItems: 1, description: "Channel types to search." },
        ),
        contextChannelId: s.nonEmptyString("The channel ID used to scope the search when applicable."),
        cursor: s.string({ description: "The cursor for the next page." }),
        limit: s.integer({ minimum: 1, maximum: 20, description: "The number of results to return." }),
        sort: searchSortSchema,
        sortDir: sortDirectionSchema,
        before: s.integer({ description: "Only return messages before this UNIX timestamp." }),
        after: s.integer({ description: "Only return messages after this UNIX timestamp." }),
        includeContextMessages: s.boolean({ description: "Whether to include surrounding context messages." }),
        includeBots: s.boolean({ description: "Whether to include messages posted by bots." }),
        includeMessageBlocks: s.boolean({ description: "Whether to include message blocks in the results." }),
        highlight: s.boolean({ description: "Whether Slack should highlight matching terms." }),
        termClauses: s.array(s.nonEmptyString("A search term clause."), {
          minItems: 1,
          description: "Search term clauses that every result must match.",
        }),
        modifiers: s.string({ description: "Slack search modifiers without free-text terms." }),
        includeArchivedChannels: s.boolean({ description: "Whether to include archived channels in the search." }),
        disableSemanticSearch: s.boolean({ description: "Whether to use keyword search without semantic search." }),
      },
      { required: ["query"], description: "Input parameters for Slack Real-time Search." },
    ),
    outputSchema: s.object(
      {
        messages: s.array(s.unknownObject("A Slack Real-time Search message."), {
          description: "The matching Slack messages.",
        }),
        nextCursor: s.nullable(s.string({ description: "The cursor for the next page." })),
      },
      { required: ["messages", "nextCursor"], description: "The output payload for Slack Real-time Search." },
    ),
  }),
  action({
    name: "post_message",
    operationType: "write",
    description:
      "Post a Slack message. Use text for plain messages, or blocks for rich Block Kit layouts with text as fallback.",
    requiredScopes: ["chat:write"],
    inputSchema: messageInputSchema("Input parameters for posting a Slack message."),
    outputSchema: postedMessageOutputSchema,
  }),
  action({
    name: "reply_message",
    operationType: "write",
    description: "Reply to a Slack thread. Use text, blocks, or attachments for the reply content.",
    requiredScopes: ["chat:write"],
    inputSchema: messageInputSchema(
      "Input parameters for replying to a Slack thread.",
      {
        threadTs: s.nonEmptyString("The timestamp of the parent message to reply to."),
        replyBroadcast: s.boolean({ description: "Whether Slack should also broadcast the reply to the channel." }),
      },
      ["threadTs"],
    ),
    outputSchema: postedMessageOutputSchema,
  }),
  action({
    name: "get_thread",
    operationType: "read",
    description: "Get messages in a Slack thread.",
    requiredScopes: ["channels:history", "groups:history", "im:history", "mpim:history"],
    inputSchema: s.object(
      {
        channelId: channelIdSchema,
        threadTs: s.nonEmptyString("The timestamp of the parent message."),
        limit: s.integer({ minimum: 1, maximum: 999, description: "The maximum number of messages to return." }),
        cursor: s.string({
          description: "The Slack pagination cursor from a previous page. Omit for the first page.",
        }),
        ...historyWindowProperties,
      },
      { required: ["channelId", "threadTs"], description: "Input parameters for reading a Slack thread." },
    ),
    outputSchema: s.object(
      {
        messages: s.array(slackMessageSchema, { description: "The list of messages in the thread." }),
        hasMore: s.boolean({ description: "Whether more messages are available beyond this page." }),
        nextCursor: s.string({
          description: "The cursor for the next page, or an empty string when this is the last page.",
        }),
      },
      { required: ["messages", "hasMore", "nextCursor"], description: "The output payload for this action." },
    ),
  }),
  action({
    name: "list_conversations",
    operationType: "read",
    description: "List Slack conversations visible to the connected Slack identity.",
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
    operationType: "read",
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
    operationType: "write",
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
    operationType: "read",
    description: "List Slack users visible to the connected Slack identity.",
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
    operationType: "read",
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
    operationType: "write",
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
    operationType: "read",
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
    operationType: "write",
    description:
      "Update a Slack message posted through this connection. Provide text, blocks, or attachments as the new message content.",
    requiredScopes: ["chat:write"],
    inputSchema: messageInputSchema("Input parameters for updating a Slack message.", { messageTs: messageTsSchema }, [
      "messageTs",
    ]),
    outputSchema: messageReferenceOutputSchema,
  }),
  action({
    name: "delete_message",
    operationType: "destructive",
    description: "Delete a Slack message posted through this connection.",
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
    operationType: "write",
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
    operationType: "write",
    description: "Add an emoji reaction to a Slack message.",
    requiredScopes: ["reactions:write"],
    inputSchema: reactionInputSchema("Input parameters for adding a Slack reaction."),
    outputSchema: successOutputSchema("Whether Slack accepted the reaction request."),
  }),
  action({
    name: "remove_reaction",
    operationType: "destructive",
    description: "Remove an emoji reaction from a Slack message.",
    requiredScopes: ["reactions:write"],
    inputSchema: reactionInputSchema("Input parameters for removing a Slack reaction."),
    outputSchema: successOutputSchema("Whether Slack accepted the reaction removal request."),
  }),
  action({
    name: "get_reactions",
    operationType: "read",
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
    operationType: "write",
    description:
      "Upload a file to Slack using the current external upload flow. Provide fileUrl; binary content is fetched by the connector runtime.",
    requiredScopes: ["files:write"],
    inputSchema: s.object(
      {
        filename: s.nonEmptyString("The file name Slack should display."),
        fileUrl: s.url("A URL whose response body should be uploaded to Slack."),
        title: s.string({ description: "Optional file title shown in Slack." }),
        channelId: channelIdSchema,
        initialComment: s.string({ description: "Optional message text to post with the file." }),
        threadTs: messageTsSchema,
        mimeType: s.nonEmptyString("The content type to send while uploading the file."),
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
    operationType: "read",
    description: "List Slack files visible to the connected Slack identity, optionally filtered by channel or user.",
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
    operationType: "read",
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
    name: "download_file",
    operationType: "read",
    description: "Download a Slack-hosted file into transit storage using the connected identity's access.",
    requiredScopes: ["files:read"],
    inputSchema: s.requiredObject("The Slack file to download.", { fileId: fileIdSchema }),
    outputSchema: s.requiredObject("A Slack file downloaded into transit storage.", {
      fileId: fileIdSchema,
      file: s.requiredObject("The downloaded file in transit storage.", {
        fileId: s.nonEmptyString("The transit file identifier."),
        downloadUrl: s.url("The transit URL for downloading the stored file."),
        sizeBytes: s.nonNegativeInteger("The stored file size in bytes."),
        name: s.nonEmptyString("The stored file name."),
        mimeType: s.nonEmptyString("The stored file MIME type."),
      }),
    }),
  }),
  action({
    name: "delete_file",
    operationType: "destructive",
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
      name: s.nonEmptyString("The emoji reaction name without surrounding colons."),
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
