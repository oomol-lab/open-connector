import type { FeishuActionRuntimeContext, FeishuJsonRequest } from "./client.ts";
import type { FeishuIdentity } from "./client.ts";

import { optionalBoolean, optionalRecord, optionalString } from "../../../core/cast.ts";
import { ProviderRequestError } from "../../provider-runtime.ts";
import { uploadFeishuMedia } from "./media.ts";

interface FeishuImActionHandler {
  (input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export function createFeishuImActionHandlers(input: {
  readonly identity: FeishuIdentity;
  readonly request: FeishuJsonRequest;
  readonly context: FeishuActionRuntimeContext;
}): Readonly<Record<string, FeishuImActionHandler>> {
  const handlers: Record<string, FeishuImActionHandler> = {
    send_rich_message: (actionInput) => sendRichMessage(actionInput, input.request, input.context),
    create_chat: (actionInput) => createChat(actionInput, input.request),
    update_chat: (actionInput) => updateChat(actionInput, input.request),
    add_chat_members: (actionInput) => changeChatMembers(actionInput, "POST", input.request),
    remove_chat_members: (actionInput) => changeChatMembers(actionInput, "DELETE", input.request),
    batch_get_messages: (actionInput) => batchGetMessages(actionInput, input.request),
    list_thread_messages: (actionInput) => listThreadMessages(actionInput, input.request),
    get_message_read_users: (actionInput) => getMessageReadUsers(actionInput, input.request),
  };
  if (input.identity === "user") {
    handlers.search_messages = (actionInput) => searchMessages(actionInput, input.request);
  }
  return handlers;
}

async function sendRichMessage(
  input: Record<string, unknown>,
  request: FeishuJsonRequest,
  context: FeishuActionRuntimeContext,
) {
  const contentKind = requireString(input.contentKind, "contentKind");
  const message = await resolveMessageContent(contentKind, input, context);
  const data = await request({
    method: "POST",
    path: "/im/v1/messages",
    query: { receive_id_type: optionalString(input.receiveIdType) ?? "chat_id" },
    body: {
      receive_id: requireString(input.receiveId, "receiveId"),
      msg_type: message.msgType,
      content: message.content,
      uuid: optionalString(input.idempotencyKey),
    },
  });
  return {
    messageId: optionalString(data.message_id),
    chatId: optionalString(data.chat_id),
    createTime: optionalString(data.create_time),
    raw: data,
  };
}

async function resolveMessageContent(
  kind: string,
  input: Record<string, unknown>,
  context: FeishuActionRuntimeContext,
) {
  if (kind === "text") {
    return {
      msgType: "text",
      content: JSON.stringify({ text: requireString(input.text, "text") }),
    };
  } else if (kind === "markdown") {
    return {
      msgType: "interactive",
      content: JSON.stringify({
        elements: [{ tag: "markdown", content: requireString(input.markdown, "markdown") }],
      }),
    };
  } else if (kind === "image") {
    const imageKey =
      optionalString(input.imageKey) ??
      (await uploadFeishuMedia(
        {
          sourceUrl: requireString(input.imageUrl, "imageUrl"),
          kind: "image",
          fieldName: "imageUrl",
          maxBytes: 10 * 1024 * 1024,
        },
        context,
      ));
    return { msgType: "image", content: JSON.stringify({ image_key: imageKey }) };
  } else if (kind === "file" || kind === "audio") {
    const fileKey =
      optionalString(input.fileKey) ??
      (await uploadFeishuMedia(
        {
          sourceUrl: requireString(input.fileUrl, "fileUrl"),
          kind: "file",
          fieldName: "fileUrl",
          fileName: optionalString(input.fileName),
          fileType: kind === "audio" ? "opus" : readFileType(input.fileType),
        },
        context,
      ));
    return { msgType: kind, content: JSON.stringify({ file_key: fileKey }) };
  } else if (kind === "video") {
    const videoKeyPromise = optionalString(input.fileKey)
      ? Promise.resolve(optionalString(input.fileKey)!)
      : uploadFeishuMedia(
          {
            sourceUrl: requireString(input.fileUrl, "fileUrl"),
            kind: "file",
            fieldName: "fileUrl",
            fileName: optionalString(input.fileName),
            fileType: "mp4",
          },
          context,
        );
    const coverKeyPromise = optionalString(input.videoCoverKey)
      ? Promise.resolve(optionalString(input.videoCoverKey)!)
      : uploadFeishuMedia(
          {
            sourceUrl: requireString(input.videoCoverUrl, "videoCoverUrl"),
            kind: "image",
            fieldName: "videoCoverUrl",
            maxBytes: 10 * 1024 * 1024,
          },
          context,
        );
    const [fileKey, imageKey] = await Promise.all([videoKeyPromise, coverKeyPromise]);
    return {
      msgType: "media",
      content: JSON.stringify({ file_key: fileKey, image_key: imageKey }),
    };
  } else if (kind === "raw") {
    const rawContent = input.rawContent;
    if (typeof rawContent !== "string" && !optionalRecord(rawContent)) {
      throw new ProviderRequestError(400, "rawContent is required for raw messages");
    }
    return {
      msgType: requireString(input.rawMsgType, "rawMsgType"),
      content: typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent),
    };
  } else {
    throw new ProviderRequestError(400, `unsupported contentKind: ${kind}`);
  }
}

async function createChat(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    method: "POST",
    path: "/im/v1/chats",
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
    body: {
      name: optionalString(input.name),
      description: optionalString(input.description),
      owner_id: optionalString(input.ownerId),
      user_id_list: stringArray(input.userIds),
      bot_id_list: stringArray(input.botIds),
      chat_mode: optionalString(input.chatMode),
      chat_type: optionalString(input.chatType),
      external: optionalBoolean(input.external),
    },
  });
  return { raw: data };
}

