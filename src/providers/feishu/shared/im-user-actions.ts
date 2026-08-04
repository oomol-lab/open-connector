import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
const userIdType = s.stringEnum("The user identifier type returned by Feishu.", ["open_id", "union_id", "user_id"]);
const pageSize = s.positiveInteger("The maximum number of results on this page.", {
  maximum: 100,
});
// GET /im/v1/messages caps page_size at 50 — a larger value fails the whole
// request with Feishu 99992402 (field validation failed), so the schema must
// not admit it. `list_thread_messages` (the same endpoint through the thread
// container) already declares 50.
const messagePageSize = s.positiveInteger("The maximum number of results on this page.", {
  maximum: 50,
});
const pageToken = s.string("The page token returned by the previous request.", {
  minLength: 1,
});
const item = s.looseObject("A raw Feishu IM object.");
const page = s.object(
  "A normalized page of Feishu IM objects.",
  {
    items: s.array("The objects returned on this page.", item),
    hasMore: s.boolean("Whether another page is available."),
    pageToken: s.nullable(s.string("The token for the next page.")),
  },
  {
    optional: [],
  },
);
export function createFeishuImUserActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "list_chats",
      description: "List Feishu chats visible to the authorized user.",
      requiredScopes: ["im:chat:read"],
      providerPermissions: ["im:chat:read"],
      inputSchema: s.object(
        "Configure chat pagination and sorting.",
        {
          userIdType,
          sortType: s.stringEnum("The chat sort order.", ["ByCreateTimeAsc", "ByActiveTimeDesc"]),
          pageSize,
          pageToken,
        },
        {
          optional: ["userIdType", "sortType", "pageSize", "pageToken"],
        },
      ),
      outputSchema: page,
    }),
    defineProviderAction(service, {
      name: "search_chats",
      description: "Search Feishu chats visible to the authorized user by name.",
      requiredScopes: ["im:chat:read"],
      providerPermissions: ["im:chat:read"],
      inputSchema: s.object(
        "Provide the chat search text and pagination.",
        {
          query: s.string("The chat name search text.", { minLength: 1 }),
          userIdType,
          pageSize,
          pageToken,
        },
        {
          optional: ["userIdType", "pageSize", "pageToken"],
        },
      ),
      outputSchema: page,
    }),
    defineProviderAction(service, {
      name: "get_chat",
      description: "Get the metadata of one Feishu chat visible to the authorized user.",
      requiredScopes: ["im:chat:read"],
      providerPermissions: ["im:chat:read"],
      inputSchema: s.object(
        "Identify the chat.",
        {
          chatId: s.string("The Feishu chat ID.", { minLength: 1 }),
          userIdType,
        },
        {
          optional: ["userIdType"],
        },
      ),
      outputSchema: s.object(
        "The requested chat.",
        {
          chat: item,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "list_chat_members",
      description: "List members of one Feishu chat visible to the authorized user.",
      requiredScopes: ["im:chat.members:read"],
      providerPermissions: ["im:chat.members:read"],
      inputSchema: s.object(
        "Identify the chat and configure member pagination.",
        {
          chatId: s.string("The Feishu chat ID.", { minLength: 1 }),
          memberIdType: s.stringEnum("The member identifier type returned by Feishu.", [
            "open_id",
            "union_id",
            "user_id",
          ]),
          pageSize,
          pageToken,
        },
        {
          optional: ["memberIdType", "pageSize", "pageToken"],
        },
      ),
      outputSchema: page,
    }),
    defineProviderAction(service, {
      name: "list_messages",
      description: "List messages from one Feishu chat or thread with user-identity history permissions.",
      requiredScopes: [
        "im:message.group_msg:get_as_user",
        "im:message.p2p_msg:get_as_user",
        "im:message.reactions:read",
      ],
      providerPermissions: [
        "im:message.group_msg:get_as_user",
        "im:message.p2p_msg:get_as_user",
        "im:message.reactions:read",
      ],
      inputSchema: s.object(
        "Identify the message container and configure the time range and pagination.",
        {
          containerIdType: s.stringEnum("The message container type.", ["chat", "thread"]),
          containerId: s.string("The chat ID or thread ID.", { minLength: 1 }),
          startTime: s.string("The inclusive Unix timestamp in seconds.", { minLength: 1 }),
          endTime: s.string("The exclusive Unix timestamp in seconds.", { minLength: 1 }),
          sortType: s.stringEnum("The message sort order.", ["ByCreateTimeAsc", "ByCreateTimeDesc"]),
          pageSize: messagePageSize,
          pageToken,
        },
        {
          optional: ["startTime", "endTime", "sortType", "pageSize", "pageToken"],
        },
      ),
      outputSchema: page,
    }),
    defineProviderAction(service, {
      name: "reply_message",
      description: "Reply to a Feishu message as the authorized user, optionally inside the message thread.",
      requiredScopes: ["im:message.send_as_user", "im:message"],
      providerPermissions: ["im:message.send_as_user", "im:message"],
      inputSchema: s.object(
        "Identify the message and provide reply content.",
        {
          messageId: s.string("The Feishu message ID to reply to.", { minLength: 1 }),
          msgType: s.stringEnum("The Feishu reply message type.", [
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
          ]),
          content: s.anyOf("The reply content.", [
            s.string("A pre-serialized Feishu content JSON string.", { minLength: 1 }),
            s.looseObject("A Feishu message content object."),
          ]),
          replyInThread: s.boolean("Whether to reply in the message thread."),
          uuid: s.string("An idempotency key.", { minLength: 1 }),
        },
        {
          optional: ["replyInThread", "uuid"],
        },
      ),
      outputSchema: s.object(
        "The sent reply.",
        {
          message: item,
        },
        {
          optional: [],
        },
      ),
    }),
  ];
}
