import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const trentChatApiBaseUrl = "https://chat.trent.ai";
const trentChatPath = "/v1/chat";
const trentRenewalUrl = "https://app.trent.ai/api-keys/renew?client=openclaw";
const trentDefaultRequestTimeoutMs = 300_000;
const trentClientInfo = {
  client_type: "oomol-connect",
  client_version: "1.0",
};

type TrentRequestPhase = "validate" | "execute";

export const trentActionHandlers: ProviderActionHandlers<"trent", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  send_chat(input, context) {
    return sendTrentChat(input, context);
  },
};

export async function validateTrentCredential(apiKey: string): Promise<CredentialValidationResult> {
  requiredString(apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  return {
    profile: {
      accountId: "trent-api-key",
      displayName: "Trent API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: trentChatApiBaseUrl,
      validationMode: "local_non_empty_key",
      renewalUrl: trentRenewalUrl,
    },
  };
}

async function sendTrentChat(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = compactObject({
    message: requiredString(input.message, "message", (message) => new ProviderRequestError(400, message)),
    context: optionalString(input.context),
    thread_id: optionalString(input.thread_id),
    stream: true,
    client_info: normalizeClientInfo(input.client_info),
  });

  return requestTrentChatJson({
    apiKey: context.apiKey,
    body: payload,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
}

async function requestTrentChatJson(input: {
  apiKey: string;
  body: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: TrentRequestPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, trentDefaultRequestTimeoutMs);
  let response: Response;
  let text: string;
  try {
    response = await input.fetcher(new URL(trentChatPath, trentChatApiBaseUrl), {
      method: "POST",
      headers: {
        accept: "text/event-stream, application/json",
        authorization: input.apiKey,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(input.body),
      signal: timeout.signal,
    });
    text = await response.text();
  } catch (error) {
    const message = error instanceof Error ? `Trent request failed: ${error.message}` : "Trent request failed";
    throw new ProviderRequestError(timeout.didTimeout() || isAbortLikeError(error) ? 504 : 502, message);
  } finally {
    timeout.cleanup();
  }

  const expirationWarning = extractExpirationWarning(response.headers);
  if (!response.ok) {
    throw createTrentError(response, text, input.phase, expirationWarning);
  }

  return normalizeTrentChatResponse(text, response.headers, expirationWarning);
}

function normalizeTrentChatResponse(text: string, headers: Headers, expirationWarning: string | null): unknown {
  const contentType = (headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("text/event-stream") || looksLikeSsePayload(text)) {
    return normalizeSsePayload(text, expirationWarning);
  }

  const payload = parseJsonMaybe(text);
  const record = optionalRecord(payload);
  if (record) {
    return {
      content: readContent(record) ?? text,
      thread_id: optionalString(record.thread_id) ?? null,
      expiration_warning: expirationWarning,
      raw: [record],
    };
  }

  return {
    content: text,
    thread_id: null,
    expiration_warning: expirationWarning,
    raw: [],
  };
}

function looksLikeSsePayload(text: string): boolean {
  for (const rawLine of text.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith("data:")) {
      return true;
    }
  }
  return false;
}

function normalizeSsePayload(text: string, expirationWarning: string | null): Record<string, unknown> {
  const chunks: string[] = [];
  const raw: unknown[] = [];
  let threadId: string | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line.startsWith("data:")) {
      continue;
    }

    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") {
      continue;
    }

    const parsed = parseJsonMaybe(data);
    if (parsed === undefined) {
      continue;
    }

    raw.push(parsed);
    const record = optionalRecord(parsed);
    if (!record) {
      continue;
    }

    const chunk = readContent(record);
    if (chunk) {
      chunks.push(chunk);
    }
    const nextThreadId = optionalString(record.thread_id);
    if (nextThreadId) {
      threadId = nextThreadId;
    }
  }

  return {
    content: chunks.join(""),
    thread_id: threadId,
    expiration_warning: expirationWarning,
    raw,
  };
}

function readContent(record: Record<string, unknown>): string | undefined {
  const direct = optionalString(record.content);
  if (direct !== undefined) {
    return direct;
  }

  const delta = optionalRecord(record.delta);
  if (delta) {
    return optionalString(delta.content);
  }

  return undefined;
}

function normalizeClientInfo(value: unknown): Record<string, string> {
  const record = optionalRecord(value);
  if (!record) {
    return trentClientInfo;
  }

  return {
    ...trentClientInfo,
    ...compactObject({
      client_type: optionalString(record.client_type),
      client_version: optionalString(record.client_version),
    }),
  };
}

function extractExpirationWarning(headers: Headers): string | null {
  const guidance = headers.get("x-trent-api-key-expired-key-guidance");
  if (guidance) {
    return `Trent API key has expired. Renew at: ${isTrustedTrentUrl(guidance) ? guidance : trentRenewalUrl}`;
  }

  const expiresIn = headers.get("x-trent-api-key-expires-in");
  if (!expiresIn) {
    return null;
  }

  const seconds = Number.parseInt(expiresIn, 10);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 7 * 86400) {
    return null;
  }

  const days = Math.max(1, Math.floor(seconds / 86400));
  return `Trent API key expires in ${days} day(s). Renew at ${trentRenewalUrl}`;
}

function isTrustedTrentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.hostname === "trent.ai" || url.hostname.endsWith(".trent.ai"))
    );
  } catch {
    return false;
  }
}

function createTrentError(
  response: Response,
  text: string,
  phase: TrentRequestPhase,
  expirationWarning: string | null,
): ProviderRequestError {
  const message = extractTrentErrorMessage(text) ?? response.statusText ?? "Trent request failed";
  const details = expirationWarning ? { expirationWarning } : undefined;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, details);
  }

  if (response.status === 429) {
    return new ProviderRequestError(429, message, details);
  }

  return new ProviderRequestError(response.status || 502, message, details);
}

function extractTrentErrorMessage(text: string): string | undefined {
  const record = optionalRecord(parseJsonMaybe(text));
  if (record) {
    return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
  }

  return text.trim() || undefined;
}

function parseJsonMaybe(text: string): unknown {
  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
