import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "loomio";
const loomioApiBaseUrl = "https://www.loomio.com/api/b2";
const loomioGroupsPath = "/groups";
const loomioPollsPath = "/polls";

type LoomioRequestPhase = "validate" | "execute";
type LoomioActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const loomioActionHandlers: ProviderActionHandlers<"loomio", LoomioActionHandler> = {
  list_polls(input, context) {
    return listLoomioPolls(input, context);
  },
  get_poll(input, context) {
    return getLoomioPoll(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, loomioActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateLoomioCredential(input.apiKey, fetcher, signal);
  },
};

async function validateLoomioCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestLoomioJson({
    path: loomioGroupsPath,
    apiKey,
    fetcher,
    phase: "validate",
    signal,
  });

  const totalGroups = readGroupTotal(payload);
  return {
    profile: {
      accountId: "loomio-api-key",
      displayName: "Loomio API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: loomioApiBaseUrl,
      validationEndpoint: loomioGroupsPath,
      ...(totalGroups === undefined ? {} : { totalGroups }),
    },
  };
}

async function listLoomioPolls(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestLoomioJson({
    path: loomioPollsPath,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
    query: {
      group_id: readRequiredPositiveInteger(input.groupId, "groupId"),
      status: optionalString(input.status),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
      offset: readOptionalNonNegativeInteger(input.offset, "offset"),
    },
    signal: context.signal,
  });

  return normalizePollList(payload);
}

async function getLoomioPoll(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const pollIdOrKey = requiredString(input.pollIdOrKey, "pollIdOrKey", inputError);
  const payload = await requestLoomioJson({
    path: `${loomioPollsPath}/${encodeURIComponent(pollIdOrKey)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });

  return {
    poll: normalizePollDetail(payload),
  };
}

async function requestLoomioJson(input: {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: LoomioRequestPhase;
  query?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<unknown> {
  const url = new URL(`${loomioApiBaseUrl}${input.path}`);
  url.searchParams.set("api_key", input.apiKey);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: input.signal,
    });
    payload = await readLoomioPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `loomio request failed: ${error.message}` : "loomio request failed",
    );
  }

  if (!response.ok) {
    throw mapLoomioError(response.status, extractLoomioErrorMessage(payload), input.phase);
  }

  return payload;
}

async function readLoomioPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapLoomioError(status: number, message: string | undefined, phase: LoomioRequestPhase): ProviderRequestError {
  const normalizedMessage = message ?? `loomio request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, normalizedMessage);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, normalizedMessage);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(status === 422 ? 400 : status, normalizedMessage);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status, normalizedMessage);
}

function extractLoomioErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim().slice(0, 300);
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const errorValue = record.error;
  if (Array.isArray(errorValue)) {
    const firstMessage = errorValue.find((value) => typeof value === "string");
    if (typeof firstMessage === "string" && firstMessage.trim()) {
      return firstMessage.trim();
    }
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function normalizePollList(payload: unknown): Record<string, unknown> {
  const record = requireObjectPayload(payload, "loomio poll list");
  const polls = readArray(record.polls, "loomio poll list polls").map((item) => normalizePollSummary(item));
  const rawMeta = optionalRecord(record.meta) ?? null;

  return {
    polls,
    total: readMetaTotal(rawMeta, polls.length),
    rawMeta,
  };
}

function normalizePollDetail(payload: unknown): Record<string, unknown> {
  const record = requireObjectPayload(payload, "loomio poll detail");

  return {
    ...normalizePollBase(record),
    status: readNullableStringField(record, "status"),
    details: readNullableStringField(record, "details"),
    options: readOptions(record.options),
  };
}

function normalizePollSummary(payload: unknown): Record<string, unknown> {
  return normalizePollBase(requireObjectPayload(payload, "loomio poll summary"));
}

function normalizePollBase(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readRequiredPositiveInteger(record.id, "id"),
    key: readNullableStringField(record, "key"),
    title: readNullableStringField(record, "title"),
    pollType: readNullableStringField(record, "poll_type", "pollType"),
    groupId: readNullableIntegerField(record, "group_id", "groupId"),
    authorId: readNullableIntegerField(record, "author_id", "authorId"),
    discussionId: readNullableIntegerField(record, "discussion_id", "discussionId"),
    createdAt: readNullableStringField(record, "created_at", "createdAt"),
    closingAt: readNullableStringField(record, "closing_at", "closingAt"),
    closedAt: readNullableStringField(record, "closed_at", "closedAt"),
    currentOutcome: readNullableObjectField(record, "current_outcome", "currentOutcome"),
    raw: record,
  };
}

function readOptions(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = requireObjectPayload(item, "loomio poll option");
    return {
      id: readRequiredPositiveInteger(record.id, "id"),
      name: readNullableStringField(record, "name"),
      priority: readNullableIntegerField(record, "priority"),
      icon: readNullableStringField(record, "icon"),
      color: readNullableStringField(record, "color"),
      prompt: readNullableStringField(record, "prompt"),
      meaning: readNullableStringField(record, "meaning"),
      raw: record,
    };
  });
}

function readGroupTotal(payload: unknown): number | undefined {
  const record = requireObjectPayload(payload, "loomio group list");
  const meta = optionalRecord(record.meta);
  const total = meta ? optionalInteger(meta.total) : undefined;
  if (total !== undefined) {
    return total;
  }

  return Array.isArray(record.groups) ? record.groups.length : undefined;
}

function readMetaTotal(meta: Record<string, unknown> | null, fallback: number): number {
  const total = meta ? optionalInteger(meta.total) : undefined;
  return total ?? fallback;
}

function readArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`);
  }

  return value;
}

function requireObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} response must be a JSON object`);
  }

  return record;
}

function readRequiredPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed == null || parsed <= 0) {
    throw inputError(`${fieldName} must be a positive integer`);
  }

  return parsed;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }

  const parsed = optionalInteger(value);
  if (parsed == null || parsed <= 0) {
    throw inputError(`${fieldName} must be a positive integer`);
  }

  return parsed;
}

function readOptionalNonNegativeInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }

  const parsed = optionalInteger(value);
  if (parsed == null || parsed < 0) {
    throw inputError(`${fieldName} must be a non-negative integer`);
  }

  return parsed;
}

function readNullableStringField(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    if (!(key in record)) {
      continue;
    }

    const value = record[key];
    if (value === null) {
      return null;
    }
    if (typeof value === "string") {
      return value;
    }
  }

  return null;
}

function readNullableIntegerField(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    if (!(key in record)) {
      continue;
    }

    const parsed = optionalInteger(record[key]);
    if (parsed !== undefined) {
      return parsed;
    }
    if (record[key] === null) {
      return null;
    }
  }

  return null;
}

function readNullableObjectField(record: Record<string, unknown>, ...keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    if (!(key in record)) {
      continue;
    }

    if (record[key] === null) {
      return null;
    }

    const objectValue = optionalRecord(record[key]);
    if (objectValue) {
      return objectValue;
    }
  }

  return null;
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
