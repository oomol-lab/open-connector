import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";
import type { OpenHandsActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const openHandsApiBaseUrl = "https://app.all-hands.dev";
const openHandsValidationPath = "/api/v1/app-conversations/search";

type OpenHandsRequestMethod = "GET" | "POST";
type OpenHandsPayload = Record<string, unknown> | unknown[];
type OpenHandsActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const openHandsActionHandlers: Record<OpenHandsActionName, OpenHandsActionHandler> = {
  async start_conversation(input, context) {
    const payload = await openHandsRequest(context.apiKey, "/api/v1/app-conversations", context, {
      method: "POST",
      body: buildStartConversationBody(input),
    });
    return buildStartTaskOutput(readObjectPayload(payload));
  },
  async get_start_task(input, context) {
    const payload = await openHandsRequest(context.apiKey, "/api/v1/app-conversations/start-tasks", context, {
      query: { ids: requiredString(input.task_id, "task_id", requestInputError) },
    });
    return buildStartTaskOutput(readFirstItem(payload, "OpenHands start task was not found"));
  },
  async get_conversation(input, context) {
    const payload = await openHandsRequest(context.apiKey, "/api/v1/app-conversations", context, {
      query: { ids: requiredString(input.conversation_id, "conversation_id", requestInputError) },
    });
    const conversation = readNullableFirstItem(payload);
    return {
      conversation: conversation ? normalizeConversation(conversation) : null,
      raw: { items: payload },
    };
  },
  async list_conversations(input, context) {
    const payload = await openHandsRequest(context.apiKey, openHandsValidationPath, context, {
      query: buildConversationListQuery(input),
    });
    const payloadObject = readObjectPayload(payload);
    const items = Array.isArray(payloadObject.items)
      ? payloadObject.items.map((item) => normalizeConversation(optionalRecord(item) ?? {}))
      : [];
    return {
      items,
      page: {
        next_page_id: optionalString(payloadObject.next_page_id) ?? null,
      },
      raw: payloadObject,
    };
  },
  async send_message(input, context) {
    const conversationId = encodeURIComponent(
      requiredString(input.conversation_id, "conversation_id", requestInputError),
    );
    const payload = await openHandsRequest(
      context.apiKey,
      `/api/v1/app-conversations/${conversationId}/send-message`,
      context,
      {
        method: "POST",
        body: buildMessageBody(input),
      },
    );
    const payloadObject = readObjectPayload(payload);
    return {
      success: payloadObject.success === true,
      sandbox_status: optionalString(payloadObject.sandbox_status) ?? "MISSING",
      message: optionalString(payloadObject.message) ?? null,
      raw: payloadObject,
    };
  },
};

export async function validateOpenHandsCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: Pick<ApiKeyProviderContext, "fetcher" | "signal"> = { fetcher, signal };
  await openHandsRequest(apiKey, openHandsValidationPath, context, {
    query: { limit: 1 },
  });
  return {
    profile: {
      accountId: "open_hands",
      displayName: "OpenHands API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: openHandsApiBaseUrl,
      validationEndpoint: openHandsValidationPath,
    },
  };
}

function buildStartConversationBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    initial_message: buildMessageBody({
      message: input.message,
      run: input.run,
    }),
    selected_repository: optionalString(input.selected_repository),
    selected_branch: optionalString(input.selected_branch),
    title: optionalString(input.title),
    llm_model: optionalString(input.llm_model),
    system_message_suffix: optionalString(input.system_message_suffix),
  });
}

function buildMessageBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    role: "user",
    content: [
      {
        type: "text",
        text: requiredString(input.message, "message", requestInputError),
      },
    ],
    run: optionalBoolean(input.run),
  });
}

async function openHandsRequest(
  apiKey: string,
  path: string,
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">,
  options: {
    method?: OpenHandsRequestMethod;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
  } = {},
): Promise<OpenHandsPayload> {
  const token = requiredString(apiKey, "apiKey", requestInputError);
  const url = new URL(path, openHandsApiBaseUrl);
  appendQuery(url, options.query ?? {});
  let response: Response;
  let payload: OpenHandsPayload;
  try {
    response = await context.fetcher(url, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        ...(options.body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: context.signal,
    });
    payload = await readJsonValue(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `OpenHands request failed: ${error.message}` : "OpenHands request failed",
      error,
    );
  }
  if (!response.ok) {
    throw mapOpenHandsError(response, optionalRecord(payload) ?? {});
  }
  return payload;
}

function appendQuery(url: URL, query: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null && item !== "") {
          url.searchParams.append(key, String(item));
        }
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

