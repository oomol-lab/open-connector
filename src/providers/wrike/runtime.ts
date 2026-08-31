import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalRecord,
  optionalString,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const wrikeApiBaseUrl = "https://www.wrike.com/api/v4";

type WrikeRequestPhase = "validate" | "execute";
type WrikeActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface WrikeRequestOptions {
  apiKey: string;
  fetcher: ProviderFetch;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  phase: WrikeRequestPhase;
  query?: Record<string, unknown>;
  signal?: AbortSignal;
}

export const wrikeActionHandlers: ProviderActionHandlers<"wrike", WrikeActionHandler> = {
  list_contacts(input, context) {
    return executeListContacts(input, context);
  },
  list_folders(input, context) {
    return executeListFolders(input, context);
  },
  get_folders(input, context) {
    return executeGetFolders(input, context);
  },
  create_folder(input, context) {
    return executeCreateFolder(input, context);
  },
  list_tasks(input, context) {
    return executeListTasks(input, context);
  },
  get_tasks(input, context) {
    return executeGetTasks(input, context);
  },
  create_task(input, context) {
    return executeCreateTask(input, context);
  },
};

export async function validateWrikeCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await wrikeRequest({
    apiKey,
    fetcher,
    method: "GET",
    path: "/contacts",
    phase: "validate",
    query: { me: true },
    signal,
  });
  const contacts = readResponseArray(payload).map(normalizeContact);
  const contact = contacts.find((item) => item.me === true) ?? contacts[0];
  if (!contact) {
    throw new ProviderRequestError(400, "Wrike credential did not return a user");
  }

  const contactId = typeof contact.id === "string" && contact.id ? contact.id : undefined;
  const contactEmail = typeof contact.email === "string" && contact.email ? contact.email : undefined;
  const displayName =
    contactEmail ??
    [
      typeof contact.firstName === "string" ? contact.firstName : undefined,
      typeof contact.lastName === "string" ? contact.lastName : undefined,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  return {
    profile: {
      accountId: contactId ? `wrike:${contactId}` : undefined,
      displayName: displayName || contactId || "Wrike Access Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: wrikeApiBaseUrl,
      contactId,
      accountId: typeof contact.accountId === "string" ? contact.accountId : undefined,
      email: contactEmail,
      validationEndpoint: "/contacts?me=true",
    }),
  };
}

async function executeListContacts(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await wrikeRequest({
    ...requestContext(context),
    method: "GET",
    path: "/contacts",
    phase: "execute",
    query: buildQuery(input, ["me", "deleted", "active", "name", "emails", "types", "fields"]),
  });

  return normalizeListResponse(payload, "contacts", normalizeContact);
}

async function executeListFolders(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await wrikeRequest({
    ...requestContext(context),
    method: "GET",
    path: "/folders",
    phase: "execute",
    query: buildQuery(input, ["permalink", "descendants", "project", "deleted", "pageSize", "nextPageToken", "fields"]),
  });

  return normalizeListResponse(payload, "folders", normalizeFolder);
}

async function executeGetFolders(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const folderIds = requireStringArray(input.folderIds, "folderIds");
  const payload = await wrikeRequest({
    ...requestContext(context),
    method: "GET",
    path: `/folders/${encodeWrikeIdList(folderIds)}`,
    phase: "execute",
    query: buildQuery(input, ["withInvitations", "plainTextCustomFields", "fields"]),
  });

  return normalizeListResponse(payload, "folders", normalizeFolder);
}

async function executeCreateFolder(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const folderId = requiredString(input.folderId, "folderId", providerInputError);
  const payload = await wrikeRequest({
    ...requestContext(context),
    method: "POST",
    path: `/folders/${encodePathSegment(folderId)}/folders`,
    phase: "execute",
    query: buildQuery(input, ["title", "description", "shareds", "withInvitations", "fields"]),
  });

  return normalizeSingleResponse(payload, "folder", normalizeFolder);
}

async function executeListTasks(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await wrikeRequest({
    ...requestContext(context),
    method: "GET",
    path: "/tasks",
    phase: "execute",
    query: buildQuery(input, [
      "title",
      "status",
      "importance",
      "type",
      "limit",
      "sortField",
      "sortOrder",
      "nextPageToken",
      "authors",
      "responsibles",
      "fields",
    ]),
  });

  return normalizeListResponse(payload, "tasks", normalizeTask);
}

async function executeGetTasks(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const taskIds = requireStringArray(input.taskIds, "taskIds");
  const payload = await wrikeRequest({
    ...requestContext(context),
    method: "GET",
    path: `/tasks/${encodeWrikeIdList(taskIds)}`,
    phase: "execute",
    query: buildQuery(input, ["withInvitations", "plainTextCustomFields", "fields"]),
  });

  return normalizeListResponse(payload, "tasks", normalizeTask);
}

async function executeCreateTask(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const folderId = requiredString(input.folderId, "folderId", providerInputError);
  const payload = await wrikeRequest({
    ...requestContext(context),
    method: "POST",
    path: `/folders/${encodePathSegment(folderId)}/tasks`,
    phase: "execute",
    query: buildQuery(input, [
      "title",
      "description",
      "status",
      "importance",
      "responsibles",
      "parents",
      "superTasks",
      "followers",
      "follow",
      "fields",
    ]),
  });

  return normalizeSingleResponse(payload, "task", normalizeTask);
}

