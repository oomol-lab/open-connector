import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { feishuAppBotScopes } from "./scopes.ts";

const service = "feishu_app_bot";

const sendMessageTypeSchema = s.stringEnum("The Feishu message type to send.", [
  "text",
  "post",
  "image",
  "file",
  "audio",
  "media",
  "sticker",
  "interactive",
  "share_chat",
  "share_user",
  "system",
]);
const replyMessageTypeSchema = s.stringEnum("The Feishu message type to send in the reply.", [
  "text",
  "post",
  "image",
  "file",
  "audio",
  "media",
  "sticker",
  "interactive",
  "share_chat",
  "share_user",
]);
const editMessageTypeSchema = s.stringEnum("The Feishu message type supported by the edit endpoint.", ["text", "post"]);
const receiveIdTypeSchema = s.stringEnum("The identifier type used by receiveId.", [
  "open_id",
  "union_id",
  "user_id",
  "email",
  "chat_id",
]);
const userIdTypeSchema = s.stringEnum("The user identifier type returned by Feishu read APIs.", [
  "open_id",
  "union_id",
  "user_id",
]);
const containerIdTypeSchema = s.stringEnum("The Feishu container type to read history from.", ["chat", "thread"]);
const sortTypeSchema = s.stringEnum("The sort order used for listing history messages.", [
  "ByCreateTimeAsc",
  "ByCreateTimeDesc",
]);
const chatSortTypeSchema = s.stringEnum("The sort order used for listing chats.", [
  "ByCreateTimeAsc",
  "ByActiveTimeDesc",
]);
const uploadFileTypeSchema = s.stringEnum("The Feishu file type used by the file upload API.", [
  "opus",
  "mp4",
  "pdf",
  "doc",
  "xls",
  "ppt",
  "stream",
]);
const cardMessageContentTypeSchema = s.stringEnum("Return the original card JSON when the target message is a card.", [
  "user_card_content",
]);
const contentInputSchema = s.union(
  [
    s.string("A pre-serialized Feishu message content JSON string.", { minLength: 1 }),
    s.looseObject({}, { description: "A Feishu message content object that will be JSON-stringified." }),
  ],
  { description: "The message content payload." },
);
const timestampStringSchema = s.string("A millisecond or second timestamp encoded as a string.", {
  minLength: 1,
});

const feishuEnvelopeBaseProperties = {
  code: s.integer("The Feishu API code. 0 means success."),
  msg: s.string("The Feishu API message."),
};

