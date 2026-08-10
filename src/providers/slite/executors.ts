import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { SliteActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "slite";
const sliteApiBaseUrl = "https://api.slite.com";

type SliteRequestPhase = "validate" | "execute";
type SliteActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface SliteRequestOptions {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: SliteRequestPhase;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}

export const sliteActionHandlers: Record<SliteActionName, SliteActionHandler> = {
  list_notes: listNotes,
  get_note: getNote,
  create_note: createNote,
  update_note: updateNote,
  delete_note: deleteNote,
  search_notes: searchNotes,
  search_groups: searchGroups,
  get_group: getGroup,
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, sliteActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const profile = requiredRecord(
      await requestSliteJson({ path: "/v1/me", context: { apiKey: input.apiKey, fetcher, signal }, phase: "validate" }),
      "Slite profile",
    );
    const displayName = optionalString(profile.displayName);
    const email = optionalString(profile.email);
    const organizationName = optionalString(profile.organizationName);
    const organizationDomain = optionalString(profile.organizationDomain);

    return {
      profile: {
        accountId: email ?? organizationDomain ?? "api_key",
        displayName: displayName || email || "Slite API Key",
        grantedScopes: [],
      },
      grantedScopes: [],
      metadata: compactObject({
        email,
        organizationName,
        organizationDomain,
      }),
    };
  },
};

async function listNotes(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = requiredRecord(
    await requestSliteJson({
      path: "/v1/notes",
      context,
      phase: "execute",
      query: compactObject({
        ownerId: readOptionalTrimmedString(input.ownerId),
        parentNoteId: readOptionalTrimmedString(input.parentNoteId),
        orderBy: readOptionalTrimmedString(input.orderBy),
        cursor: readOptionalTrimmedString(input.cursor),
      }),
    }),
    "Slite notes response",
  );

  return {
    hasNextPage: requiredBoolean(payload.hasNextPage, "hasNextPage"),
    nextCursor: nullableString(payload.nextCursor),
    total: requiredNumber(payload.total, "total"),
    notes: requiredArray(payload.notes, "notes").map(normalizeNote),
  };
}

async function getNote(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const noteId = requiredInputString(input.noteId, "noteId");
  const payload = requiredRecord(
    await requestSliteJson({
      path: `/v1/notes/${encodeURIComponent(noteId)}`,
      context,
      phase: "execute",
      query: compactObject({ format: readOptionalTrimmedString(input.format) }),
    }),
    "Slite note",
  );

  return { ...normalizeNote(payload), content: requiredResponseString(payload.content, "content") };
}

async function createNote(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = requiredRecord(
    await requestSliteJson({
      path: "/v1/notes",
      context,
      phase: "execute",
      method: "POST",
      body: compactObject({
        title: requiredInputString(input.title, "title"),
        parentNoteId: readOptionalTrimmedString(input.parentNoteId),
        templateId: readOptionalTrimmedString(input.templateId),
        markdown: readOptionalTrimmedString(input.markdown),
        html: readOptionalTrimmedString(input.html),
        attributes: readOptionalNullableStringArray(input.attributes),
      }),
    }),
    "Slite created note",
  );

  return normalizeNote(payload);
}

async function updateNote(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const noteId = requiredInputString(input.noteId, "noteId");
  const body = compactObject({
    title: readOptionalTrimmedString(input.title),
    markdown: readOptionalTrimmedString(input.markdown),
    html: readOptionalTrimmedString(input.html),
    attributes: readOptionalNullableStringArray(input.attributes),
  });
  if (Object.keys(body).length === 0) {
    throw new ProviderRequestError(400, "Provide at least one of title, markdown, html, or attributes.");
  }

  const payload = requiredRecord(
    await requestSliteJson({
      path: `/v1/notes/${encodeURIComponent(noteId)}`,
      context,
      phase: "execute",
      method: "PUT",
      body,
    }),
    "Slite updated note",
  );

  return normalizeNote(payload);
}