async function wrikeRequest(input: WrikeRequestOptions): Promise<Record<string, unknown>> {
  const url = new URL(`${wrikeApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryParam(url, key, value);
  }

  const timeout = createProviderTimeout(input.signal);
  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Wrike request timed out");
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(499, "Wrike request was cancelled");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Wrike request failed: ${error.message}` : "Wrike request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readWrikeJson(response);
  if (!response.ok) {
    throw mapWrikeError(response.status, payload, input.phase);
  }

  return readResponseObject(payload);
}

function appendQueryParam(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > 0) {
      url.searchParams.set(key, JSON.stringify(value));
    }
    return;
  }

  if (typeof value === "object") {
    url.searchParams.set(key, JSON.stringify(value));
    return;
  }

  url.searchParams.set(key, String(value));
}

function buildQuery(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, input[key]]));
}

function normalizeListResponse<T>(
  payload: Record<string, unknown>,
  outputKey: string,
  normalize: (value: Record<string, unknown>) => T,
): Record<string, unknown> {
  return compactObject({
    kind: optionalString(payload.kind) ?? outputKey,
    [outputKey]: readResponseArray(payload).map(normalize),
    nextPageToken: optionalString(payload.nextPageToken),
    raw: payload,
  });
}

function normalizeSingleResponse<T>(
  payload: Record<string, unknown>,
  outputKey: string,
  normalize: (value: Record<string, unknown>) => T,
): Record<string, unknown> {
  const item = readResponseArray(payload).map(normalize)[0];
  if (!item) {
    throw new ProviderRequestError(502, "Wrike returned an empty response");
  }

  return compactObject({
    kind: optionalString(payload.kind) ?? outputKey,
    [outputKey]: item,
    nextPageToken: optionalString(payload.nextPageToken),
    raw: payload,
  });
}

function normalizeContact(input: Record<string, unknown>): Record<string, unknown> {
  const profiles = objectArray(input.profiles, "profiles", providerResponseError);
  const firstProfile = profiles[0];
  return {
    id: optionalString(input.id) ?? null,
    firstName: optionalString(input.firstName) ?? null,
    lastName: optionalString(input.lastName) ?? null,
    type: optionalString(input.type) ?? null,
    email: optionalString(firstProfile?.email) ?? null,
    accountId: optionalString(firstProfile?.accountId) ?? null,
    timezone: optionalString(input.timezone) ?? null,
    locale: optionalString(input.locale) ?? null,
    deleted: optionalBoolean(input.deleted) ?? null,
    me: optionalBoolean(input.me) ?? null,
    raw: input,
  };
}

function normalizeFolder(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalString(input.id) ?? null,
    title: optionalString(input.title) ?? null,
    color: optionalString(input.color) ?? null,
    childIds: readStringArray(input.childIds),
    scope: optionalString(input.scope) ?? null,
    project: optionalRecord(input.project) ?? null,
    permalink: optionalString(input.permalink) ?? null,
    raw: input,
  };
}

function normalizeTask(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalString(input.id) ?? null,
    title: optionalString(input.title) ?? null,
    status: optionalString(input.status) ?? null,
    importance: optionalString(input.importance) ?? null,
    permalink: optionalString(input.permalink) ?? null,
    responsibleIds: readStringArray(input.responsibleIds),
    parentIds: readStringArray(input.parentIds),
    superTaskIds: readStringArray(input.superTaskIds),
    subTaskIds: readStringArray(input.subTaskIds),
    createdDate: optionalString(input.createdDate) ?? null,
    updatedDate: optionalString(input.updatedDate) ?? null,
    completedDate: optionalString(input.completedDate) ?? null,
    raw: input,
  };
}

function requestContext(context: ApiKeyProviderContext): Pick<WrikeRequestOptions, "apiKey" | "fetcher" | "signal"> {
  return {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
  };
}

function encodeWrikeIdList(ids: string[]): string {
  return ids.map((id) => encodePathSegment(id)).join(",");
}

function requireStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty array`);
  }

  return value.map((item, index) => requiredString(item, `${fieldName}[${index}]`, providerInputError));
}

function readResponseObject(value: unknown): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, "Wrike returned a non-object response");
  }
  return object;
}

function readResponseArray(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(payload.data)) {
    return [];
  }

  return payload.data.map((item) => optionalRecord(item)).filter((item) => item !== undefined);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return stringArray(value, "array item", providerResponseError)
    .map((item) => item.trim())
    .filter((item) => item);
}

async function readWrikeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Wrike returned invalid JSON");
  }
}

function mapWrikeError(status: number, payload: unknown, phase: WrikeRequestPhase): ProviderRequestError {
  const object = optionalRecord(payload);
  const description =
    optionalString(object?.errorDescription) ??
    optionalString(object?.error) ??
    `Wrike request failed with status ${status}`;

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, description, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, description, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, description, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, description, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status, description, payload);
}
