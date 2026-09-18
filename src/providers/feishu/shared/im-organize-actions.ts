import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
export const feishuImOrganizeProviderPermissions = {
  flagRead: "im:feed.flag:read",
  flagWrite: "im:feed.flag:write",
  shortcutRead: "im:feed.shortcut:read",
  shortcutWrite: "im:feed.shortcut:write",
  feedGroupRead: "im:feed_group_v1:read",
  chatRead: "im:chat:read",
  groupMessageRead: "im:message.group_msg:get_as_user",
  p2pMessageRead: "im:message.p2p_msg:get_as_user",
};
const looseItemSchema = s.looseRequiredObject(
  "A Feishu IM organization object.",
  {},
  {
    optional: [],
  },
);
const pageSizeSchema = s.positiveInteger("The number of items requested per page.", {
  maximum: 50,
});
const pageTokenSchema = s.string("The page token returned by the previous request.", {
  minLength: 1,
});
const fetchAllSchema = s.boolean("Whether to auto-paginate when no pageToken is provided.");
const maxPagesSchema = s.positiveInteger("The maximum number of pages to auto-fetch.", {
  maximum: 1000,
});
const timeSchema = s.string("A Unix timestamp in milliseconds.", {
  minLength: 1,
  pattern: "^[0-9]+$",
});
const itemTypeSchema = s.stringEnum("The bookmark item layer.", ["default", "thread", "msg_thread"]);
const flagTypeSchema = s.stringEnum("The bookmark presentation layer.", ["message", "feed"]);
const flagPageOutputSchema = s.object(
  "A normalized page of message flags.",
  {
    flagItems: s.array("Active flags.", looseItemSchema),
    deletedFlagItems: s.array("Canceled flags.", looseItemSchema),
    messages: s.array("Message details returned or enriched for flags.", looseItemSchema),
    hasMore: s.boolean("Whether another page is available."),
    pageToken: s.nullable(s.string("The next page token.")),
  },
  {
    optional: [],
  },
);
const dualListPageOutputSchema = (description: string, active: string, deleted: string) =>
  s.object(
    description,
    {
      [active]: s.array(`Active ${active}.`, looseItemSchema),
      [deleted]: s.array(`Soft-deleted ${deleted}.`, looseItemSchema),
      hasMore: s.boolean("Whether another page is available."),
      pageToken: s.nullable(s.string("The next page token.")),
    },
    {
      optional: [],
    },
  );