async function deleteNote(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const noteId = requiredInputString(input.noteId, "noteId");
  await requestSliteJson({
    path: `/v1/notes/${encodeURIComponent(noteId)}`,
    context,
    phase: "execute",
    method: "DELETE",
  });
  return { success: true };
}

async function searchNotes(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = requiredRecord(
    await requestSliteJson({
      path: "/v1/search-notes",
      context,
      phase: "execute",
      query: compactObject({
        query: readOptionalTrimmedString(input.query),
        parentNoteId: readOptionalTrimmedString(input.parentNoteId),
        depth: optionalNumber(input.depth),
        reviewState: readOptionalTrimmedString(input.reviewState),
        page: optionalNumber(input.page),
        hitsPerPage: optionalNumber(input.hitsPerPage),
        highlightPreTag: readOptionalTrimmedString(input.highlightPreTag),
        highlightPostTag: readOptionalTrimmedString(input.highlightPostTag),
        lastEditedAfter: readOptionalTrimmedString(input.lastEditedAfter),
        lastUpdatedAfter: readOptionalTrimmedString(input.lastUpdatedAfter),
        includeArchived: optionalBoolean(input.includeArchived),
      }),
    }),
    "Slite search response",
  );

  return {
    nbPages: requiredNumber(payload.nbPages, "nbPages"),
    page: requiredNumber(payload.page, "page"),
    hits: requiredArray(payload.hits, "hits").map(normalizeSearchHit),
  };
}

async function searchGroups(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = requiredRecord(
    await requestSliteJson({
      path: "/v1/groups",
      context,
      phase: "execute",
      query: compactObject({
        query: requiredInputString(input.query, "query"),
        cursor: readOptionalTrimmedString(input.cursor),
      }),
    }),
    "Slite groups response",
  );

  return {
    groups: requiredArray(payload.groups, "groups").map(normalizeGroup),
    total: requiredNumber(payload.total, "total"),
    hasNextPage: requiredBoolean(payload.hasNextPage, "hasNextPage"),
    nextCursor: nullableString(payload.nextCursor),
  };
}

async function getGroup(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const groupId = requiredInputString(input.groupId, "groupId");
  return normalizeGroup(
    await requestSliteJson({
      path: `/v1/groups/${encodeURIComponent(groupId)}`,
      context,
      phase: "execute",
    }),
  );
}

async function requestSliteJson(options: SliteRequestOptions): Promise<unknown> {
  const url = new URL(options.path, sliteApiBaseUrl);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await options.context.fetcher(url, {
      method: options.method ?? "GET",
      headers: sliteHeaders(options.context.apiKey, options.body !== undefined),
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.context.signal,
    });
    payload = await readSlitePayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `slite request failed: ${error.message}` : "slite request failed",
    );
  }

  if (!response.ok) throw createSliteError(response.status, payload, options.phase);
  return response.status === 204 ? null : payload;
}

function sliteHeaders(apiKey: string, includeJsonContentType: boolean): Record<string, string> {
  return {
    "x-slite-api-key": apiKey,
    Accept: "application/json",
    "User-Agent": providerUserAgent,
    ...(includeJsonContentType ? { "Content-Type": "application/json" } : {}),
  };
}

async function readSlitePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "slite returned invalid JSON");
  }
}

