import type { FeishuJsonRequest } from "./client.ts";

import { optionalBoolean } from "../../../core/cast.ts";
import { ProviderRequestError } from "../../provider-runtime.ts";

interface FeishuImUserActionHandler {
  (input: Record<string, unknown>): Promise<unknown>;
}

export function createFeishuImUserActionHandlers(
  request: FeishuJsonRequest,
): Record<string, FeishuImUserActionHandler> {
  return {
    list_chats(input) {
      return listChats(input, request);
    },
    search_chats(input) {
      return searchChats(input, request);
    },
    get_chat(input) {
      return getChat(input, request);
    },
    list_chat_members(input) {
      return listChatMembers(input, request);
    },
    list_messages(input) {
      return listMessages(input, request);
    },
    reply_message(input) {
      return replyMessage(input, request);
    },
  };
}

async function listChats(input: Record<string, unknown>, request: FeishuJsonRequest) {
  return readPage(
    await request({
      path: "/im/v1/chats",
      query: {
        user_id_type: optionalString(input.userIdType),
        sort_type: optionalString(input.sortType),
        page_size: optionalNumber(input.pageSize),
        page_token: optionalString(input.pageToken),
      },
    }),
  );
}

async function searchChats(input: Record<string, unknown>, request: FeishuJsonRequest) {
  return readPage(
    await request({
      path: "/im/v1/chats/search",
      query: {
        query: requireString(input.query, "query"),
        user_id_type: optionalString(input.userIdType),
        page_size: optionalNumber(input.pageSize),
        page_token: optionalString(input.pageToken),
      },
    }),
  );
}

async function getChat(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    path: `/im/v1/chats/${encodeURIComponent(requireString(input.chatId, "chatId"))}`,
    query: {
      user_id_type: optionalString(input.userIdType),
    },
  });
  return {
    chat: data,
  };
}

async function listChatMembers(input: Record<string, unknown>, request: FeishuJsonRequest) {
  return readPage(
    await request({
      path: `/im/v1/chats/${encodeURIComponent(requireString(input.chatId, "chatId"))}/members`,
      query: {
        member_id_type: optionalString(input.memberIdType),
        page_size: optionalNumber(input.pageSize),
        page_token: optionalString(input.pageToken),
      },
    }),
  );
}

async function listMessages(input: Record<string, unknown>, request: FeishuJsonRequest) {
  return readPage(
    await request({
      path: "/im/v1/messages",
      query: {
        container_id_type: requireString(input.containerIdType, "containerIdType"),
        container_id: requireString(input.containerId, "containerId"),
        start_time: optionalString(input.startTime),
        end_time: optionalString(input.endTime),
        sort_type: optionalString(input.sortType),
        page_size: optionalNumber(input.pageSize),
        page_token: optionalString(input.pageToken),
      },
    }),
  );
}

async function replyMessage(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    method: "POST",
    path: `/im/v1/messages/${encodeURIComponent(requireString(input.messageId, "messageId"))}/reply`,
    body: {
      msg_type: requireString(input.msgType, "msgType"),
      content:
        typeof input.content === "string" ? input.content : JSON.stringify(requireObject(input.content, "content")),
      reply_in_thread: optionalBoolean(input.replyInThread),
      uuid: optionalString(input.uuid),
    },
  });
  return {
    message: data,
  };
}

function readPage(data: Record<string, unknown>) {
  return {
    items: Array.isArray(data.items) ? data.items : [],
    hasMore: data.has_more === true,
    pageToken: optionalString(data.page_token) ?? null,
  };
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function requireObject(value: unknown, fieldName: string) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new ProviderRequestError(400, `${fieldName} must be an object or JSON string`);
}