export function createFeishuImOrganizeActions(service: string): readonly ActionDefinition[] {
  const flagLookupPermissions = [
    feishuImOrganizeProviderPermissions.flagWrite,
    feishuImOrganizeProviderPermissions.groupMessageRead,
    feishuImOrganizeProviderPermissions.p2pMessageRead,
    feishuImOrganizeProviderPermissions.chatRead,
  ];
  return [
    defineProviderAction(service, {
      name: "create_message_flag",
      operationType: "write",
      description: "Bookmark a message in the message or feed layer, automatically detecting thread type when needed.",
      requiredScopes: flagLookupPermissions,
      providerPermissions: flagLookupPermissions,
      inputSchema: s.object(
        "Identify the message and optional explicit flag layer.",
        {
          messageId: s.string("The message ID to bookmark.", { minLength: 1 }),
          itemType: itemTypeSchema,
          flagType: flagTypeSchema,
        },
        {
          optional: ["itemType", "flagType"],
        },
      ),
      outputSchema: s.object(
        "The created message flag.",
        {
          item: looseItemSchema,
          raw: looseItemSchema,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "cancel_message_flag",
      operationType: "destructive",
      description: "Cancel a targeted message flag or best-effort cancel both message and feed layers.",
      requiredScopes: flagLookupPermissions,
      providerPermissions: flagLookupPermissions,
      inputSchema: s.object(
        "Identify the message and optionally target one exact flag layer.",
        {
          messageId: s.string("The message ID whose flag should be canceled.", {
            minLength: 1,
          }),
          itemType: itemTypeSchema,
          flagType: flagTypeSchema,
        },
        {
          optional: ["itemType", "flagType"],
        },
      ),
      outputSchema: s.object(
        "The independent cancel attempts.",
        {
          results: s.array("One result for each attempted layer.", looseItemSchema),
          lookupError: s.string("Why automatic feed-layer detection was skipped."),
        },
        {
          optional: ["lookupError"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "list_message_flags",
      operationType: "read",
      description:
        "List active and canceled user message flags, optionally auto-paginating and enriching feed flags with messages.",
      requiredScopes: [
        feishuImOrganizeProviderPermissions.flagRead,
        feishuImOrganizeProviderPermissions.groupMessageRead,
        feishuImOrganizeProviderPermissions.p2pMessageRead,
      ],
      providerPermissions: [
        feishuImOrganizeProviderPermissions.flagRead,
        feishuImOrganizeProviderPermissions.groupMessageRead,
        feishuImOrganizeProviderPermissions.p2pMessageRead,
      ],
      inputSchema: s.object(
        "Configure flag pagination and enrichment.",
        {
          pageSize: pageSizeSchema,
          pageToken: pageTokenSchema,
          fetchAll: fetchAllSchema,
          maxPages: maxPagesSchema,
          includeMessages: s.boolean("Whether feed-layer flags should be enriched through messages/mget."),
        },
        {
          optional: ["pageSize", "pageToken", "fetchAll", "maxPages", "includeMessages"],
        },
      ),
      outputSchema: flagPageOutputSchema,
    }),
    defineProviderAction(service, {
      name: "create_feed_shortcuts",
      operationType: "write",
      description: "Add up to 10 chats to the authorized user's feed shortcuts at the head or tail.",
      requiredScopes: [feishuImOrganizeProviderPermissions.shortcutWrite],
      providerPermissions: [feishuImOrganizeProviderPermissions.shortcutWrite],
      inputSchema: s.object(
        "Provide chat IDs and insertion position.",
        {
          chatIds: s.array(
            "Open chat IDs to add.",
            s.string("An open_chat_id beginning with `oc_`.", { minLength: 1 }),
            { minItems: 1, maxItems: 10 },
          ),
          position: s.stringEnum("Where to insert the shortcuts.", ["head", "tail"]),
        },
        {
          optional: ["position"],
        },
      ),
      outputSchema: s.looseRequiredObject(
        "The shortcut write ledger, including per-item failures.",
        {},
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "remove_feed_shortcuts",
      operationType: "destructive",
      description: "Remove up to 10 chats from the authorized user's feed shortcuts.",
      requiredScopes: [feishuImOrganizeProviderPermissions.shortcutWrite],
      providerPermissions: [feishuImOrganizeProviderPermissions.shortcutWrite],
      inputSchema: s.object(
        "Provide chat IDs to remove.",
        {
          chatIds: s.array(
            "Open chat IDs to remove.",
            s.string("An open_chat_id beginning with `oc_`.", { minLength: 1 }),
            { minItems: 1, maxItems: 10 },
          ),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.looseRequiredObject(
        "The shortcut write ledger, including per-item failures.",
        {},
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "list_feed_shortcuts",
      operationType: "read",
      description: "List one version-locked page of user feed shortcuts and optionally attach complete chat details.",
      requiredScopes: [feishuImOrganizeProviderPermissions.shortcutRead, feishuImOrganizeProviderPermissions.chatRead],
      providerPermissions: [
        feishuImOrganizeProviderPermissions.shortcutRead,
        feishuImOrganizeProviderPermissions.chatRead,
      ],
      inputSchema: s.object(
        "Configure the version-locked shortcut page.",
        {
          pageToken: pageTokenSchema,
          includeDetails: s.boolean("Whether CHAT shortcuts should include chat details."),
        },
        {
          optional: ["pageToken", "includeDetails"],
        },
      ),
      outputSchema: s.object(
        "One feed-shortcut page.",
        {
          shortcuts: s.array("The feed shortcuts.", looseItemSchema),
          hasMore: s.boolean("Whether another version-locked page is available."),
          pageToken: s.nullable(s.string("The next page token.")),
          raw: looseItemSchema,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "list_feed_groups",
      operationType: "read",
      description: "List user feed groups, preserving both active and soft-deleted groups across auto-pagination.",
      requiredScopes: [feishuImOrganizeProviderPermissions.feedGroupRead],
      providerPermissions: [feishuImOrganizeProviderPermissions.feedGroupRead],
      inputSchema: paginationInputSchema("Configure feed-group pagination."),
      outputSchema: dualListPageOutputSchema("A normalized feed-group page.", "groups", "deletedGroups"),
    }),
    defineProviderAction(service, {
      name: "list_feed_group_items",
      operationType: "read",
      description: "List active and deleted feed cards in one group, optionally resolving each chat.",
      requiredScopes: [feishuImOrganizeProviderPermissions.feedGroupRead, feishuImOrganizeProviderPermissions.chatRead],
      providerPermissions: [
        feishuImOrganizeProviderPermissions.feedGroupRead,
        feishuImOrganizeProviderPermissions.chatRead,
      ],
      inputSchema: s.object(
        "Identify a group and configure its item pagination.",
        {
          pageSize: pageSizeSchema,
          pageToken: pageTokenSchema,
          fetchAll: fetchAllSchema,
          maxPages: maxPagesSchema,
          startTime: timeSchema,
          endTime: timeSchema,
          feedGroupId: s.string("The feed group ID.", { minLength: 1 }),
          includeChatDetails: s.boolean("Whether each chat feed should include chat details."),
        },
        {
          optional: ["pageSize", "pageToken", "fetchAll", "maxPages", "startTime", "endTime", "includeChatDetails"],
        },
      ),
      outputSchema: dualListPageOutputSchema("A normalized feed-group-item page.", "items", "deletedItems"),
    }),
    defineProviderAction(service, {
      name: "query_feed_group_items",
      operationType: "read",
      description: "Look up specific chat feed cards in one group and optionally attach complete chat details.",
      requiredScopes: [feishuImOrganizeProviderPermissions.feedGroupRead, feishuImOrganizeProviderPermissions.chatRead],
      providerPermissions: [
        feishuImOrganizeProviderPermissions.feedGroupRead,
        feishuImOrganizeProviderPermissions.chatRead,
      ],
      inputSchema: s.object(
        "Identify the feed group and chat feed IDs.",
        {
          feedGroupId: s.string("The feed group ID.", { minLength: 1 }),
          feedIds: s.array("Chat feed IDs to query.", s.string("A chat feed ID.", { minLength: 1 }), { minItems: 1 }),
          includeChatDetails: s.boolean("Whether each result should include chat details."),
        },
        {
          optional: ["includeChatDetails"],
        },
      ),
      outputSchema: dualListPageOutputSchema("The queried feed-group items.", "items", "deletedItems"),
    }),
  ];
}
function paginationInputSchema(description: string) {
  return s.object(
    description,
    {
      pageSize: pageSizeSchema,
      pageToken: pageTokenSchema,
      fetchAll: fetchAllSchema,
      maxPages: maxPagesSchema,
      startTime: timeSchema,
      endTime: timeSchema,
    },
    {
      optional: ["pageSize", "pageToken", "fetchAll", "maxPages", "startTime", "endTime"],
    },
  );
}
