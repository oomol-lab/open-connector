import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "intelliprint";
const intelliprintApiBaseUrl = "https://api.intelliprint.net/v1";
const printsPath = "/prints";

type IntelliprintRequestPhase = "validate" | "execute";
type IntelliprintActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type IntelliprintActionHandler = (
  input: Record<string, unknown>,
  context: IntelliprintActionContext,
) => Promise<unknown>;

type IntelliprintOutputKey = "print" | "background" | "mailingList" | "recipient";

export const intelliprintActionHandlers: ProviderActionHandlers<"intelliprint", IntelliprintActionHandler> = {
  list_prints(input, context) {
    return listIntelliprintObjects(printsPath, buildPrintListQuery(input), context);
  },
  get_print(input, context) {
    return getIntelliprintObject(
      `${printsPath}/${encodePathSegment(readRequiredString(input.id, "id"))}`,
      "print",
      context,
    );
  },
  list_backgrounds(input, context) {
    return listIntelliprintObjects("/backgrounds", buildBackgroundListQuery(input), context);
  },
  get_background(input, context) {
    return getIntelliprintObject(
      `/backgrounds/${encodePathSegment(readRequiredString(input.id, "id"))}`,
      "background",
      context,
    );
  },
  list_mailing_lists(input, context) {
    return listIntelliprintObjects("/mailing_lists", buildMailingListQuery(input), context);
  },
  get_mailing_list(input, context) {
    return getIntelliprintObject(
      `/mailing_lists/${encodePathSegment(readRequiredString(input.id, "id"))}`,
      "mailingList",
      context,
    );
  },
  list_mailing_list_recipients(input, context) {
    const mailingListId = encodePathSegment(readRequiredString(input.mailingListId, "mailingListId"));
    return listIntelliprintObjects(
      `/mailing_lists/${mailingListId}/recipients`,
      buildRecipientListQuery(input),
      context,
    );
  },
  get_mailing_list_recipient(input, context) {
    const mailingListId = encodePathSegment(readRequiredString(input.mailingListId, "mailingListId"));
    const recipientId = encodePathSegment(readRequiredString(input.id, "id"));
    return getIntelliprintObject(`/mailing_lists/${mailingListId}/recipients/${recipientId}`, "recipient", context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, intelliprintActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await intelliprintGetJson(
      printsPath,
      new URLSearchParams([["limit", "1"]]),
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
    const list = optionalRecord(payload);
    const firstPrint = Array.isArray(list?.data) ? optionalRecord(list.data[0]) : undefined;

    return {
      profile: {
        accountId: "api_key",
        displayName: "Intelliprint API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: intelliprintApiBaseUrl,
        validationEndpoint: printsPath,
        totalAvailable: optionalInteger(list?.total_available),
        samplePrintId: optionalString(firstPrint?.id),
      }),
    };
  },
};

async function listIntelliprintObjects(
  path: string,
  query: URLSearchParams,
  context: IntelliprintActionContext,
): Promise<Record<string, unknown>> {
  const payload = await intelliprintGetJson(path, query, context, "execute");
  const record = readObject(payload, "Intelliprint list response must be an object");
  if (!Array.isArray(record.data)) {
    throw new ProviderRequestError(502, "Intelliprint data must be an array");
  }
  const data = record.data.map((item) => readObject(item));

  return {
    data,
    totalAvailable: readInteger(record.total_available, "total_available"),
    hasMore: readBoolean(record.has_more, "has_more"),
    raw: record,
  };
}

async function getIntelliprintObject(
  path: string,
  outputKey: IntelliprintOutputKey,
  context: IntelliprintActionContext,
): Promise<Record<string, unknown>> {
  const payload = await intelliprintGetJson(path, new URLSearchParams(), context, "execute");
  const record = readObject(payload, `Intelliprint ${outputKey} response must be an object`);

  return {
    [outputKey]: record,
    raw: record,
  };
}

async function intelliprintGetJson(
  path: string,
  query: URLSearchParams,
  context: IntelliprintActionContext,
  phase: IntelliprintRequestPhase,
): Promise<unknown> {
  const url = new URL(`${intelliprintApiBaseUrl}${path}`);
  for (const [key, value] of query.entries()) {
    url.searchParams.append(key, value);
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: intelliprintHeaders(context.apiKey),
      signal: context.signal,
    });
    payload = await readIntelliprintPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `intelliprint request failed: ${error.message}` : "intelliprint request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createIntelliprintError(response, payload, phase);
  }

  return payload;
}

function intelliprintHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: apiKey,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readIntelliprintPayload(response: Response): Promise<unknown> {
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

function createIntelliprintError(
  response: Response,
  payload: unknown,
  phase: IntelliprintRequestPhase,
): ProviderRequestError {
  const message = extractIntelliprintErrorMessage(payload) ?? response.statusText ?? "intelliprint request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }

  if (phase === "execute" && [400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractIntelliprintErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return optionalString(error?.message) ?? optionalString(record?.message) ?? optionalString(record?.error);
}

function buildPrintListQuery(input: Record<string, unknown>): URLSearchParams {
  const query = buildBaseListQuery(input);
  appendOptionalString(query, "sort_field", input.sortField);
  appendOptionalBoolean(query, "testmode", input.testmode);
  appendOptionalBoolean(query, "confirmed", input.confirmed);
  appendOptionalString(query, "type", input.type);
  appendOptionalString(query, "reference", input.reference);
  appendOptionalString(query, "letters.status", input.letterStatus);
  appendOptionalBoolean(query, "letters.returned.acknowledged", input.returnedAcknowledged);
  return query;
}

function buildBackgroundListQuery(input: Record<string, unknown>): URLSearchParams {
  const query = buildBaseListQuery(input);
  appendOptionalString(query, "sort_field", input.sortField);
  appendOptionalString(query, "team", input.team);
  return query;
}

function buildMailingListQuery(input: Record<string, unknown>): URLSearchParams {
  const query = buildBaseListQuery(input);
  appendOptionalString(query, "sort_field", input.sortField);
  return query;
}

function buildRecipientListQuery(input: Record<string, unknown>): URLSearchParams {
  const query = buildBaseListQuery(input);
  appendOptionalString(query, "sort_field", input.sortField);
  return query;
}

function buildBaseListQuery(input: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams();
  appendOptionalInteger(query, "limit", input.limit);
  appendOptionalInteger(query, "skip", input.skip);
  appendOptionalString(query, "sort_order", input.sortOrder);
  appendFields(query, input.fields);
  return query;
}

function appendFields(query: URLSearchParams, value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }

  for (const field of value) {
    appendOptionalString(query, "fields", field);
  }
}

function appendOptionalString(query: URLSearchParams, key: string, value: unknown): void {
  const trimmed = optionalString(value);
  if (trimmed) {
    query.append(key, trimmed);
  }
}

function appendOptionalInteger(query: URLSearchParams, key: string, value: unknown): void {
  const parsed = optionalInteger(value);
  if (parsed !== undefined) {
    query.append(key, String(parsed));
  }
}

function appendOptionalBoolean(query: URLSearchParams, key: string, value: unknown): void {
  const parsed = optionalBoolean(value);
  if (parsed !== undefined) {
    query.append(key, String(parsed));
  }
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }

  return text;
}

function readObject(value: unknown, message = "object response is required"): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }

  return record;
}

function readInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed !== undefined) {
    return parsed;
  }

  throw new ProviderRequestError(502, `Intelliprint ${fieldName} must be an integer`);
}

function readBoolean(value: unknown, fieldName: string): boolean {
  const parsed = optionalBoolean(value);
  if (parsed !== undefined) {
    return parsed;
  }

  throw new ProviderRequestError(502, `Intelliprint ${fieldName} must be a boolean`);
}
