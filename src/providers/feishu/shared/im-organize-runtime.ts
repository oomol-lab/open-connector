import type { FeishuJsonRequest } from "./client.ts";

import { providerInputError, ProviderRequestError } from "../../provider-runtime.ts";

interface ImOrganizeActionHandler {
  (input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

interface FlagItem {
  readonly item_id: string;
  readonly item_type: string;
  readonly flag_type: string;
}

interface DualPage {
  readonly active: Record<string, unknown>[];
  readonly deleted: Record<string, unknown>[];
  readonly hasMore: boolean;
  readonly pageToken: string | null;
}

export function createFeishuImOrganizeActionHandlers(
  request: FeishuJsonRequest,
): Record<string, ImOrganizeActionHandler> {
  return {
    create_message_flag: (input) => createMessageFlag(input, request),
    cancel_message_flag: (input) => cancelMessageFlag(input, request),
    list_message_flags: (input) => listMessageFlags(input, request),
    create_feed_shortcuts: (input) => changeFeedShortcuts(input, request, false),
    remove_feed_shortcuts: (input) => changeFeedShortcuts(input, request, true),
    list_feed_shortcuts: (input) => listFeedShortcuts(input, request),
    list_feed_groups: (input) => listFeedGroups(input, request),
    list_feed_group_items: (input) => listFeedGroupItems(input, request),
    query_feed_group_items: (input) => queryFeedGroupItems(input, request),
  };
}

async function createMessageFlag(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const item = await resolveFlagItem(input, request);
  const data = await request({
    method: "POST",
    path: "/im/v1/flags",
    body: { flag_items: [item] },
  });
  return { item, raw: data };
}

async function cancelMessageFlag(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const messageId = requiredString(input.messageId, "messageId");
  const explicit = input.itemType !== undefined || input.flagType !== undefined;
  let items: FlagItem[];
  let lookupError: string | undefined = undefined;
  if (explicit) {
    items = [await resolveFlagItem(input, request)];
  } else {
    items = [flagItem(messageId, "default", "message")];
    try {
      items.push(flagItem(messageId, await detectFeedItemType(messageId, request), "feed"));
    } catch (error) {
      lookupError = errorMessage(error);
    }
  }

  const results: Record<string, unknown>[] = [];
  for (const item of items) {
    try {
      const data = await request({
        method: "POST",
        path: "/im/v1/flags/cancel",
        body: { flag_items: [item] },
      });
      results.push({ item, status: "succeeded", raw: data });
    } catch (error) {
      results.push({ item, status: "failed", error: errorMessage(error) });
    }
  }
  return { results, lookupError };
}

async function listMessageFlags(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const pageSize = optionalNumber(input.pageSize) ?? 50;
  const fetchAll = input.fetchAll === true && input.pageToken === undefined;
  const maxPages = optionalNumber(input.maxPages) ?? 20;
  let pageToken = optionalString(input.pageToken) ?? "";
  let hasMore = false;
  const flagItems: Record<string, unknown>[] = [];
  const deletedFlagItems: Record<string, unknown>[] = [];
  const messages: Record<string, unknown>[] = [];
  for (let page = 0; page < (fetchAll ? maxPages : 1); page++) {
    const data = await request({
      path: "/im/v1/flags",
      query: { page_size: pageSize, page_token: pageToken },
    });
    flagItems.push(...recordArray(data.flag_items));
    deletedFlagItems.push(...recordArray(data.delete_flag_items));
    messages.push(...recordArray(data.messages));
    hasMore = data.has_more === true;
    pageToken = optionalString(data.page_token) ?? "";
    if (!fetchAll || !hasMore || !pageToken) break;
  }
  if (input.includeMessages !== false) {
    await enrichFlagMessages(flagItems, messages, request);
  }
  return {
    flagItems,
    deletedFlagItems,
    messages,
    hasMore,
    pageToken: pageToken || null,
  };
}

async function changeFeedShortcuts(input: Record<string, unknown>, request: FeishuJsonRequest, remove: boolean) {
  const chatIds = chatIdArray(input.chatIds);
  const shortcuts = chatIds.map((feedCardId) => ({
    feed_card_id: feedCardId,
    type: 1,
  }));
  const data = await request({
    method: "POST",
    path: remove ? "/im/v2/feed_shortcuts/remove" : "/im/v2/feed_shortcuts",
    body: remove
      ? { shortcuts }
      : {
          shortcuts,
          is_header: optionalString(input.position) !== "tail",
        },
  });
  const failedShortcuts = recordArray(data.failed_shortcuts).map(annotateShortcutFailure);
  const failedIds = new Set(
    failedShortcuts
      .map((item) => optionalString(recordValue(item.shortcut).feed_card_id))
      .filter((item): item is string => Boolean(item)),
  );
  return {
    ...data,
    failed_shortcuts: failedShortcuts,
    succeeded_shortcuts: shortcuts.filter((item) => !failedIds.has(item.feed_card_id)),
  };
}

async function listFeedShortcuts(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const pageToken = optionalString(input.pageToken);
  const data = await request({
    path: "/im/v2/feed_shortcuts",
    query: pageToken ? { page_token: pageToken } : undefined,
  });
  const shortcuts = recordArray(data.shortcuts);
  if (input.includeDetails !== false) {
    await enrichChatDetails(shortcuts, "feed_card_id", "detail", request);
  }
  return {
    shortcuts,
    hasMore: data.has_more === true,
    pageToken: optionalString(data.page_token) ?? null,
    raw: data,
  };
}

async function listFeedGroups(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const page = await fetchDualPages({
    input,
    requestPage: (pageToken) =>
      request({
        path: "/im/v1/groups",
        query: {
          page_size: optionalNumber(input.pageSize) ?? 50,
          page_token: pageToken,
          start_time: optionalString(input.startTime),
          end_time: optionalString(input.endTime),
        },
      }),
    activeKey: "groups",
    deletedKey: "deleted_groups",
    firstPageToken: "",
  });
  return {
    groups: page.active,
    deletedGroups: page.deleted,
    hasMore: page.hasMore,
    pageToken: page.pageToken,
  };
}

async function listFeedGroupItems(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const feedGroupId = requiredString(input.feedGroupId, "feedGroupId");
  const page = await fetchDualPages({
    input,
    requestPage: (pageToken) =>
      request({
        path: `/im/v1/groups/${encodeURIComponent(feedGroupId)}/list_item`,
        query: {
          page_size: optionalNumber(input.pageSize) ?? 50,
          page_token: pageToken || undefined,
          start_time: optionalString(input.startTime),
          end_time: optionalString(input.endTime),
        },
      }),
    activeKey: "items",
    deletedKey: "deleted_items",
    firstPageToken: undefined,
  });
  if (input.includeChatDetails !== false) {
    await enrichChatDetails([...page.active, ...page.deleted], "feed_id", "chat", request);
  }
  return {
    items: page.active,
    deletedItems: page.deleted,
    hasMore: page.hasMore,
    pageToken: page.pageToken,
  };
}

async function queryFeedGroupItems(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const feedGroupId = requiredString(input.feedGroupId, "feedGroupId");
  const feedIds = requiredStringArray(input.feedIds, "feedIds");
  const data = await request({
    method: "POST",
    path: `/im/v1/groups/${encodeURIComponent(feedGroupId)}/batch_query_item`,
    body: {
      items: feedIds.map((feedId) => ({ feed_id: feedId, feed_type: "chat" })),
    },
  });
  const items = recordArray(data.items);
  const deletedItems = recordArray(data.deleted_items);
  if (input.includeChatDetails !== false) {
    await enrichChatDetails([...items, ...deletedItems], "feed_id", "chat", request);
  }
  return {
    items,
    deletedItems,
    hasMore: false,
    pageToken: null,
  };
}

async function resolveFlagItem(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const messageId = requiredString(input.messageId, "messageId");
  let itemType = optionalString(input.itemType) ?? "default";
  const flagType = optionalString(input.flagType) ?? "message";
  if (flagType === "feed" && input.itemType === undefined) {
    itemType = await detectFeedItemType(messageId, request);
  }
  if (!validFlagCombination(itemType, flagType)) {
    throw providerInputError("supported itemType/flagType pairs are default+message, thread+feed, and msg_thread+feed");
  }
  return flagItem(messageId, itemType, flagType);
}

async function detectFeedItemType(messageId: string, request: FeishuJsonRequest) {
  const messageData = await request({
    path: `/im/v1/messages/${encodeURIComponent(messageId)}`,
  });
  const message = recordArray(messageData.items)[0];
  const chatId = requiredProviderString(message?.chat_id, "message chat_id");
  const chat = await request({ path: `/im/v1/chats/${encodeURIComponent(chatId)}` });
  return chat.chat_mode === "topic" ? "thread" : "msg_thread";
}

function flagItem(messageId: string, itemType: string, flagType: string): FlagItem {
  return {
    item_id: messageId,
    item_type: { default: "0", thread: "4", msg_thread: "11" }[itemType]!,
    flag_type: flagType === "feed" ? "1" : "2",
  };
}

function validFlagCombination(itemType: string, flagType: string) {
  return (
    (itemType === "default" && flagType === "message") ||
    ((itemType === "thread" || itemType === "msg_thread") && flagType === "feed")
  );
}

async function enrichFlagMessages(
  flagItems: Record<string, unknown>[],
  messages: Record<string, unknown>[],
  request: FeishuJsonRequest,
) {
  const byId = new Map<string, Record<string, unknown>>();
  for (const message of messages) {
    const messageId = optionalString(message.message_id);
    if (messageId) byId.set(messageId, message);
  }
  const ids = uniqueStrings(
    flagItems
      .filter(
        (item) => String(item.flag_type) === "1" && (String(item.item_type) === "4" || String(item.item_type) === "11"),
      )
      .map((item) => optionalString(item.item_id))
      .filter((item): item is string => typeof item === "string" && !byId.has(item)),
  );
  for (let index = 0; index < ids.length; index += 50) {
    const data = await request({
      path: "/im/v1/messages/mget",
      query: { message_ids: ids.slice(index, index + 50) },
    });
    for (const message of recordArray(data.items)) {
      const messageId = optionalString(message.message_id);
      if (messageId) {
        byId.set(messageId, message);
        messages.push(message);
      }
    }
  }
  for (const item of flagItems) {
    const message = byId.get(optionalString(item.item_id) ?? "");
    if (message) item.message = message;
  }
}

async function enrichChatDetails(
  items: Record<string, unknown>[],
  idField: string,
  outputField: string,
  request: FeishuJsonRequest,
) {
  const ids = uniqueStrings(
    items.map((item) => optionalString(item[idField])).filter((item): item is string => Boolean(item)),
  );
  const byId = new Map<string, Record<string, unknown>>();
  for (let index = 0; index < ids.length; index += 50) {
    const data = await request({
      method: "POST",
      path: "/im/v1/chats/batch_query",
      query: { user_id_type: "open_id" },
      body: { chat_ids: ids.slice(index, index + 50) },
    });
    for (const chat of recordArray(data.items)) {
      const chatId = optionalString(chat.chat_id);
      if (chatId) byId.set(chatId, chat);
    }
  }
  for (const item of items) {
    const detail = byId.get(optionalString(item[idField]) ?? "");
    if (detail) item[outputField] = detail;
  }
}

interface FetchDualPagesInput {
  readonly input: Record<string, unknown>;
  readonly requestPage: (pageToken: string | undefined) => Promise<Record<string, unknown>>;
  readonly activeKey: string;
  readonly deletedKey: string;
  readonly firstPageToken: string | undefined;
}

async function fetchDualPages(input: FetchDualPagesInput): Promise<DualPage> {
  const fetchAll = input.input.fetchAll === true && input.input.pageToken === undefined;
  const maxPages = optionalNumber(input.input.maxPages) ?? 20;
  let pageToken = optionalString(input.input.pageToken) ?? input.firstPageToken;
  let hasMore = false;
  const active: Record<string, unknown>[] = [];
  const deleted: Record<string, unknown>[] = [];
  for (let page = 0; page < (fetchAll ? maxPages : 1); page++) {
    const data = await input.requestPage(pageToken);
    active.push(...recordArray(data[input.activeKey]));
    deleted.push(...recordArray(data[input.deletedKey]));
    hasMore = data.has_more === true;
    pageToken = optionalString(data.page_token);
    if (!fetchAll || !hasMore || !pageToken) break;
  }
  return { active, deleted, hasMore, pageToken: pageToken ?? null };
}

function annotateShortcutFailure(item: Record<string, unknown>): Record<string, unknown> {
  const reason = optionalNumber(item.reason);
  const reasonLabel =
    {
      0: "unknown",
      1: "no_permission",
      2: "invalid_item",
      3: "has_pending_delete",
      4: "type_not_support",
      5: "internal_error",
    }[reason ?? 0] ?? "unknown";
  return { ...item, reason_label: reasonLabel };
}

function chatIdArray(value: unknown) {
  const values = uniqueStrings(requiredStringArray(value, "chatIds"));
  if (values.length > 10) throw providerInputError("chatIds accepts at most 10 values");
  for (const value of values) {
    if (!value.startsWith("oc_")) {
      throw providerInputError(`chatIds must contain open_chat_id values; received ${value}`);
    }
  }
  return values;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function requiredStringArray(value: unknown, field: string) {
  const values = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  if (values.length === 0) throw providerInputError(`${field} must contain at least one value`);
  return values;
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function requiredString(value: unknown, field: string) {
  const result = optionalString(value);
  if (!result) throw providerInputError(`${field} must be a non-empty string`);
  return result;
}

function requiredProviderString(value: unknown, field: string) {
  const result = optionalString(value);
  if (!result) {
    throw new ProviderRequestError(502, `Feishu response is missing ${field}`);
  }
  return result;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
