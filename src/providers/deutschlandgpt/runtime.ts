import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

export const deutschlandgptApiBaseUrl = "https://api.deutschlandgpt.de/v2";

export const deutschlandgptActionHandlers: ProviderActionHandlers<
  "deutschlandgpt",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  list_models(_input, context) {
    return request("/models", "GET", undefined, context);
  },
  create_chat_completion(input, context) {
    validateChatInput(input);
    return request("/chat/completions", "POST", compactObject(input), context);
  },
  create_embeddings(input, context) {
    return request("/embeddings", "POST", compactObject(input), context);
  },
};

export async function validateDeutschlandgptCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await request("/models", "GET", undefined, { apiKey, fetcher, signal }, true);
  const record = requiredRecord(payload, "models response");
  if (!Array.isArray(record.data)) throw new ProviderRequestError(502, "DeutschlandGPT response missing models data");
  return {
    profile: { accountId: `deutschlandgpt:${apiKey.slice(-8)}`, displayName: "DeutschlandGPT API Key" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: deutschlandgptApiBaseUrl,
      availableModels: record.data.flatMap((item) => {
        const model = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
        return typeof model.id === "string" ? [model.id] : [];
      }),
    },
  };
}

async function request(
  path: string,
  method: string,
  body: Record<string, unknown> | undefined,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  validating = false,
): Promise<unknown> {
  const response = await context.fetcher(`${deutschlandgptApiBaseUrl}${path}`, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) throw mapError(response.status, payload, validating);
  return payload;
}

function validateChatInput(input: Record<string, unknown>): void {
  if (input.stream === true) throw new ProviderRequestError(400, "stream=true is not supported");
  if (!Array.isArray(input.messages)) return;
  for (const item of input.messages) {
    const message = requiredRecord(item, "message");
    const hasText = typeof message.content === "string";
    const hasToolCalls = message.role === "assistant" && Array.isArray(message.tool_calls);
    if (!hasText && !hasToolCalls)
      throw new ProviderRequestError(400, "message content is required unless an assistant requests tools");
    if (message.role === "tool" && typeof message.tool_call_id !== "string") {
      throw new ProviderRequestError(400, "tool messages require tool_call_id");
    }
  }
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ProviderRequestError(502, `Invalid ${label}`);
  return value as Record<string, unknown>;
}

function mapError(status: number, payload: unknown, validating: boolean): ProviderRequestError {
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : undefined;
  const nested =
    record?.error && typeof record.error === "object" && !Array.isArray(record.error)
      ? (record.error as Record<string, unknown>)
      : undefined;
  const message =
    typeof payload === "string"
      ? payload
      : typeof record?.error === "string"
        ? record.error
        : typeof nested?.message === "string"
          ? nested.message
          : typeof record?.message === "string"
            ? record.message
            : `DeutschlandGPT request failed with HTTP ${status}`;
  if ((status === 401 || status === 403) && validating) return new ProviderRequestError(400, message);
  return new ProviderRequestError(status, message);
}