async function updateChat(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const chatId = requireString(input.chatId, "chatId");
  const name = optionalString(input.name);
  const description = optionalString(input.description);
  if (
    (input.name !== undefined && name === undefined) ||
    (input.description !== undefined && description === undefined)
  ) {
    throw new ProviderRequestError(400, "name and description must be strings");
  }
  if (name === undefined && description === undefined) {
    throw new ProviderRequestError(400, "provide at least one chat field to update");
  }
  if (name !== undefined && Array.from(name).length > 60) {
    throw new ProviderRequestError(400, "name must not exceed 60 characters");
  }
  if (description !== undefined && Array.from(description).length > 100) {
    throw new ProviderRequestError(400, "description must not exceed 100 characters");
  }
  const data = await request({
    method: "PUT",
    path: `/im/v1/chats/${encodeURIComponent(chatId)}`,
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
    body: {
      name,
      description,
    },
  });
  return { raw: data };
}

async function changeChatMembers(
  input: Record<string, unknown>,
  method: "POST" | "DELETE",
  request: FeishuJsonRequest,
) {
  const chatId = requireString(input.chatId, "chatId");
  const data = await request({
    method,
    path: `/im/v1/chats/${encodeURIComponent(chatId)}/members`,
    query: { member_id_type: requireString(input.memberIdType, "memberIdType") },
    body: { id_list: stringArray(input.memberIds) },
  });
  return { raw: data };
}

async function batchGetMessages(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    path: "/im/v1/messages/mget",
    query: {
      message_ids: stringArray(input.messageIds),
      card_msg_content_type: "raw_card_content",
      with_sender_name: true,
    },
  });
  return normalizePage(data);
}

async function listThreadMessages(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    path: "/im/v1/messages",
    query: {
      container_id_type: "thread",
      container_id: requireString(input.threadId, "threadId"),
      start_time: optionalString(input.startTime),
      end_time: optionalString(input.endTime),
      page_size: optionalNumber(input.pageSize),
      page_token: optionalString(input.pageToken),
      sort_type: optionalString(input.sortType),
    },
  });
  return normalizePage(data);
}

async function getMessageReadUsers(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const messageId = requireString(input.messageId, "messageId");
  const data = await request({
    path: `/im/v1/messages/${encodeURIComponent(messageId)}/read_users`,
    query: {
      user_id_type: optionalString(input.userIdType) ?? "open_id",
      page_size: optionalNumber(input.pageSize),
      page_token: optionalString(input.pageToken),
    },
  });
  return normalizePage(data);
}

async function searchMessages(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    method: "POST",
    path: "/im/v1/messages/search",
    query: {
      page_size: optionalNumber(input.pageSize),
      page_token: optionalString(input.pageToken),
    },
    body: {
      query: optionalString(input.query),
      chat_ids: stringArray(input.chatIds),
      from_ids: stringArray(input.senderIds),
      include: optionalString(input.attachmentType),
      chat_type: optionalString(input.chatType),
      from_type: optionalString(input.senderType),
      exclude_from_type: optionalString(input.excludeSenderType),
      is_at_me: optionalBoolean(input.isAtMe),
      at_chatter_ids: stringArray(input.atUserIds),
      start_time: isoTimeToMilliseconds(input.startTime),
      end_time: isoTimeToMilliseconds(input.endTime),
    },
  });
  return normalizePage(data);
}

function normalizePage(data: Record<string, unknown>) {
  return {
    items: Array.isArray(data.items) ? data.items.filter((item) => optionalRecord(item) != null) : [],
    pageToken: optionalString(data.page_token) ?? null,
    hasMore: data.has_more === true,
  };
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function isoTimeToMilliseconds(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new ProviderRequestError(400, `invalid ISO 8601 time: ${value}`);
  }
  return String(timestamp);
}

function readFileType(value: unknown) {
  const fileType = optionalString(value);
  if (
    fileType === "opus" ||
    fileType === "mp4" ||
    fileType === "pdf" ||
    fileType === "doc" ||
    fileType === "xls" ||
    fileType === "ppt" ||
    fileType === "stream"
  ) {
    return fileType;
  }
  return "stream";
}
