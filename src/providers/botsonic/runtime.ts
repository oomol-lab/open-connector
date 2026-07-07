import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BotsonicActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const botsonicApiBaseUrl = "https://api.botsonic.ai";
const botsonicValidationPath = "/v1/business/bot-faq/all";
export const botsonicAuthHeader = "X-BOT-KEY";

type BotsonicContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

export const botsonicActionHandlers: Record<BotsonicActionName, ProviderRuntimeHandler<BotsonicContext>> = {
  async generate_response(input, context) {
    return asRecord(
      await requestBotsonic({
        path: "/v1/business/botsonic",
        method: "POST",
        context,
        body: compactObject({
          input_text: input.input_text,
          chat_id: input.chat_id,
          source: input.source,
          starter_question_id: input.starter_question_id,
          user_unique_identifier: input.user_unique_identifier,
          chat_history: input.chat_history,
          response_type: input.response_type,
          chat_user_id: input.chat_user_id,
          extra_metadata: input.extra_metadata,
          full_history: input.full_history,
          message_id: input.message_id,
          timeout: input.timeout,
        }),
      }),
    );
  },
  async list_faqs(input, context) {
    return asRecord(
      await requestBotsonic({
        path: botsonicValidationPath,
        method: "GET",
        context,
        query: [
          ["search_query", input.search_query],
          ["sort_by", input.sort_by],
          ["sort_order", input.sort_order],
          ["page", input.page],
          ["size", input.size],
        ],
      }),
    );
  },
  async list_conversations(input, context) {
    return asRecord(
      await requestBotsonic({
        path: "/v1/business/bot-data/conversations/all",
        method: "GET",
        context,
        query: [
          ["search_query", input.search_query],
          ["sort_by", input.sort_by],
          ["sort_order", input.sort_order],
          ["updated_after", input.updated_after],
          ["updated_before", input.updated_before],
          ["page", input.page],
          ["size", input.size],
        ],
      }),
    );
  },
  async get_conversation(input, context) {
    return asRecord(
      await requestBotsonic({
        path: `/v1/business/bot-data/conversations/${encodeURIComponent(String(input.chat_id))}`,
        method: "GET",
        context,
      }),
    );
  },
};

export async function validateBotsonicCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const trimmedApiKey = optionalString(apiKey);
  if (!trimmedApiKey) {
    throw new ProviderRequestError(400, "apiKey is required");
  }
  await requestBotsonic({
    path: botsonicValidationPath,
    method: "GET",
    context: { apiKey: trimmedApiKey, fetcher, signal },
    query: [
      ["page", 1],
      ["size", 1],
    ],
    phase: "validate",
  });
  return {
    profile: {
      accountId: "botsonic-api-token",
      displayName: "Botsonic Bot API Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: botsonicApiBaseUrl,
      authHeader: botsonicAuthHeader,
      validationEndpoint: botsonicValidationPath,
    },
  };
}

async function requestBotsonic(input: {
  path: string;
  method: "GET" | "POST";
  context: BotsonicContext;
  query?: Array<[string, unknown]>;
  body?: unknown;
  phase?: "validate" | "execute";
}): Promise<unknown> {
  const url = new URL(`${botsonicApiBaseUrl}${input.path}`);
  for (const [key, value] of input.query ?? []) {
    appendQueryValue(url, key, value);
  }

  let response: Response;
  try {
    response = await input.context.fetcher(url.toString(), {
      method: input.method,
      headers: buildBotsonicHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Botsonic request failed: ${error.message}` : "Botsonic request failed",
    );
  }

  const payload = await readBotsonicPayload(response);
  if (!response.ok) {
    throw mapBotsonicHttpError(response.status, payload, input.phase ?? "execute");
  }
  return payload;
}

function buildBotsonicHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    [botsonicAuthHeader]: apiKey,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readBotsonicPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Botsonic returned invalid JSON: ${error.message}` : "Botsonic returned invalid JSON",
    );
  }
}

function mapBotsonicHttpError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = extractBotsonicErrorMessage(payload) ?? `Botsonic request failed with ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function extractBotsonicErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  if (typeof record.detail === "string") {
    return record.detail;
  }
  if (Array.isArray(record.detail)) {
    const messages = record.detail
      .map((item) => optionalString(optionalRecord(item)?.msg))
      .filter((message) => message !== undefined);
    if (messages.length > 0) {
      return messages.join("; ");
    }
  }
  if (typeof record.message === "string") {
    return record.message;
  }
  if (typeof record.error === "string") {
    return record.error;
  }
  const errorRecord = optionalRecord(record.error);
  return optionalString(errorRecord?.message);
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  url.searchParams.set(key, String(value));
}

function asRecord(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "Botsonic returned a non-object response");
  }
  return record;
}
