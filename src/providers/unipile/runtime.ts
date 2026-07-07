import type { CredentialValidationResult } from "../../core/types.ts";
import type { UnipileActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const unipileValidationPath = "/api/v1/accounts";
const unipileRequestTimeoutMs = 30_000;

type UnipileRequestPhase = "validate" | "execute";
type UnipileActionHandler = (input: Record<string, unknown>, context: UnipileActionContext) => Promise<unknown>;

interface UnipileActionContext {
  dsn: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface UnipileRequestInput {
  dsn: string;
  apiKey: string;
  path: string;
  query?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: UnipileRequestPhase;
}

interface UnipileListPayload {
  object: string | null;
  cursor: string | null;
  items: unknown[];
  raw: Record<string, unknown>;
}

export const unipileActionHandlers: Record<UnipileActionName, UnipileActionHandler> = {
  async list_accounts(input, context) {
    return normalizeListAccounts(
      await requestUnipileJson({
        ...context,
        path: "/api/v1/accounts",
        query: buildPaginationQuery(input),
        phase: "execute",
      }),
    );
  },
  async get_account(input, context) {
    return {
      account: normalizeAccount(
        await requestUnipileJson({
          ...context,
          path: `/api/v1/accounts/${encodeURIComponent(readRequiredInputString(input.accountId, "accountId"))}`,
          phase: "execute",
        }),
      ),
    };
  },
  async list_chats(input, context) {
    return normalizeListChats(
      await requestUnipileJson({
        ...context,
        path: "/api/v1/chats",
        query: buildChatListQuery(input),
        phase: "execute",
      }),
    );
  },
  async get_chat(input, context) {
    return {
      chat: normalizeChat(
        await requestUnipileJson({
          ...context,
          path: `/api/v1/chats/${encodeURIComponent(readRequiredInputString(input.chatId, "chatId"))}`,
          query: compactObject({
            account_id: optionalString(input.accountId),
          }),
          phase: "execute",
        }),
      ),
    };
  },
  async list_chat_messages(input, context) {
    return normalizeListMessages(
      await requestUnipileJson({
        ...context,
        path: `/api/v1/chats/${encodeURIComponent(readRequiredInputString(input.chatId, "chatId"))}/messages`,
        query: buildMessageListQuery(input),
        phase: "execute",
      }),
    );
  },
  async get_message(input, context) {
    return {
      message: normalizeMessage(
        await requestUnipileJson({
          ...context,
          path: `/api/v1/messages/${encodeURIComponent(readRequiredInputString(input.messageId, "messageId"))}`,
          phase: "execute",
        }),
      ),
    };
  },
};

export async function validateUnipileCredential(
  input: { apiKey: string; dsn?: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const dsn = normalizeUnipileDsn(input.dsn);
  const payload = await requestUnipileJson({
    dsn,
    apiKey: input.apiKey,
    path: unipileValidationPath,
    query: { limit: "1" },
    fetcher,
    signal,
    phase: "validate",
  });
  const listPayload = normalizeListPayload(payload);

  return {
    profile: {
      accountId: buildUnipileProviderAccountId(dsn, input.apiKey),
      displayName: buildUnipileAccountLabel(dsn),
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: buildUnipileBaseUrl(dsn),
      dsn,
      validationEndpoint: `${unipileValidationPath}?limit=1`,
      accountCountSampled: listPayload.items.length,
    },
  };
}

async function requestUnipileJson(input: UnipileRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, unipileRequestTimeoutMs);
  try {
    const response = await input.fetcher(buildUnipileUrl(input.dsn, input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-API-KEY": input.apiKey,
      },
      signal: timeout.signal,
    });
    const payload = await readUnipilePayload(response);
    handleUnipileError(response, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Unipile request timed out");
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "Unipile request failed");
  } finally {
    timeout.cleanup();
  }
}

function buildUnipileUrl(dsn: string, path: string, query?: Record<string, unknown>): URL {
  const url = new URL(path, buildUnipileBaseUrl(dsn));
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

export function buildUnipileBaseUrl(dsn: string): string {
  return `https://${normalizeUnipileDsn(dsn)}`;
}

function normalizeUnipileDsn(value: unknown): string {
  const raw = optionalString(value);
  if (!raw) {
    throw new ProviderRequestError(400, "dsn is required");
  }

  const withoutProtocol = raw.replace("https://", "").replace("http://", "");
  const host = withoutProtocol.split("/")[0]?.trim().toLowerCase();
  if (!host || host.includes(" ") || host.includes("?")) {
    throw new ProviderRequestError(400, "dsn must be a valid Unipile host");
  }
  return host;
}

function buildUnipileProviderAccountId(dsn: string, apiKey: string): string {
  const digest = createHash("sha256").update(`${dsn}:${apiKey}`).digest("hex").slice(0, 16);
  return `unipile:${dsn}:${digest}`;
}

function buildUnipileAccountLabel(dsn: string): string {
  return `Unipile ${dsn}`;
}

async function readUnipilePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Unipile returned malformed JSON");
    }
    return text;
  }
}