const messageBodySchema = s.looseRequiredObject(
  "The Feishu message body.",
  {
    content: s.string("The serialized Feishu message content JSON string."),
  },
  { optional: ["content"] },
);
const mentionSchema = s.looseRequiredObject(
  "One Feishu mention item.",
  {
    key: s.string("The stable mention placeholder key."),
    id: s.string("The mentioned user or bot identifier."),
    id_type: s.string("The identifier type of the mentioned user or bot."),
    name: s.string("The display name of the mentioned user or bot."),
    tenant_key: s.string("The tenant key of the mentioned user or bot."),
  },
  { optional: ["key", "id", "id_type", "name", "tenant_key"] },
);
const senderSchema = s.looseRequiredObject(
  "The Feishu sender object.",
  {
    id: s.string("The sender identifier."),
    id_type: s.string("The sender identifier type."),
    sender_type: s.string("The sender type such as user or app."),
    tenant_key: s.string("The tenant key of the sender."),
  },
  { optional: ["id", "id_type", "sender_type", "tenant_key"] },
);
const messageSchema = s.looseRequiredObject(
  "One Feishu message payload.",
  {
    message_id: s.string("The Feishu message identifier."),
    root_id: s.string("The root message identifier."),
    parent_id: s.string("The parent message identifier."),
    thread_id: s.string("The thread identifier."),
    msg_type: s.string("The Feishu message type."),
    create_time: s.string("The message creation timestamp in milliseconds."),
    update_time: s.string("The message update timestamp in milliseconds."),
    deleted: s.boolean("Whether the message has been recalled or deleted."),
    updated: s.boolean("Whether the message has been updated."),
    chat_id: s.string("The Feishu chat identifier."),
    sender: senderSchema,
    body: messageBodySchema,
    mentions: s.array("The mentions contained in the message.", mentionSchema),
    upper_message_id: s.string("The parent message identifier for merge-forward payloads."),
  },
  {
    optional: [
      "root_id",
      "parent_id",
      "thread_id",
      "mentions",
      "upper_message_id",
      "message_id",
      "msg_type",
      "create_time",
      "update_time",
      "deleted",
      "updated",
      "chat_id",
      "sender",
      "body",
    ],
  },
);
const messageEnvelopeSchema = s.requiredObject("A Feishu message API response envelope.", {
  ...feishuEnvelopeBaseProperties,
  data: messageSchema,
});
const getMessageEnvelopeSchema = s.requiredObject("A Feishu get-message response envelope.", {
  ...feishuEnvelopeBaseProperties,
  data: s.looseRequiredObject("The Feishu get-message payload.", {
    items: s.array("The messages returned for the queried message ID.", messageSchema),
  }),
});
const messageListEnvelopeSchema = s.requiredObject("A Feishu message-list response envelope.", {
  ...feishuEnvelopeBaseProperties,
  data: s.looseRequiredObject(
    "The paginated Feishu message list payload.",
    {
      has_more: s.boolean("Whether another history page is available."),
      page_token: s.string("The pagination token for the next page."),
      items: s.array("The history messages returned by Feishu.", messageSchema),
    },
    { optional: ["page_token"] },
  ),
});
const chatSummarySchema = s.looseRequiredObject(
  "One Feishu chat summary.",
  {
    chat_id: s.string("The Feishu chat ID."),
    avatar: s.string("The chat avatar URL."),
    name: s.string("The chat name."),
    description: s.string("The chat description."),
    owner_id: s.string("The owner user ID."),
    owner_id_type: s.string("The owner ID type."),
    external: s.boolean("Whether the chat is external."),
    tenant_key: s.string("The tenant key of the chat."),
    chat_status: s.string("The chat status."),
  },
  { optional: ["avatar", "name", "description", "owner_id", "owner_id_type", "external", "tenant_key", "chat_status"] },
);
const chatListEnvelopeSchema = s.requiredObject("A Feishu chat-list response envelope.", {
  ...feishuEnvelopeBaseProperties,
  data: s.looseRequiredObject(
    "The Feishu chat-list payload.",
    {
      items: s.array("The returned chat summaries.", chatSummarySchema),
      page_token: s.string("The pagination token for the next page."),
      has_more: s.boolean("Whether another page is available."),
    },
    { optional: ["page_token"] },
  ),
});
const chatEnvelopeSchema = s.requiredObject("A Feishu chat-detail response envelope.", {
  ...feishuEnvelopeBaseProperties,
  data: s.looseObject({}, { description: "The Feishu chat detail payload." }),
});
const chatMemberSchema = s.looseRequiredObject(
  "One Feishu chat member.",
  {
    member_id_type: s.string("The member ID type."),
    member_id: s.string("The member ID."),
    name: s.string("The member display name."),
    tenant_key: s.string("The member tenant key."),
  },
  { optional: ["member_id_type", "member_id", "name", "tenant_key"] },
);
const chatMemberListEnvelopeSchema = s.requiredObject("A Feishu chat-member-list response envelope.", {
  ...feishuEnvelopeBaseProperties,
  data: s.looseRequiredObject(
    "The Feishu chat-member-list payload.",
    {
      items: s.array("The returned chat members.", chatMemberSchema),
      page_token: s.string("The pagination token for the next page."),
      has_more: s.boolean("Whether another page is available."),
      member_total: s.integer("The total member count."),
    },
    { optional: ["page_token", "member_total"] },
  ),
});
const reactionTypeSchema = s.requiredObject("The Feishu reaction type.", {
  emoji_type: s.string("The Feishu emoji type."),
});
const reactionSchema = s.looseRequiredObject(
  "One Feishu message reaction.",
  {
    reaction_id: s.string("The reaction ID."),
    operator: s.looseObject({}, { description: "The reaction operator." }),
    action_time: s.string("The reaction action time in milliseconds."),
    reaction_type: reactionTypeSchema,
  },
  { optional: ["reaction_id", "operator", "action_time", "reaction_type"] },
);
const reactionEnvelopeSchema = s.requiredObject("A Feishu reaction response envelope.", {
  ...feishuEnvelopeBaseProperties,
  data: reactionSchema,
});
const reactionListEnvelopeSchema = s.requiredObject("A Feishu reaction-list response envelope.", {
  ...feishuEnvelopeBaseProperties,
  data: s.looseRequiredObject(
    "The Feishu reaction-list payload.",
    {
      items: s.array("The returned reactions.", reactionSchema),
      has_more: s.boolean("Whether another page is available."),
      page_token: s.string("The pagination token for the next page."),
    },
    { optional: ["page_token"] },
  ),
});
const pinSchema = s.looseRequiredObject(
  "One Feishu pin record.",
  {
    message_id: s.string("The pinned message ID."),
    chat_id: s.string("The pinned chat ID."),
    operator_id: s.string("The pin operator ID."),
    operator_id_type: s.string("The pin operator ID type."),
    create_time: s.string("The pin creation time in milliseconds."),
  },
  { optional: ["message_id", "chat_id", "operator_id", "operator_id_type", "create_time"] },
);
const pinEnvelopeSchema = s.requiredObject("A Feishu pin response envelope.", {
  ...feishuEnvelopeBaseProperties,
  data: s.looseRequiredObject("The Feishu pin payload.", {
    pin: pinSchema,
  }),
});
const pinListEnvelopeSchema = s.requiredObject("A Feishu pin-list response envelope.", {
  ...feishuEnvelopeBaseProperties,
  data: s.looseRequiredObject(
    "The Feishu pin-list payload.",
    {
      items: s.array("The returned pin records.", pinSchema),
      has_more: s.boolean("Whether another page is available."),
      page_token: s.string("The pagination token for the next page."),
    },
    { optional: ["page_token"] },
  ),
});
const emptyEnvelopeSchema = s.requiredObject("A Feishu empty response envelope.", {
  ...feishuEnvelopeBaseProperties,
  data: s.looseObject({}, { description: "The Feishu empty response payload." }),
});
const imageUploadEnvelopeSchema = s.requiredObject("A Feishu image-upload response envelope.", {
  ...feishuEnvelopeBaseProperties,
  data: s.looseRequiredObject("The Feishu image-upload payload.", {
    image_key: s.string("The Feishu image key returned by the upload API."),
  }),
});
const fileUploadEnvelopeSchema = s.requiredObject("A Feishu file-upload response envelope.", {
  ...feishuEnvelopeBaseProperties,
  data: s.looseRequiredObject("The Feishu file-upload payload.", {
    file_key: s.string("The Feishu file key returned by the upload API."),
  }),
});
const downloadableFileSchema = s.requiredObject("A downloadable file uploaded to connector transit storage.", {
  name: s.string("The downloaded file name."),
  mimetype: s.string("The MIME type of the downloaded file."),
  s3url: s.string("The transit URL for downloading the file."),
});