function createSliteError(status: number, payload: unknown, phase: SliteRequestPhase): ProviderRequestError {
  const message = extractSliteErrorMessage(payload) ?? `slite request failed with ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status === 401) return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  if ([400, 404, 422].includes(status)) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message, payload);
}

function extractSliteErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const message = optionalString(record?.message);
  if (message) return message;
  const details = optionalRecord(record?.details);
  if (!details) return undefined;
  for (const value of Object.values(details)) {
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  }
  return undefined;
}

function normalizeNote(input: unknown): Record<string, unknown> {
  const note = requiredRecord(input, "Slite note");
  return {
    id: requiredResponseString(note.id, "id"),
    title: requiredResponseString(note.title, "title"),
    url: requiredResponseString(note.url, "url"),
    createdAt: requiredResponseString(note.createdAt, "createdAt"),
    updatedAt: requiredResponseString(note.updatedAt, "updatedAt"),
    lastEditedAt: requiredResponseString(note.lastEditedAt, "lastEditedAt"),
    parentNoteId: nullableString(note.parentNoteId),
    archivedAt: nullableString(note.archivedAt),
    attributes: optionalStringArray(note.attributes),
    columns: optionalStringArray(note.columns),
    iconColor: nullableString(note.iconColor),
    iconShape: nullableString(note.iconShape),
    owner: normalizeOwner(note.owner),
    reviewState: nullableString(note.reviewState),
  };
}

function normalizeOwner(input: unknown): Record<string, unknown> | null {
  if (input == null) return null;
  const owner = requiredRecord(input, "Slite owner");
  const userId = nullableString(owner.userId);
  const groupId = nullableString(owner.groupId);
  if (!userId && !groupId) throw new ProviderRequestError(502, "slite response missing owner id");
  return { userId, groupId };
}

function normalizeSearchHit(input: unknown): Record<string, unknown> {
  const hit = requiredRecord(input, "Slite search hit");
  return {
    id: requiredResponseString(hit.id, "id"),
    title: requiredResponseString(hit.title, "title"),
    type: requiredResponseString(hit.type, "type"),
    highlight: requiredResponseString(hit.highlight, "highlight"),
    updatedAt: requiredResponseString(hit.updatedAt, "updatedAt"),
    lastEditedAt: requiredResponseString(hit.lastEditedAt, "lastEditedAt"),
    archivedAt: nullableString(hit.archivedAt),
    iconColor: nullableString(hit.iconColor),
    iconShape: nullableString(hit.iconShape),
    parentNotes: requiredArray(hit.parentNotes, "parentNotes").map((entry) => {
      const parent = requiredRecord(entry, "parentNotes[]");
      return {
        id: requiredResponseString(parent.id, "parentNotes[].id"),
        title: requiredResponseString(parent.title, "parentNotes[].title"),
      };
    }),
    reviewState: nullableString(hit.reviewState),
  };
}

function normalizeGroup(input: unknown): Record<string, unknown> {
  const group = requiredRecord(input, "Slite group");
  return {
    id: requiredResponseString(group.id, "id"),
    name: requiredResponseString(group.name, "name"),
    description: requiredResponseString(group.description, "description"),
  };
}

function requiredInputString(value: unknown, fieldName: string): string {
  const parsed = readOptionalTrimmedString(value);
  if (!parsed) throw new ProviderRequestError(400, `${fieldName} is required`);
  return parsed;
}

function requiredResponseString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (parsed === undefined) throw new ProviderRequestError(502, `slite response missing ${fieldName}`);
  return parsed;
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  const parsed = optionalString(value);
  return parsed === "" ? undefined : parsed;
}

function readOptionalNullableStringArray(value: unknown): Array<string | null> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => {
    if (entry === null) return null;
    if (typeof entry !== "string") throw new ProviderRequestError(400, "attributes items must be strings or null");
    return entry.trim();
  });
}

function optionalStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((entry) => String(entry));
}

function nullableString(value: unknown): string | null {
  return value == null ? null : (optionalString(value) ?? null);
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${label} must be an object`);
  return record;
}

function requiredArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `slite response missing ${fieldName}`);
  return value;
}

function requiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number") throw new ProviderRequestError(502, `slite response missing ${fieldName}`);
  return value;
}

function requiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") throw new ProviderRequestError(502, `slite response missing ${fieldName}`);
  return value;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.slite.com",
  auth: { type: "api_key_header", name: "x-slite-api-key" },
});
