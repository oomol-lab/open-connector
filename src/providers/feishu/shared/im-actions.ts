import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
interface FeishuImActionOptions {
  readonly service: string;
  readonly identity: "user" | "tenant";
}
const userIdTypeSchema = s.stringEnum("The user identifier type used by this request.", [
  "open_id",
  "union_id",
  "user_id",
]);
const receiveIdTypeSchema = s.stringEnum("The identifier type used by receiveId.", [
  "chat_id",
  "open_id",
  "union_id",
  "user_id",
  "email",
]);
const messagePageSchema = s.object(
  "A page of Feishu messages.",
  {
    items: s.array("The messages returned on this page.", s.looseObject("A Feishu message object.")),
    pageToken: s.nullable(s.string("The token for fetching the next page.")),
    hasMore: s.boolean("Whether another page is available."),
  },
  {
    optional: [],
  },
);
const genericOutputSchema = s.object(
  "The normalized Feishu result.",
  {
    raw: s.looseObject("The raw Feishu data object."),
  },
  {
    optional: [],
  },
);
export function createFeishuImActions(input: FeishuImActionOptions): readonly ActionDefinition[] {
  const sendPermissions =
    input.identity === "user" ? ["im:message.send_as_user", "im:message"] : ["im:message:send_as_bot"];
  const readPermissions =
    input.identity === "user"
      ? ["im:message:readonly", "im:message.group_msg:get_as_user", "im:message.p2p_msg:get_as_user"]
      : ["im:message.group_msg", "im:message.p2p_msg:readonly"];
  const createChatPermissions = input.identity === "user" ? ["im:chat:create_by_user"] : ["im:chat:create"];
  const updateChatPermissions = ["im:chat:update"];
  const manageChatMemberPermissions = ["im:chat.members:write_only"];
  const actions: ActionDefinition[] = [
    defineProviderAction(input.service, {
      name: "send_rich_message",
      operationType: "write",
      description:
        "Send text, Markdown, image, file, audio, video, or raw Feishu content, uploading URL media before sending.",
      requiredScopes: [...sendPermissions, "im:resource"],
      providerPermissions: [...sendPermissions, "im:resource"],
      inputSchema: s.object(
        "Choose one content kind and identify the recipient.",
        {
          receiveId: s.string("The recipient identifier.", { minLength: 1 }),
          receiveIdType: receiveIdTypeSchema,
          contentKind: s.stringEnum("The high-level content kind to send.", [
            "text",
            "markdown",
            "image",
            "file",
            "audio",
            "video",
            "raw",
          ]),
          text: s.string("Plain text content.", { minLength: 1 }),
          markdown: s.string("Markdown rendered in an interactive card.", { minLength: 1 }),
          imageKey: s.string("An existing Feishu image_key.", { minLength: 1 }),
          imageUrl: s.string("A public image URL to download and upload to Feishu.", {
            format: "uri",
          }),
          fileKey: s.string("An existing Feishu file_key.", { minLength: 1 }),
          fileUrl: s.string("A public file URL to download and upload to Feishu.", {
            format: "uri",
          }),
          fileName: s.string("The file name presented in Feishu.", { minLength: 1 }),
          fileType: s.stringEnum("The Feishu upload file type.", ["opus", "mp4", "pdf", "doc", "xls", "ppt", "stream"]),
          videoCoverKey: s.string("An existing image_key for the video cover.", { minLength: 1 }),
          videoCoverUrl: s.string("A public image URL used as the video cover.", {
            format: "uri",
          }),
          rawMsgType: s.string("The Feishu msg_type used by raw content.", { minLength: 1 }),
          rawContent: s.anyOf("A raw Feishu content object or serialized JSON string.", [
            s.string("A serialized Feishu content JSON string.", { minLength: 1 }),
            s.looseRequiredObject(
              "A Feishu content object.",
              {},
              {
                optional: [],
              },
            ),
          ]),
          idempotencyKey: s.string("An idempotency key that prevents duplicate sends.", {
            minLength: 1,
            maxLength: 50,
          }),
        },
        {
          optional: [
            "receiveIdType",
            "text",
            "markdown",
            "imageKey",
            "imageUrl",
            "fileKey",
            "fileUrl",
            "fileName",
            "fileType",
            "videoCoverKey",
            "videoCoverUrl",
            "rawMsgType",
            "rawContent",
            "idempotencyKey",
          ],
        },
      ),
      outputSchema: s.object(
        "The sent Feishu message.",
        {
          messageId: s.string("The created message identifier."),
          chatId: s.string("The destination chat identifier."),
          createTime: s.string("The message creation timestamp."),
          raw: s.looseObject("The raw Feishu message data."),
        },
        {
          optional: ["messageId", "chatId", "createTime"],
        },
      ),
    }),
    defineProviderAction(input.service, {
      name: "create_chat",
      operationType: "write",
      description: "Create a Feishu group or topic chat with initial users and bots.",
      requiredScopes: createChatPermissions,
      providerPermissions: createChatPermissions,
      inputSchema: s.object(
        "Describe the chat to create.",
        {
          name: s.string("The chat name."),
          description: s.string("The chat description."),
          ownerId: s.string("The owner user identifier."),
          userIdType: userIdTypeSchema,
          userIds: s.array("The initial user identifiers.", s.string("A user identifier.")),
          botIds: s.array("The initial bot identifiers.", s.string("A bot identifier.")),
          chatMode: s.stringEnum("The chat mode.", ["group", "topic"]),
          chatType: s.stringEnum("The group discoverability type.", ["private", "public"]),
          external: s.boolean("Whether the chat may contain external users."),
        },
        {
          optional: [
            "name",
            "description",
            "ownerId",
            "userIdType",
            "userIds",
            "botIds",
            "chatMode",
            "chatType",
            "external",
          ],
        },
      ),
      outputSchema: genericOutputSchema,
    }),
    defineProviderAction(input.service, {
      name: "update_chat",
      operationType: "write",
      description: "Update a Feishu chat's name or description.",
      requiredScopes: updateChatPermissions,
      providerPermissions: updateChatPermissions,
      inputSchema: s.object(
        "Identify the chat and provide fields to update.",
        {
          chatId: s.string("The chat identifier.", { minLength: 1 }),
          name: s.string("The new chat name.", { maxLength: 60 }),
          description: s.string("The new chat description.", { maxLength: 100 }),
          userIdType: userIdTypeSchema,
        },
        {
          optional: ["name", "description", "userIdType"],
        },
      ),
      outputSchema: genericOutputSchema,
    }),
    defineProviderAction(input.service, {
      name: "add_chat_members",
      operationType: "write",
      description: "Add users or bots to a Feishu chat.",
      requiredScopes: manageChatMemberPermissions,
      providerPermissions: manageChatMemberPermissions,
      inputSchema: chatMembersInputSchema("Identify the chat and members to add."),
      outputSchema: genericOutputSchema,
    }),
    defineProviderAction(input.service, {
      name: "remove_chat_members",
      operationType: "destructive",
      description: "Remove users or bots from a Feishu chat.",
      requiredScopes: manageChatMemberPermissions,
      providerPermissions: manageChatMemberPermissions,
      inputSchema: chatMembersInputSchema("Identify the chat and members to remove."),
      outputSchema: genericOutputSchema,
    }),
    defineProviderAction(input.service, {
      name: "batch_get_messages",
      operationType: "read",
      description: "Fetch up to 50 Feishu messages by message ID in one request.",
      requiredScopes: readPermissions,
      providerPermissions: readPermissions,
      inputSchema: s.object(
        "Provide message identifiers to fetch.",
        {
          messageIds: s.array("The Feishu message IDs.", s.string("A Feishu message ID.", { minLength: 1 }), {
            minItems: 1,
            maxItems: 50,
          }),
        },
        {
          optional: [],
        },
      ),
      outputSchema: messagePageSchema,
    }),
    defineProviderAction(input.service, {
      name: "list_thread_messages",
      operationType: "read",
      description: "List messages inside a Feishu message thread.",
      requiredScopes: readPermissions,
      providerPermissions: readPermissions,
      inputSchema: s.object(
        "Identify the thread and page through its messages.",
        {
          threadId: s.string("The Feishu thread identifier.", { minLength: 1 }),
          startTime: s.string("The inclusive start timestamp in seconds."),
          endTime: s.string("The exclusive end timestamp in seconds."),
          pageSize: s.positiveInteger("The number of messages per page.", { maximum: 50 }),
          pageToken: s.string("The page token returned by the previous request."),
          sortType: s.stringEnum("The message sort order.", ["ByCreateTimeAsc", "ByCreateTimeDesc"]),
        },
        {
          optional: ["startTime", "endTime", "pageSize", "pageToken", "sortType"],
        },
      ),
      outputSchema: messagePageSchema,
    }),
    defineProviderAction(input.service, {
      name: "get_message_read_users",
      operationType: "read",
      description: "List users who have read a Feishu message.",
      requiredScopes: readPermissions,
      providerPermissions: readPermissions,
      inputSchema: s.object(
        "Identify the message and page through read receipts.",
        {
          messageId: s.string("The Feishu message identifier.", { minLength: 1 }),
          userIdType: userIdTypeSchema,
          pageSize: s.positiveInteger("The number of users per page.", { maximum: 100 }),
          pageToken: s.string("The page token returned by the previous request."),
        },
        {
          optional: ["userIdType", "pageSize", "pageToken"],
        },
      ),
      outputSchema: messagePageSchema,
    }),
  ];
  if (input.identity === "user") {
    actions.push(
      defineProviderAction(input.service, {
        name: "search_messages",
        operationType: "read",
        description:
          "Search messages across Feishu chats with keyword, sender, chat, mention, attachment, and time filters.",
        requiredScopes: ["search:message"],
        providerPermissions: ["search:message"],
        inputSchema: s.object(
          "Describe one message search request.",
          {
            query: s.string("The message search keyword."),
            chatIds: s.array("Restrict results to these chat IDs.", s.string("A chat ID.")),
            senderIds: s.array("Restrict results to these sender open_ids.", s.string("A sender open_id.")),
            attachmentType: s.stringEnum("The attachment type to include.", ["file", "image", "video", "link"]),
            chatType: s.stringEnum("The chat type to include.", ["group", "p2p"]),
            senderType: s.stringEnum("The sender type to include.", ["user", "bot"]),
            excludeSenderType: s.stringEnum("The sender type to exclude.", ["user", "bot"]),
            isAtMe: s.boolean("Whether to return only messages that mention the caller."),
            atUserIds: s.array(
              "Restrict results to messages mentioning these open_ids.",
              s.string("A mentioned user open_id."),
            ),
            startTime: s.string("The inclusive ISO 8601 start time."),
            endTime: s.string("The inclusive ISO 8601 end time."),
            pageSize: s.positiveInteger("The number of results per page.", { maximum: 50 }),
            pageToken: s.string("The page token returned by the previous request."),
          },
          {
            optional: [
              "query",
              "chatIds",
              "senderIds",
              "attachmentType",
              "chatType",
              "senderType",
              "excludeSenderType",
              "isAtMe",
              "atUserIds",
              "startTime",
              "endTime",
              "pageSize",
              "pageToken",
            ],
          },
        ),
        outputSchema: messagePageSchema,
      }),
    );
  }
  return input.identity === "user" ? actions.filter((action) => action.name !== "get_message_read_users") : actions;
}
function chatMembersInputSchema(description: string) {
  return s.object(
    description,
    {
      chatId: s.string("The Feishu chat identifier.", { minLength: 1 }),
      memberIdType: s.stringEnum("The member identifier type.", ["open_id", "union_id", "user_id", "app_id"]),
      memberIds: s.array("The user or bot identifiers to change.", s.string("A member identifier.", { minLength: 1 }), {
        minItems: 1,
      }),
    },
    {
      optional: [],
    },
  );
}
