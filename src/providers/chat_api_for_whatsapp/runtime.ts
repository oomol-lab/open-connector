import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  integer,
  optionalBooleanOrNull,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredBoolean,
  requiredRawString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderTextBody,
} from "../provider-runtime.ts";

export const chatApiForWhatsappApiOrigin = "https://api.chat-api.com";

const chatApiForWhatsappRequestTimeoutMs = 30_000;

type ChatApiForWhatsappPhase = "validate" | "execute";

export interface ChatApiForWhatsappContext {
  apiKey: string;
  instanceId: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface ChatApiForWhatsappResponse {
  status: number;
  payload: unknown;
  rawText: string;
}

export const chatApiForWhatsappActionHandlers: ProviderActionHandlers<
  "chat_api_for_whatsapp",
  ProviderRuntimeHandler<ChatApiForWhatsappContext>
> = {
  test_api_key(_input, context) {
    return getStatus(context, "execute");
  },
  get_status(_input, context) {
    return getStatus(context, "execute");
  },
  async get_settings(_input, context) {
    const payload = await requestChatApiForWhatsappJson({
      context,
      path: "/settings",
      phase: "execute",
    });
    const root = requiredRecord(payload, "Chat API settings response", responseError);
    return {
      webhookUrl: optionalRawString(root.webhookUrl) ?? null,
      ackNotificationsOn: optionalBooleanOrNull(root.ackNotificationsOn),
      chatUpdateOn: optionalBooleanOrNull(root.chatUpdateOn),
      videoUploadOn: optionalBooleanOrNull(root.videoUploadOn),
      proxy: optionalRawString(root.proxy) ?? null,
      raw: root,
    };
  },
  async list_chats(_input, context) {
    const payload = await requestChatApiForWhatsappJson({
      context,
      path: "/dialogs",
      phase: "execute",
    });
    const root = requiredRecord(payload, "Chat API dialogs response", responseError);
    return {
      chats: requireResponseArray(root.dialogs, "dialogs").map((item, index) =>
        normalizeChat(requiredRecord(item, `dialogs[${index}]`, responseError)),
      ),
    };
  },
  async list_messages(input, context) {
    const payload = await requestChatApiForWhatsappJson({
      context,
      path: "/messages",
      phase: "execute",
      query: compactObject({
        lastMessageNumber: input.lastMessageNumber,
        last: input.last,
        chatId: input.chatId,
      }),
    });
    const root = requiredRecord(payload, "Chat API messages response", responseError);
    return compactObject({
      messages: requireResponseArray(root.messages, "messages").map((item, index) =>
        normalizeMessage(requiredRecord(item, `messages[${index}]`, responseError)),
      ),
      lastMessageNumber: readOptionalInteger(root.lastMessageNumber),
    });
  },
  async send_text_message(input, context) {
    assertExactlyOneDestination(input);
    const payload = await requestChatApiForWhatsappJson({
      context,
      path: "/sendMessage",
      phase: "execute",
      method: "POST",
      body: compactObject({
        chatId: optionalString(input.chatId),
        phone: optionalString(input.phone),
        body: requiredString(input.text, "text", providerInputError),
      }),
    });
    return normalizeSendStatus(payload);
  },
  async send_file_by_url(input, context) {
    assertExactlyOneDestination(input);
    const payload = await requestChatApiForWhatsappJson({
      context,
      path: "/sendFile",
      phase: "execute",
      method: "POST",
      body: compactObject({
        chatId: optionalString(input.chatId),
        phone: optionalString(input.phone),
        body: requiredString(input.fileUrl, "fileUrl", providerInputError),
        filename: requiredString(input.filename, "filename", providerInputError),
        caption: optionalString(input.caption),
      }),
    });
    return normalizeSendStatus(payload);
  },
  async list_messages_queue(_input, context) {
    const payload = await requestChatApiForWhatsappJson({
      context,
      path: "/showMessagesQueue",
      phase: "execute",
    });
    const root = requiredRecord(payload, "Chat API message queue response", responseError);
    return {
      totalMessages: integer(root.totalMessages, "totalMessages", responseError),
      first100: requireResponseArray(root.first100, "first100").map((item, index) =>
        normalizeQueuedMessage(requiredRecord(item, `first100[${index}]`, responseError)),
      ),
    };
  },
};

export function requireChatApiForWhatsappInstanceId(value: unknown): string {
  const instanceId = requiredString(value, "instanceId", providerInputError);
  const numericInstanceId = Number(instanceId);
  if (!Number.isInteger(numericInstanceId) || numericInstanceId <= 0) {
    throw new ProviderRequestError(400, "instanceId must be a positive integer string");
  }
  return instanceId;
}

export function resolveChatApiForWhatsappBaseUrl(instanceId: unknown): string {
  const normalized = requireChatApiForWhatsappInstanceId(instanceId);
  return `${chatApiForWhatsappApiOrigin}/instance${encodeURIComponent(normalized)}/`;
}

export async function validateChatApiForWhatsappCredential(
  input: { apiKey: string; instanceId: unknown },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const instanceId = requireChatApiForWhatsappInstanceId(input.instanceId);
  const context: ChatApiForWhatsappContext = {
    apiKey: input.apiKey,
    instanceId,
    fetcher,
    signal,
  };
  const status = await getStatus(context, "validate");
  return {
    profile: {
      accountId: `chat_api_for_whatsapp:instance:${instanceId}`,
      displayName: `Chat API instance ${instanceId}`,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: resolveChatApiForWhatsappBaseUrl(instanceId),
      validationEndpoint: "/status",
      instanceId,
      accountStatus: status.accountStatus,
    }),
  };
}