async function readJsonValue(response: Response): Promise<OpenHandsPayload> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    const payload = JSON.parse(text) as unknown;
    if (!payload || typeof payload !== "object") {
      throw new ProviderRequestError(502, "OpenHands returned a non-object response");
    }
    return payload as OpenHandsPayload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "OpenHands returned invalid JSON");
  }
}

function readFirstItem(payload: OpenHandsPayload, notFoundMessage: string): Record<string, unknown> {
  const item = readNullableFirstItem(payload);
  if (!item) {
    throw new ProviderRequestError(404, notFoundMessage);
  }
  return item;
}

function readObjectPayload(payload: OpenHandsPayload): Record<string, unknown> {
  if (Array.isArray(payload)) {
    throw new ProviderRequestError(502, "OpenHands returned an array response");
  }
  return payload;
}

function readNullableFirstItem(payload: OpenHandsPayload): Record<string, unknown> | null {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "OpenHands returned a non-array batch response");
  }
  const first = payload[0];
  if (first == null) {
    return null;
  }
  return optionalRecord(first) ?? {};
}

function buildStartTaskOutput(payload: Record<string, unknown>): Record<string, unknown> {
  const task = normalizeStartTask(payload);
  return {
    task,
    conversation_url: task.app_conversation_id
      ? `${openHandsApiBaseUrl}/conversations/${task.app_conversation_id}`
      : null,
    raw: payload,
  };
}

function normalizeStartTask(
  payload: Record<string, unknown>,
): Record<string, unknown> & { app_conversation_id: string | null } {
  return {
    ...payload,
    id: optionalString(payload.id) ?? "",
    status: optionalString(payload.status) ?? "WORKING",
    detail: optionalString(payload.detail) ?? null,
    app_conversation_id: optionalString(payload.app_conversation_id) ?? null,
    sandbox_id: optionalString(payload.sandbox_id) ?? null,
    agent_server_url: optionalString(payload.agent_server_url) ?? null,
    created_at: optionalString(payload.created_at) ?? new Date(0).toISOString(),
    updated_at: optionalString(payload.updated_at) ?? new Date(0).toISOString(),
  };
}

function normalizeConversation(payload: Record<string, unknown>): Record<string, unknown> {
  const conversationId = optionalString(payload.id) ?? "";
  return {
    ...payload,
    id: conversationId,
    sandbox_id: optionalString(payload.sandbox_id) ?? null,
    selected_repository: optionalString(payload.selected_repository) ?? null,
    selected_branch: optionalString(payload.selected_branch) ?? null,
    title: optionalString(payload.title) ?? null,
    sandbox_status: optionalString(payload.sandbox_status) ?? "MISSING",
    execution_status: optionalString(payload.execution_status) ?? null,
    conversation_url:
      optionalString(payload.conversation_url) ??
      (conversationId ? `${openHandsApiBaseUrl}/conversations/${conversationId}` : null),
    created_at: optionalString(payload.created_at) ?? new Date(0).toISOString(),
    updated_at: optionalString(payload.updated_at) ?? new Date(0).toISOString(),
  };
}

function buildConversationListQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    title__contains: optionalString(input.title__contains),
    created_at__gte: optionalString(input.created_at__gte),
    created_at__lt: optionalString(input.created_at__lt),
    updated_at__gte: optionalString(input.updated_at__gte),
    updated_at__lt: optionalString(input.updated_at__lt),
    sandbox_id__eq: optionalString(input.sandbox_id__eq),
    page_id: optionalString(input.page_id),
    limit: optionalInteger(input.limit),
    include_sub_conversations: optionalBoolean(input.include_sub_conversations),
  });
}

function mapOpenHandsError(response: Response, payload: Record<string, unknown>): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `OpenHands request failed with HTTP ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(400, message, { status: response.status, payload });
  }
  if (response.status === 404) {
    return new ProviderRequestError(404, message, { status: response.status, payload });
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, { status: response.status, payload });
  }
  if (response.status >= 500) {
    return new ProviderRequestError(502, message, { status: response.status, payload });
  }
  return new ProviderRequestError(502, message, { status: response.status, payload });
}

function readErrorMessage(payload: Record<string, unknown>): string | undefined {
  const detail = payload.detail;
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    const first = optionalRecord(detail[0]);
    return optionalString(first?.msg) ?? optionalString(first?.message);
  }
  const detailObject = optionalRecord(detail);
  return (
    optionalString(detailObject?.message) ??
    optionalString(detailObject?.error) ??
    optionalString(payload.message) ??
    optionalString(payload.error)
  );
}

function requestInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
