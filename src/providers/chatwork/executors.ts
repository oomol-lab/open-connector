import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "chatwork";
const apiBaseUrl = "https://api.chatwork.com/v2";

type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const chatworkActionHandlers: ProviderActionHandlers<"chatwork", Handler> = {
  async get_me(_input, context) {
    return { profile: await requestObject(context, "/me") };
  },
  async get_contacts(_input, context) {
    return { contacts: await requestArray(context, "/contacts") };
  },
  async list_rooms(_input, context) {
    return { rooms: await requestArray(context, "/rooms") };
  },
  async get_room(input, context) {
    return { room: await requestObject(context, `/rooms/${positive(input.roomId, "roomId")}`) };
  },
  async list_room_members(input, context) {
    return { members: await requestArray(context, `/rooms/${positive(input.roomId, "roomId")}/members`) };
  },
  async list_room_messages(input, context) {
    const payload = await requestPayload(context, `/rooms/${positive(input.roomId, "roomId")}/messages`, {
      query: { force: input.force === true ? 1 : undefined },
    });
    return { messages: Array.isArray(payload) ? payload : [] };
  },
  async get_message(input, context) {
    return {
      message: await requestObject(
        context,
        `/rooms/${positive(input.roomId, "roomId")}/messages/${encodeURIComponent(requiredString(input.messageId, "messageId"))}`,
      ),
    };
  },
  async post_message(input, context) {
    const payload = await requestObject(context, `/rooms/${positive(input.roomId, "roomId")}/messages`, {
      method: "POST",
      form: { body: requiredString(input.body, "body"), self_unread: input.selfUnread === true ? 1 : undefined },
    });
    return { messageId: requiredString(payload.message_id, "message_id") };
  },
  async update_message(input, context) {
    const messageIdValue = requiredString(input.messageId, "messageId");
    const payload = optionalRecord(
      await requestPayload(
        context,
        `/rooms/${positive(input.roomId, "roomId")}/messages/${encodeURIComponent(messageIdValue)}`,
        { method: "PUT", form: { body: requiredString(input.body, "body") } },
      ),
    );
    return { messageId: optionalString(payload?.message_id) ?? messageIdValue };
  },
  async delete_message(input, context) {
    const messageIdValue = requiredString(input.messageId, "messageId");
    const payload = optionalRecord(
      await requestPayload(
        context,
        `/rooms/${positive(input.roomId, "roomId")}/messages/${encodeURIComponent(messageIdValue)}`,
        { method: "DELETE" },
      ),
    );
    return { messageId: optionalString(payload?.message_id) ?? messageIdValue };
  },
  async list_my_tasks(input, context) {
    return {
      tasks: await requestArray(context, "/my/tasks", {
        query: {
          assigned_by_account_id: optionalInteger(input.assignedByAccountId),
          status: optionalString(input.status),
        },
      }),
    };
  },
  async list_room_tasks(input, context) {
    return {
      tasks: await requestArray(context, `/rooms/${positive(input.roomId, "roomId")}/tasks`, {
        query: {
          account_id: optionalInteger(input.accountId),
          assigned_by_account_id: optionalInteger(input.assignedByAccountId),
          status: optionalString(input.status),
        },
      }),
    };
  },
  async get_task(input, context) {
    return {
      task: await requestObject(
        context,
        `/rooms/${positive(input.roomId, "roomId")}/tasks/${positive(input.taskId, "taskId")}`,
      ),
    };
  },
  async create_task(input, context) {
    const assignees = Array.isArray(input.assigneeAccountIds)
      ? input.assigneeAccountIds.map((value) => positive(value, "assigneeAccountIds"))
      : [];
    if (assignees.length === 0) throw new ProviderRequestError(400, "assigneeAccountIds is required");
    const form: Record<string, string | number | undefined> = {
      body: requiredString(input.body, "body"),
      to_ids: assignees.join(","),
    };
    const limit = optionalInteger(input.limitTime);
    if (limit) {
      form.limit = limit;
      form.limit_type = optionalString(input.limitType) ?? "time";
    }
    const payload = await requestObject(context, `/rooms/${positive(input.roomId, "roomId")}/tasks`, {
      method: "POST",
      form,
    });
    return {
      taskIds: Array.isArray(payload.task_ids) ? payload.task_ids.map((value) => positive(value, "task_ids")) : [],
    };
  },
  async update_task_status(input, context) {
    const taskIdValue = positive(input.taskId, "taskId");
    const payload = await requestObject(
      context,
      `/rooms/${positive(input.roomId, "roomId")}/tasks/${taskIdValue}/status`,
      { method: "PUT", form: { body: optionalString(input.status) ?? "open" } },
    );
    return { taskId: payload.task_id == null ? taskIdValue : positive(payload.task_id, "task_id") };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, chatworkActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const profile = await requestObject({ apiKey: input.apiKey, fetcher, signal }, "/me");
    return {
      profile: {
        accountId: String(profile.account_id ?? "api_key"),
        displayName: optionalString(profile.name) ?? "Chatwork API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl,
        validationEndpoint: "/me",
        accountId: profile.account_id,
        roomId: profile.room_id,
        chatworkId: profile.chatwork_id,
      }),
    };
  },
};

async function requestObject(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  path: string,
  options: RequestOptions = {},
): Promise<Record<string, unknown>> {
  const payload = await requestPayload(context, path, options);
  const record = optionalRecord(payload);
  if (!record) throw new ProviderRequestError(502, "invalid Chatwork object response");
  return record;
}

async function requestArray(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  path: string,
  options: RequestOptions = {},
): Promise<unknown[]> {
  const payload = await requestPayload(context, path, options);
  if (!Array.isArray(payload)) throw new ProviderRequestError(502, "invalid Chatwork array response");
  return payload;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, unknown>;
  form?: Record<string, string | number | undefined>;
}

async function requestPayload(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  path: string,
  options: RequestOptions = {},
): Promise<unknown> {
  const url = new URL(`${apiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(queryParams((options.query ?? {}) as Record<string, QueryValue>))) {
    url.searchParams.set(key, value);
  }
  const body = options.form
    ? new URLSearchParams(queryParams(options.form as Record<string, QueryValue>)).toString()
    : undefined;
  const response = await context.fetcher(url, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      "x-chatworktoken": context.apiKey,
      "user-agent": providerUserAgent,
      ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
    signal: context.signal,
  });
  const payload = await readPayload(response);
  if (!response.ok) throw createChatworkError(response, payload);
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return text;
    throw new ProviderRequestError(502, "Chatwork returned invalid JSON");
  }
}

function positive(value: unknown, fieldName: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  return parsed;
}

function createChatworkError(response: Response, payload: unknown): ProviderRequestError {
  const record = optionalRecord(payload);
  const errors = Array.isArray(record?.errors) ? record.errors.join(", ") : undefined;
  const message =
    errors ??
    optionalString(record?.message) ??
    response.statusText ??
    `Chatwork request failed with HTTP ${response.status}`;
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}