export const feishuAppBotActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "upload_image",
    description: "Upload one public image URL to Feishu/Lark and return the image key for message sending.",
    requiredScopes: [feishuAppBotScopes.resource],
    providerPermissions: [feishuAppBotScopes.resource],
    inputSchema: s.requiredObject("Input for uploading one image to Feishu.", {
      imageUrl: s.url("The public image URL to download and upload to Feishu."),
    }),
    outputSchema: imageUploadEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "download_image",
    description: "Download one Feishu/Lark image by image key and upload it to transit storage.",
    inputSchema: s.object(
      "Input for downloading one Feishu image.",
      {
        imageKey: s.string("The Feishu image key to download.", { minLength: 1 }),
        fileName: s.string("The optional file name to use for the downloaded transit file.", { minLength: 1 }),
      },
      { optional: ["fileName"] },
    ),
    outputSchema: s.requiredObject("A Feishu image-download response.", {
      imageKey: s.string("The Feishu image key that was downloaded."),
      file: downloadableFileSchema,
      contentType: s.string("The MIME type of the downloaded image."),
    }),
  }),
  defineProviderAction(service, {
    name: "upload_file",
    description: "Upload one public file URL to Feishu/Lark and return the file key for message sending.",
    requiredScopes: [feishuAppBotScopes.resource],
    providerPermissions: [feishuAppBotScopes.resource],
    inputSchema: s.object(
      "Input for uploading one file to Feishu.",
      {
        fileUrl: s.url("The public file URL to download and upload to Feishu."),
        fileType: uploadFileTypeSchema,
        fileName: s.string("The optional file name to send to Feishu. Inferred from the URL when omitted.", {
          minLength: 1,
        }),
        duration: s.integer("The optional duration in milliseconds for audio or video uploads.", { minimum: 0 }),
      },
      { required: ["fileUrl", "fileType"], optional: ["fileName", "duration"] },
    ),
    outputSchema: fileUploadEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "download_file",
    description: "Download one Feishu/Lark file by file key and upload it to transit storage.",
    inputSchema: s.object(
      "Input for downloading one Feishu file.",
      {
        fileKey: s.string("The Feishu file key to download.", { minLength: 1 }),
        fileName: s.string("The optional file name to use for the downloaded transit file.", { minLength: 1 }),
      },
      { optional: ["fileName"] },
    ),
    outputSchema: s.requiredObject("A Feishu file-download response.", {
      fileKey: s.string("The Feishu file key that was downloaded."),
      file: downloadableFileSchema,
      contentType: s.string("The MIME type of the downloaded file."),
    }),
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send a Feishu/Lark app bot message to a user or chat.",
    requiredScopes: [feishuAppBotScopes.sendMessage],
    providerPermissions: [feishuAppBotScopes.sendMessage],
    inputSchema: s.object(
      "Input for sending a Feishu app bot message.",
      {
        receiveIdType: receiveIdTypeSchema,
        receiveId: s.string("The target user or chat identifier.", { minLength: 1 }),
        msgType: sendMessageTypeSchema,
        content: contentInputSchema,
        uuid: s.string("The optional Feishu deduplication UUID for this message.", { maxLength: 50 }),
      },
      { required: ["receiveIdType", "receiveId", "msgType", "content"], optional: ["uuid"] },
    ),
    outputSchema: messageEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "reply_message",
    description: "Reply to an existing Feishu/Lark message as the app bot.",
    requiredScopes: [feishuAppBotScopes.sendMessage],
    providerPermissions: [feishuAppBotScopes.sendMessage],
    inputSchema: s.object(
      "Input for replying to a Feishu message.",
      {
        messageId: s.string("The Feishu message ID to reply to.", { minLength: 1 }),
        msgType: replyMessageTypeSchema,
        content: contentInputSchema,
        replyInThread: s.boolean("Whether Feishu should create the reply inside the thread."),
        uuid: s.string("The optional Feishu deduplication UUID for this reply.", { maxLength: 50 }),
      },
      { required: ["messageId", "msgType", "content"], optional: ["replyInThread", "uuid"] },
    ),
    outputSchema: messageEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "get_message",
    description: "Fetch one Feishu/Lark message by message_id.",
    requiredScopes: [feishuAppBotScopes.readMessage, feishuAppBotScopes.groupMessage],
    providerPermissions: [feishuAppBotScopes.readMessage, feishuAppBotScopes.groupMessage],
    inputSchema: s.object(
      "Input for fetching a Feishu message.",
      {
        messageId: s.string("The Feishu message ID to fetch.", { minLength: 1 }),
        userIdType: userIdTypeSchema,
        cardMsgContentType: cardMessageContentTypeSchema,
      },
      { required: ["messageId"], optional: ["userIdType", "cardMsgContentType"] },
    ),
    outputSchema: getMessageEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "list_messages",
    description: "List Feishu/Lark history messages from a chat or thread.",
    requiredScopes: [feishuAppBotScopes.readMessage, feishuAppBotScopes.groupMessage],
    providerPermissions: [feishuAppBotScopes.readMessage, feishuAppBotScopes.groupMessage],
    inputSchema: s.object(
      "Input for listing Feishu history messages.",
      {
        containerIdType: containerIdTypeSchema,
        containerId: s.string("The Feishu chat or thread identifier.", { minLength: 1 }),
        startTime: timestampStringSchema,
        endTime: timestampStringSchema,
        sortType: sortTypeSchema,
        pageSize: s.integer("The Feishu page size.", { minimum: 1, maximum: 50 }),
        pageToken: s.string("The Feishu pagination token.", { minLength: 1 }),
        cardMsgContentType: cardMessageContentTypeSchema,
      },
      {
        required: ["containerIdType", "containerId"],
        optional: ["startTime", "endTime", "sortType", "pageSize", "pageToken", "cardMsgContentType"],
      },
    ),
    outputSchema: messageListEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "list_chats",
    description: "List chats that the Feishu/Lark app bot currently belongs to.",
    requiredScopes: [feishuAppBotScopes.chatRead],
    providerPermissions: [feishuAppBotScopes.chatRead],
    inputSchema: s.object(
      "Input for listing Feishu chats.",
      {
        userIdType: userIdTypeSchema,
        sortType: chatSortTypeSchema,
        pageSize: s.integer("The Feishu page size.", { minimum: 1, maximum: 100 }),
        pageToken: s.string("The Feishu pagination token.", { minLength: 1 }),
      },
      { optional: ["userIdType", "sortType", "pageSize", "pageToken"] },
    ),
    outputSchema: chatListEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "search_chats",
    description: "Search chats visible to the Feishu/Lark app bot by keyword.",
    requiredScopes: [feishuAppBotScopes.chatRead],
    providerPermissions: [feishuAppBotScopes.chatRead],
    inputSchema: s.object(
      "Input for searching visible Feishu chats.",
      {
        query: s.string("The chat search keyword.", { minLength: 1, maxLength: 64 }),
        userIdType: userIdTypeSchema,
        pageSize: s.integer("The Feishu page size.", { minimum: 1, maximum: 100 }),
        pageToken: s.string("The Feishu pagination token.", { minLength: 1 }),
      },
      { required: ["query"], optional: ["userIdType", "pageSize", "pageToken"] },
    ),
    outputSchema: chatListEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "get_chat",
    description: "Fetch one Feishu/Lark chat by chat_id.",
    requiredScopes: [feishuAppBotScopes.chatRead],
    providerPermissions: [feishuAppBotScopes.chatRead],
    inputSchema: s.object(
      "Input for fetching a Feishu chat.",
      {
        chatId: s.string("The Feishu chat ID to fetch.", { minLength: 1 }),
        userIdType: userIdTypeSchema,
      },
      { required: ["chatId"], optional: ["userIdType"] },
    ),
    outputSchema: chatEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "list_chat_members",
    description: "List visible members in one Feishu/Lark chat.",
    requiredScopes: [feishuAppBotScopes.chatMembersRead],
    providerPermissions: [feishuAppBotScopes.chatMembersRead],
    inputSchema: s.object(
      "Input for listing Feishu chat members.",
      {
        chatId: s.string("The Feishu chat ID to inspect.", { minLength: 1 }),
        memberIdType: userIdTypeSchema,
        pageSize: s.integer("The Feishu page size.", { minimum: 1, maximum: 100 }),
        pageToken: s.string("The Feishu pagination token.", { minLength: 1 }),
      },
      { required: ["chatId"], optional: ["memberIdType", "pageSize", "pageToken"] },
    ),
    outputSchema: chatMemberListEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "recall_message",
    description: "Recall one Feishu/Lark message that the app bot sent.",
    requiredScopes: [feishuAppBotScopes.recallMessage],
    providerPermissions: [feishuAppBotScopes.recallMessage],
    inputSchema: s.requiredObject("Input for recalling a Feishu message.", {
      messageId: s.string("The Feishu message ID to recall.", { minLength: 1 }),
    }),
    outputSchema: emptyEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "edit_message",
    description: "Edit a Feishu/Lark text or post message sent by the app bot.",
    requiredScopes: [feishuAppBotScopes.updateMessage],
    providerPermissions: [feishuAppBotScopes.updateMessage],
    inputSchema: s.requiredObject("Input for editing a Feishu message.", {
      messageId: s.string("The Feishu message ID to edit.", { minLength: 1 }),
      msgType: editMessageTypeSchema,
      content: contentInputSchema,
    }),
    outputSchema: messageEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "add_message_reaction",
    description: "Add one emoji reaction to a Feishu/Lark message.",
    requiredScopes: [feishuAppBotScopes.reactionWrite],
    providerPermissions: [feishuAppBotScopes.reactionWrite],
    inputSchema: s.requiredObject("Input for adding a Feishu message reaction.", {
      messageId: s.string("The Feishu message ID to react to.", { minLength: 1 }),
      emojiType: s.string("The Feishu emoji type to add.", { minLength: 1 }),
    }),
    outputSchema: reactionEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "list_message_reactions",
    description: "List emoji reactions on one Feishu/Lark message.",
    requiredScopes: [feishuAppBotScopes.reactionRead],
    providerPermissions: [feishuAppBotScopes.reactionRead],
    inputSchema: s.object(
      "Input for listing Feishu message reactions.",
      {
        messageId: s.string("The Feishu message ID to inspect.", { minLength: 1 }),
        reactionType: s.string("Filter by one Feishu emoji type.", { minLength: 1 }),
        pageSize: s.integer("The Feishu page size.", { minimum: 1, maximum: 50 }),
        pageToken: s.string("The Feishu pagination token.", { minLength: 1 }),
        userIdType: userIdTypeSchema,
      },
      { required: ["messageId"], optional: ["reactionType", "pageSize", "pageToken", "userIdType"] },
    ),
    outputSchema: reactionListEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "remove_message_reaction",
    description: "Remove one Feishu/Lark message reaction by reaction_id.",
    requiredScopes: [feishuAppBotScopes.reactionWrite],
    providerPermissions: [feishuAppBotScopes.reactionWrite],
    inputSchema: s.requiredObject("Input for removing a Feishu message reaction.", {
      messageId: s.string("The Feishu message ID to update.", { minLength: 1 }),
      reactionId: s.string("The Feishu reaction ID to remove.", { minLength: 1 }),
    }),
    outputSchema: emptyEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "pin_message",
    description: "Pin one Feishu/Lark message inside its chat.",
    requiredScopes: [feishuAppBotScopes.pinWrite],
    providerPermissions: [feishuAppBotScopes.pinWrite],
    inputSchema: s.requiredObject("Input for pinning a Feishu message.", {
      messageId: s.string("The Feishu message ID to pin.", { minLength: 1 }),
    }),
    outputSchema: pinEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "list_pins",
    description: "List pin records in one Feishu/Lark chat and time window.",
    requiredScopes: [feishuAppBotScopes.pinRead],
    providerPermissions: [feishuAppBotScopes.pinRead],
    inputSchema: s.object(
      "Input for listing Feishu pin records.",
      {
        chatId: s.string("The Feishu chat ID to inspect.", { minLength: 1 }),
        startTime: timestampStringSchema,
        endTime: timestampStringSchema,
        pageSize: s.integer("The Feishu page size.", { minimum: 1, maximum: 50 }),
        pageToken: s.string("The Feishu pagination token.", { minLength: 1 }),
      },
      { required: ["chatId"], optional: ["startTime", "endTime", "pageSize", "pageToken"] },
    ),
    outputSchema: pinListEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "remove_pin",
    description: "Remove the pin state from one Feishu/Lark message.",
    requiredScopes: [feishuAppBotScopes.pinWrite],
    providerPermissions: [feishuAppBotScopes.pinWrite],
    inputSchema: s.requiredObject("Input for removing a Feishu message pin.", {
      messageId: s.string("The Feishu message ID to unpin.", { minLength: 1 }),
    }),
    outputSchema: emptyEnvelopeSchema,
  }),
];

export type FeishuAppBotActionName =
  | "upload_image"
  | "download_image"
  | "upload_file"
  | "download_file"
  | "send_message"
  | "reply_message"
  | "get_message"
  | "list_messages"
  | "list_chats"
  | "search_chats"
  | "get_chat"
  | "list_chat_members"
  | "recall_message"
  | "edit_message"
  | "add_message_reaction"
  | "list_message_reactions"
  | "remove_message_reaction"
  | "pin_message"
  | "list_pins"
  | "remove_pin";
