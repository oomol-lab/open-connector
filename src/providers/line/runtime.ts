import type { LineActionName } from "./actions.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface LineCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

export const lineApiBaseUrl = "https://api.line.me";

type LineRequestPhase = "validate" | "execute";

export async function validateLineCredential(apiKey: string, fetcher: typeof fetch): Promise<LineCredentialCheck> {
  const bot = await requestLineObject({
    apiKey,
    path: "/v2/bot/info",
    fetcher,
    phase: "validate",
  });
  const displayName = optionalString(bot.displayName);
  const userId = optionalString(bot.userId);

  return {
    accountLabel: displayName ?? "LINE Official Account",
    providerAccountId: userId,
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: lineApiBaseUrl,
      basicId: optionalString(bot.basicId),
    },
  };
}

export function executeLineAction(
  actionName: LineActionName,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  switch (actionName) {
    case "get_bot_info":
      return requestLineObject({
        apiKey,
        path: "/v2/bot/info",
        fetcher,
        phase: "execute",
      });
    case "get_profile":
      if (typeof input.userId === "string") input = { ...input, userId: input.userId.trim() };
      return requestLineObject({
        apiKey,
        path: `/v2/bot/profile/${encodeURIComponent(String(input.userId))}`,
        fetcher,
        phase: "execute",
      });
    case "send_push_text":
      if (typeof input.to === "string") input = { ...input, to: input.to.trim() };
      return sendLineText({
        apiKey,
        path: "/v2/bot/message/push",
        input,
        body: {
          to: input.to,
          messages: buildTextMessages(input.texts),
          notificationDisabled: input.notificationDisabled,
        },
        fetcher,
      });
    case "send_multicast_text":
      if (Array.isArray(input.to))
        input = { ...input, to: input.to.map((value) => (typeof value === "string" ? value.trim() : value)) };
      return sendLineText({
        apiKey,
        path: "/v2/bot/message/multicast",
        input,
        body: {
          to: input.to,
          messages: buildTextMessages(input.texts),
          notificationDisabled: input.notificationDisabled,
        },
        fetcher,
      });
    case "send_broadcast_text":
      return sendLineText({
        apiKey,
        path: "/v2/bot/message/broadcast",
        input,
        body: {
          messages: buildTextMessages(input.texts),
          notificationDisabled: input.notificationDisabled,
        },
        fetcher,
      });
  }
}

function buildTextMessages(value: unknown) {
  return Array.isArray(value) ? value.map((text) => ({ type: "text", text })) : [];
}

function sendLineText(input: {
  apiKey: string;
  path: string;
  input: Record<string, unknown>;
  body: Record<string, unknown>;
  fetcher: typeof fetch;
}) {
  const body = Object.fromEntries(Object.entries(input.body).filter(([, value]) => value !== undefined));
  const retryKey = optionalString(input.input.retryKey);

  return requestLineObject({
    apiKey: input.apiKey,
    path: input.path,
    method: "POST",
    body,
    retryKey,
    fetcher: input.fetcher,
    phase: "execute",
  });
}

async function requestLineObject(input: {
  apiKey: string;
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  retryKey?: string;
  fetcher: typeof fetch;
  phase: LineRequestPhase;
}) {
  const timeoutHandle = createProviderTimeout(undefined);

  try {
    const headers = new Headers({
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
      "user-agent": providerUserAgent,
    });
    if (input.body) {
      headers.set("content-type", "application/json");
    }
    if (input.retryKey) {
      headers.set("x-line-retry-key", input.retryKey);
    }

    const response = await input.fetcher(new URL(input.path, lineApiBaseUrl), {
      method: input.method ?? "GET",
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeoutHandle.signal,
    });
    const payload = await readLinePayload(response);
    if (!response.ok) {
      throw mapLineError(response, payload, input.phase);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ProviderRequestError(502, "LINE returned a non-object response");
    }
    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutHandle.didTimeout() || isAbortError(error)) {
      throw new ProviderRequestError(504, "LINE API request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `LINE API request failed: ${error.message}` : "LINE API request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

async function readLinePayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapLineError(response: Response, payload: unknown, phase: LineRequestPhase) {
  const message = extractLineErrorMessage(payload) ?? `LINE request failed with HTTP ${response.status}`;
  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status || 500, message);
}

function extractLineErrorMessage(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error);
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
