import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { compactJson, queryParams } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "chatbotkit";
const apiBaseUrl = "https://api.chatbotkit.com/api/v1";

type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const chatbotkitActionHandlers: ProviderActionHandlers<"chatbotkit", Handler> = {
  fetch_usage(_input, context) {
    return requestChatbotkit(context, "/usage/fetch");
  },
  list_bots(input, context) {
    return requestChatbotkit(context, "/bot/list", { query: buildListQuery(input) });
  },
  fetch_bot(input, context) {
    return requestChatbotkit(context, `/bot/${encodeURIComponent(requiredString(input.botId, "botId"))}/fetch`);
  },
  create_bot(input, context) {
    return postWithout(input, context, "/bot/create");
  },
  update_bot(input, context) {
    return postWithout(input, context, `/bot/${encodeURIComponent(requiredString(input.botId, "botId"))}/update`, [
      "botId",
    ]);
  },
  list_conversations(input, context) {
    return requestChatbotkit(context, "/conversation/list", { query: buildListQuery(input) });
  },
  fetch_conversation(input, context) {
    return requestChatbotkit(
      context,
      `/conversation/${encodeURIComponent(requiredString(input.conversationId, "conversationId"))}/fetch`,
    );
  },
  create_conversation(input, context) {
    return postWithout(input, context, "/conversation/create");
  },
  list_conversation_messages(input, context) {
    return requestChatbotkit(
      context,
      `/conversation/${encodeURIComponent(requiredString(input.conversationId, "conversationId"))}/message/list`,
      { query: buildListQuery(input) },
    );
  },
  create_conversation_message(input, context) {
    return postWithout(
      input,
      context,
      `/conversation/${encodeURIComponent(requiredString(input.conversationId, "conversationId"))}/message/create`,
      ["conversationId"],
    );
  },
  complete_conversation(input, context) {
    return postWithout(
      input,
      context,
      `/conversation/${encodeURIComponent(requiredString(input.conversationId, "conversationId"))}/complete`,
      ["conversationId"],
    );
  },
  list_datasets(input, context) {
    return requestChatbotkit(context, "/dataset/list", { query: buildListQuery(input) });
  },
  fetch_dataset(input, context) {
    return requestChatbotkit(
      context,
      `/dataset/${encodeURIComponent(requiredString(input.datasetId, "datasetId"))}/fetch`,
    );
  },
  create_dataset(input, context) {
    return postWithout(input, context, "/dataset/create");
  },
  update_dataset(input, context) {
    return postWithout(
      input,
      context,
      `/dataset/${encodeURIComponent(requiredString(input.datasetId, "datasetId"))}/update`,
      ["datasetId"],
    );
  },
  list_dataset_records(input, context) {
    return requestChatbotkit(
      context,
      `/dataset/${encodeURIComponent(requiredString(input.datasetId, "datasetId"))}/record/list`,
      { query: buildListQuery(input) },
    );
  },
  create_dataset_record(input, context) {
    return postWithout(
      input,
      context,
      `/dataset/${encodeURIComponent(requiredString(input.datasetId, "datasetId"))}/record/create`,
      ["datasetId"],
    );
  },
  search_dataset(input, context) {
    return postWithout(
      input,
      context,
      `/dataset/${encodeURIComponent(requiredString(input.datasetId, "datasetId"))}/search`,
      ["datasetId"],
    );
  },
  list_files(input, context) {
    return requestChatbotkit(context, "/file/list", { query: buildListQuery(input) });
  },
  fetch_file(input, context) {
    return requestChatbotkit(context, `/file/${encodeURIComponent(requiredString(input.fileId, "fileId"))}/fetch`);
  },
  create_file(input, context) {
    return postWithout(input, context, "/file/create");
  },
  upload_file(input, context) {
    return postWithout(input, context, `/file/${encodeURIComponent(requiredString(input.fileId, "fileId"))}/upload`, [
      "fileId",
    ]);
  },
  download_file(input, context) {
    return requestChatbotkit(context, `/file/${encodeURIComponent(requiredString(input.fileId, "fileId"))}/download`);
  },
  sync_file(input, context) {
    return postWithout(input, context, `/file/${encodeURIComponent(requiredString(input.fileId, "fileId"))}/sync`, [
      "fileId",
    ]);
  },
  list_dataset_files(input, context) {
    return requestChatbotkit(
      context,
      `/dataset/${encodeURIComponent(requiredString(input.datasetId, "datasetId"))}/file/list`,
      { query: buildListQuery(input) },
    );
  },
  attach_dataset_file(input, context) {
    return postWithout(
      input,
      context,
      `/dataset/${encodeURIComponent(requiredString(input.datasetId, "datasetId"))}/file/${encodeURIComponent(requiredString(input.fileId, "fileId"))}/attach`,
      ["datasetId", "fileId"],
    );
  },
  detach_dataset_file(input, context) {
    return postWithout(
      input,
      context,
      `/dataset/${encodeURIComponent(requiredString(input.datasetId, "datasetId"))}/file/${encodeURIComponent(requiredString(input.fileId, "fileId"))}/detach`,
      ["datasetId", "fileId"],
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, chatbotkitActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const context = { apiKey: input.apiKey, fetcher, signal };
    const payload = optionalRecord(await requestChatbotkit(context, "/team/list", { query: { take: 1 } }));
    const firstTeam = Array.isArray(payload?.items) ? optionalRecord(payload.items[0]) : undefined;
    return {
      profile: {
        accountId: optionalString(firstTeam?.id) ?? "chatbotkit-api-key",
        displayName: optionalString(firstTeam?.name) ?? "ChatBotKit API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/team/list",
        apiBaseUrl,
        teamId: optionalString(firstTeam?.id),
        teamName: optionalString(firstTeam?.name),
      }),
    };
  },
};

async function postWithout(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  path: string,
  omit: string[] = [],
): Promise<unknown> {
  const body = Object.fromEntries(Object.entries(input).filter(([key]) => !omit.includes(key)));
  return requestChatbotkit(context, path, { method: "POST", body: compactJson(body) });
}

function buildListQuery(input: Record<string, unknown>): Record<string, unknown> {
  const meta = optionalRecord(input.meta);
  return {
    take: input.take,
    cursor: input.cursor,
    order: input.order,
    ...Object.fromEntries(Object.entries(meta ?? {}).map(([key, value]) => [`meta[${key}]`, value])),
  };
}

async function requestChatbotkit(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  path: string,
  options: { method?: "GET" | "POST"; query?: Record<string, unknown>; body?: unknown } = {},
): Promise<unknown> {
  const url = new URL(`${apiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(queryParams((options.query ?? {}) as Record<string, QueryValue>))) {
    url.searchParams.set(key, value);
  }
  const response = await context.fetcher(url, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "user-agent": providerUserAgent,
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: context.signal,
  });
  const payload = await readPayload(response);
  if (!response.ok) throw createChatbotkitError(response, payload);
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return text;
    throw new ProviderRequestError(502, "ChatBotKit returned invalid JSON");
  }
}

function createChatbotkitError(response: Response, payload: unknown): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    response.statusText ??
    `ChatBotKit request failed with HTTP ${response.status}`;
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}
