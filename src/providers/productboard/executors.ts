import type { ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "productboard";
const productboardApiBaseUrl = "https://api.productboard.com/v2";

type ProductboardQueryValue = string | number | boolean | readonly string[] | undefined;

type ProductboardActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const productboardActionHandlers: ProviderActionHandlers<"productboard", ProductboardActionHandler> = {
  list_entity_configurations: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    listPayload(
      { path: "/entities/configurations", query: { "type[]": readOptionalStringArray(input.types) } },
      context,
      "configurations",
    ),
  get_entity_configuration: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    singlePayload(
      { path: `/entities/configurations/${encodeURIComponent(requiredInputString(input.type, "type"))}` },
      context,
      "configuration",
    ),
  list_entities: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    listPayload(
      {
        path: "/entities",
        query: compactObject({
          pageCursor: optionalString(input.pageCursor),
          "type[]": readOptionalStringArray(input.types),
          "fields[]": readOptionalStringArray(input.fields),
          name: optionalString(input.name),
          "owner[id]": optionalString(input.ownerId),
          "owner[email]": optionalString(input.ownerEmail),
          "status[id]": optionalString(input.statusId),
          "status[name]": optionalString(input.statusName),
          archived: optionalBoolean(input.archived),
          "parent[id]": optionalString(input.parentId),
          "metadata[source][system]": optionalString(input.metadataSourceSystem),
          "metadata[source][recordId]": optionalString(input.metadataSourceRecordId),
        }),
      },
      context,
      "entities",
    ),
  get_entity: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    singlePayload(
      {
        path: `/entities/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
        query: { "fields[]": readOptionalStringArray(input.fields) },
      },
      context,
      "entity",
    ),
  list_note_configurations: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    listPayload(
      { path: "/notes/configurations", query: { "type[]": readOptionalStringArray(input.types) } },
      context,
      "configurations",
    ),
  get_note_configuration: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    singlePayload(
      { path: `/notes/configurations/${encodeURIComponent(requiredInputString(input.type, "type"))}` },
      context,
      "configuration",
    ),
  list_notes: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    listPayload(
      {
        path: "/notes",
        query: compactObject({
          pageCursor: optionalString(input.pageCursor),
          archived: optionalBoolean(input.archived),
          processed: optionalBoolean(input.processed),
          "type[]": readOptionalStringArray(input.types),
          "owner[id]": optionalString(input.ownerId),
          "owner[email]": optionalString(input.ownerEmail),
          "creator[id]": optionalString(input.creatorId),
          "creator[email]": optionalString(input.creatorEmail),
          "metadata[source][system]": optionalString(input.metadataSourceSystem),
          "metadata[source][recordId]": optionalString(input.metadataSourceRecordId),
          createdFrom: optionalString(input.createdFrom),
          createdTo: optionalString(input.createdTo),
          updatedFrom: optionalString(input.updatedFrom),
          updatedTo: optionalString(input.updatedTo),
          "fields[]": readOptionalStringArray(input.fields),
        }),
      },
      context,
      "notes",
    ),
  get_note: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    singlePayload(
      {
        path: `/notes/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
        query: { "fields[]": readOptionalStringArray(input.fields) },
      },
      context,
      "note",
    ),
  list_members: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    listPayload(
      {
        path: "/members",
        query: compactObject({
          pageCursor: optionalString(input.pageCursor),
          query: optionalString(input.query),
          "roles[]": readOptionalStringArray(input.roles),
          includeDisabled: optionalBoolean(input.includeDisabled),
          includeInvitationPending: optionalBoolean(input.includeInvitationPending),
        }),
      },
      context,
      "members",
    ),
  get_member: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    singlePayload({ path: `/members/${encodeURIComponent(requiredInputString(input.id, "id"))}` }, context, "member"),
  list_teams: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    listPayload(
      {
        path: "/teams",
        query: compactObject({
          pageCursor: optionalString(input.pageCursor),
          name: optionalString(input.name),
          handle: optionalString(input.handle),
          query: optionalString(input.query),
        }),
      },
      context,
      "teams",
    ),
  get_team: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    singlePayload({ path: `/teams/${encodeURIComponent(requiredInputString(input.id, "id"))}` }, context, "team"),
  list_team_members: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    listPayload(
      {
        path: `/teams/${encodeURIComponent(requiredInputString(input.teamId, "teamId"))}/members`,
        query: { pageCursor: optionalString(input.pageCursor) },
      },
      context,
      "members",
    ),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, productboardActionHandlers);

async function listPayload(
  input: { path: string; query?: Record<string, ProductboardQueryValue> },
  context: ApiKeyProviderContext,
  outputKey: string,
): Promise<Record<string, unknown>> {
  const payload = await productboardRequest(input, context, "execute");
  const record = readResponseObject(payload);
  if (!Array.isArray(record.data))
    throw new ProviderRequestError(502, "Productboard list response data must be an array", payload);
  const links = optionalRecord(record.links) ?? {};
  const nextPageUrl = optionalString(links.next) ?? null;
  return {
    [outputKey]: record.data.map(readItemObject),
    nextPageCursor: nextPageUrl ? extractPageCursor(nextPageUrl) : null,
    nextPageUrl,
    links,
  };
}

async function singlePayload(
  input: { path: string; query?: Record<string, ProductboardQueryValue> },
  context: ApiKeyProviderContext,
  outputKey: string,
): Promise<Record<string, unknown>> {
  const payload = await productboardRequest(input, context, "execute");
  const record = readResponseObject(payload);
  return { [outputKey]: readItemObject(Object.hasOwn(record, "data") ? record.data : payload) };
}

async function productboardRequest(
  input: { path: string; query?: Record<string, ProductboardQueryValue> },
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: "validate" | "execute",
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(buildProductboardUrl(input), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Productboard request failed: ${error.message}` : "Productboard request failed",
    );
  }
  const payload = await readJsonPayload(response);
  if (!response.ok) throw createProductboardError(response.status, payload, phase);
  return payload;
}

function buildProductboardUrl(input: { path: string; query?: Record<string, ProductboardQueryValue> }): string {
  const url = new URL(`${productboardApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Productboard returned invalid JSON");
  }
}

function createProductboardError(
  status: number,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = extractProductboardMessage(payload) ?? `Productboard request failed with ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && (status === 401 || status === 403))
    return new ProviderRequestError(401, message, payload);
  if (phase === "execute" && (status === 401 || status === 403)) return new ProviderRequestError(401, message, payload);
  if ([400, 404, 422].includes(status)) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message, payload);
}

function extractProductboardMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const record = optionalRecord(payload);
  const errors = record?.errors;
  if (Array.isArray(errors)) {
    for (const item of errors) {
      if (typeof item === "string" && item.trim()) return item.trim();
      const itemRecord = optionalRecord(item);
      const message = itemRecord
        ? [optionalString(itemRecord.title), optionalString(itemRecord.detail), optionalString(itemRecord.message)]
            .filter(Boolean)
            .join(": ")
        : "";
      if (message) return message;
    }
  }
  const errorObject = optionalRecord(record?.error);
  return (
    optionalString(errorObject?.message) ??
    optionalString(errorObject?.detail) ??
    optionalString(errorObject?.title) ??
    optionalString(record?.message) ??
    optionalString(record?.detail) ??
    optionalString(record?.title) ??
    optionalString(record?.error)
  );
}

function readResponseObject(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) throw new ProviderRequestError(502, "Productboard returned a non-object response", payload);
  return record;
}

function readItemObject(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, "Productboard response item must be an object", value);
  return record;
}

function extractPageCursor(nextPageUrl: string): string | null {
  try {
    return new URL(nextPageUrl).searchParams.get("pageCursor");
  } catch {
    return null;
  }
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ProviderRequestError(400, "string array input is required");
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}