function handleUnipileError(response: Response, payload: unknown, phase: UnipileRequestPhase): void {
  if (response.ok) {
    return;
  }

  const message = extractUnipileErrorMessage(payload) ?? response.statusText ?? "Unipile request failed";
  if (response.status === 429) {
    throw new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && [401, 403].includes(response.status)) {
    throw new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && [401, 403].includes(response.status)) {
    throw new ProviderRequestError(401, message, payload);
  }
  throw new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function extractUnipileErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  for (const key of ["message", "detail", "error", "title"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }
  const nestedError = optionalRecord(record.error);
  return optionalString(nestedError?.message);
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    cursor: optionalString(input.cursor),
    limit: stringifyOptionalInteger(input.limit),
  });
}

function buildChatListQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    unread: optionalBoolean(input.unread),
    cursor: optionalString(input.cursor),
    before: optionalString(input.before),
    after: optionalString(input.after),
    limit: stringifyOptionalInteger(input.limit),
    account_type: optionalString(input.accountType),
    account_id: optionalString(input.accountId),
  });
}

function buildMessageListQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    cursor: optionalString(input.cursor),
    before: optionalString(input.before),
    after: optionalString(input.after),
    limit: stringifyOptionalInteger(input.limit),
    sender_id: optionalString(input.senderId),
  });
}

function stringifyOptionalInteger(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return String(value);
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return normalized;
}

function normalizeListPayload(payload: unknown): UnipileListPayload {
  const record = optionalRecord(payload);
  if (!record || !Array.isArray(record.items)) {
    throw new ProviderRequestError(502, "Unipile returned invalid list response", payload);
  }
  return {
    object: optionalString(record.object) ?? null,
    cursor: optionalString(record.cursor) ?? null,
    items: record.items,
    raw: record,
  };
}

function normalizeListAccounts(payload: unknown): Record<string, unknown> {
  const list = normalizeListPayload(payload);
  return {
    pageInfo: {
      object: list.object,
      cursor: list.cursor,
    },
    accounts: list.items.map(normalizeAccount),
    raw: list.raw,
  };
}

function normalizeListChats(payload: unknown): Record<string, unknown> {
  const list = normalizeListPayload(payload);
  return {
    pageInfo: {
      object: list.object,
      cursor: list.cursor,
    },
    chats: list.items.map(normalizeChat),
    raw: list.raw,
  };
}

function normalizeListMessages(payload: unknown): Record<string, unknown> {
  const list = normalizeListPayload(payload);
  return {
    pageInfo: {
      object: list.object,
      cursor: list.cursor,
    },
    messages: list.items.map(normalizeMessage),
    raw: list.raw,
  };
}

function normalizeAccount(value: unknown): Record<string, unknown> {
  const record = requireObject(value, "Unipile returned invalid account response");
  return {
    id: readNormalizedId(record, "id"),
    type: nullableString(record.type),
    name: nullableString(record.name),
    status: nullableString(record.status),
    createdAt: nullableString(record.created_at),
    raw: record,
  };
}

function normalizeChat(value: unknown): Record<string, unknown> {
  const record = requireObject(value, "Unipile returned invalid chat response");
  return {
    id: readNormalizedId(record, "id"),
    accountId: nullableString(record.account_id),
    accountType: nullableString(record.account_type),
    providerId: nullableString(record.provider_id),
    name: nullableString(record.name),
    unreadCount: nullableNumber(record.unread_count),
    timestamp: nullableString(record.timestamp),
    raw: record,
  };
}

function normalizeMessage(value: unknown): Record<string, unknown> {
  const record = requireObject(value, "Unipile returned invalid message response");
  return {
    id: readNormalizedId(record, "message_id"),
    providerId: nullableString(record.provider_id),
    chatId: nullableString(record.chat_id),
    senderId: nullableString(record.sender_id),
    text: nullableString(record.text),
    timestamp: nullableString(record.timestamp),
    attachments: Array.isArray(record.attachments)
      ? record.attachments
          .map((item) => optionalRecord(item))
          .filter((item): item is Record<string, unknown> => Boolean(item))
      : [],
    raw: record,
  };
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message, value);
  }
  return record;
}

function readNormalizedId(record: Record<string, unknown>, key: string): string {
  const value = optionalString(record[key]);
  if (!value) {
    throw new ProviderRequestError(502, `Unipile response is missing ${key}`, record);
  }
  return value;
}

function nullableString(value: unknown): string | null {
  return optionalString(value) ?? null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}