async function getStatus(
  context: ChatApiForWhatsappContext,
  phase: ChatApiForWhatsappPhase,
): Promise<Record<string, unknown>> {
  const payload = await requestChatApiForWhatsappJson({
    context,
    path: "/status",
    phase,
  });
  const root = requiredRecord(payload, "Chat API status response", responseError);
  return compactObject({
    accountStatus: requiredRawString(root.accountStatus, "accountStatus", responseError),
    qrCode: optionalRawString(root.qrCode),
    raw: root,
  });
}

async function requestChatApiForWhatsappJson(input: {
  context: ChatApiForWhatsappContext;
  path: string;
  phase: ChatApiForWhatsappPhase;
  method?: "GET" | "POST";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const response = await requestChatApiForWhatsapp(input);
  if (response.status < 200 || response.status >= 300) {
    throwChatApiForWhatsappError(response, input.phase);
  }
  if (response.payload === undefined) {
    throw new ProviderRequestError(502, "empty Chat API response body");
  }
  return response.payload;
}

async function requestChatApiForWhatsapp(input: {
  context: ChatApiForWhatsappContext;
  path: string;
  phase: ChatApiForWhatsappPhase;
  method?: "GET" | "POST";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}): Promise<ChatApiForWhatsappResponse> {
  const timeout = createProviderTimeout(input.context.signal, chatApiForWhatsappRequestTimeoutMs);
  const url = new URL(
    input.path.startsWith("/") ? input.path.slice(1) : input.path,
    resolveChatApiForWhatsappBaseUrl(input.context.instanceId),
  );
  url.searchParams.set("token", input.context.apiKey);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    const response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(input.body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const rawText = await readProviderTextBody(response, "Chat API response");
    return {
      status: response.status,
      payload: parseJsonSafely(rawText),
      rawText,
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Chat API request timed out");
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "Chat API request failed");
  } finally {
    timeout.cleanup();
  }
}

function throwChatApiForWhatsappError(response: ChatApiForWhatsappResponse, phase: ChatApiForWhatsappPhase): never {
  const message =
    extractErrorMessage(response.payload) ||
    response.rawText.trim() ||
    `Chat API request failed with status ${response.status}`;
  if (response.status === 401) {
    throw new ProviderRequestError(401, message);
  }
  if (response.status === 402 || response.status === 429) {
    throw new ProviderRequestError(429, message);
  }
  if (response.status === 400 || response.status === 403 || response.status === 404) {
    throw new ProviderRequestError(400, message);
  }
  throw new ProviderRequestError(
    response.status || 502,
    phase === "validate" ? `Chat API credential validation failed: ${message}` : message,
  );
}

function normalizeChat(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: requiredRawString(payload.id, "id", responseError),
    name: requiredRawString(payload.name, "name", responseError),
    image: optionalRawString(payload.image),
    raw: payload,
  });
}

function normalizeMessage(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: requiredRawString(payload.id, "id", responseError),
    body: requiredRawString(payload.body, "body", responseError),
    type: requiredRawString(payload.type, "type", responseError),
    senderName: optionalRawString(payload.senderName),
    fromMe: requiredBoolean(payload.fromMe, "fromMe", responseError),
    author: optionalRawString(payload.author),
    time: integer(payload.time, "time", responseError),
    chatId: requiredRawString(payload.chatId, "chatId", responseError),
    messageNumber: integer(payload.messageNumber, "messageNumber", responseError),
    raw: payload,
  });
}

function normalizeQueuedMessage(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: integer(payload.id, "id", responseError),
    body: requiredRawString(payload.body, "body", responseError),
    type: requiredRawString(payload.type, "type", responseError),
    lastTry: readOptionalInteger(payload.last_try),
    metadata: optionalRecord(payload.metadata) ?? {},
    raw: payload,
  });
}

function normalizeSendStatus(payload: unknown): Record<string, unknown> {
  const root = requiredRecord(payload, "Chat API send response", responseError);
  return compactObject({
    sent: requiredBoolean(root.sent, "sent", responseError),
    id: optionalRawString(root.id),
    message: optionalRawString(root.message),
    raw: root,
  });
}

function assertExactlyOneDestination(input: Record<string, unknown>): void {
  const chatId = optionalString(input.chatId);
  const phone = optionalString(input.phone);
  if ((chatId ? 1 : 0) + (phone ? 1 : 0) !== 1) {
    throw new ProviderRequestError(400, "exactly one of chatId or phone is required");
  }
}

function requireResponseArray(payload: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${fieldName} is required in Chat API response`);
  }
  return payload;
}

function readOptionalInteger(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.message);
}

function parseJsonSafely(value: string): unknown {
  if (!value.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function responseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `Chat API response is invalid: ${message}`);
}
