import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers, OAuthProviderContext } from "../provider-runtime.ts";

import {
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import {
  defineOAuthProviderExecutors,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  readProviderJsonBody,
  readTransitFileInput,
} from "../provider-runtime.ts";

const boxApiBaseUrl = "https://api.box.com/2.0";
const boxUploadBaseUrl = "https://upload.box.com/api/2.0";
const boxSimpleUploadMaxBytes = 50 * 1024 * 1024;
const boxItemFields = [
  "id",
  "type",
  "name",
  "etag",
  "sequence_id",
  "description",
  "size",
  "parent",
  "path_collection",
  "shared_link",
  "created_at",
  "modified_at",
].join(",");

type ActionHandler = (input: Record<string, unknown>, context: OAuthProviderContext) => Promise<unknown>;

export const boxActionHandlers: ProviderActionHandlers<"box", ActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  get_file(input, context) {
    return getItem("files", requireId(input.fileId, "fileId"), context);
  },
  get_folder(input, context) {
    return getItem("folders", requireId(input.folderId, "folderId"), context);
  },
  list_folder_items(input, context) {
    return listFolderItems(input, context, false);
  },
  list_folder_items_continue(input, context) {
    return listFolderItems(input, context, true);
  },
  search(input, context) {
    return search(input, context);
  },
  download_file(input, context) {
    return downloadFile(input, context);
  },
  create_folder(input, context) {
    return createFolder(input, context);
  },
  upload_file(input, context) {
    return uploadFile(input, context);
  },
  update_file(input, context) {
    return updateItem("files", input, context);
  },
  update_folder(input, context) {
    return updateItem("folders", input, context);
  },
  delete_file(input, context) {
    return deleteItem("files", input, context);
  },
  delete_folder(input, context) {
    return deleteItem("folders", input, context);
  },
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors("box", boxActionHandlers);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const user = await getCurrentUser({ accessToken: input.accessToken, fetcher });
    return {
      profile: {
        accountId: user.id,
        displayName: user.name,
      },
      metadata: {
        login: user.login,
      },
    };
  },
};

interface BoxRequestContext {
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface BoxUser {
  id: string;
  type: "user";
  name: string;
  login: string;
  status?: string;
  spaceAmount?: number;
  spaceUsed?: number;
  maxUploadSize?: number;
}

async function getCurrentUser(context: BoxRequestContext): Promise<BoxUser> {
  const payload = await boxJsonRequest("/users/me", context);
  return {
    id: requiredString(payload.id, "Box user id", providerResponseError),
    type: "user",
    name: requiredString(payload.name, "Box user name", providerResponseError),
    login: requiredString(payload.login, "Box user login", providerResponseError),
    status: optionalString(payload.status),
    spaceAmount: optionalNumber(payload.space_amount),
    spaceUsed: optionalNumber(payload.space_used),
    maxUploadSize: optionalNumber(payload.max_upload_size),
  };
}

async function getItem(
  resource: "files" | "folders",
  id: string,
  context: BoxRequestContext,
): Promise<{ item: Record<string, unknown> }> {
  const payload = await boxJsonRequest(`/${resource}/${encodeURIComponent(id)}`, context);
  return { item: normalizeItem(payload) };
}

async function listFolderItems(
  input: Record<string, unknown>,
  context: BoxRequestContext,
  continuation: boolean,
): Promise<Record<string, unknown>> {
  const folderId = requireId(input.folderId, "folderId");
  const url = new URL(`${boxApiBaseUrl}/folders/${encodeURIComponent(folderId)}/items`);
  const marker = optionalString(input.marker);
  const useMarker = continuation || marker != null || optionalBoolean(input.useMarker) === true;
  setQuery(url, "usemarker", useMarker ? true : undefined);
  setQuery(url, "marker", marker);
  setQuery(url, "offset", useMarker ? undefined : optionalNumber(input.offset));
  setQuery(url, "limit", optionalNumber(input.limit));
  setQuery(url, "sort", optionalString(input.sort));
  setQuery(url, "direction", optionalString(input.direction));
  setQuery(url, "fields", boxItemFields);

  const payload = await boxJsonRequest(url, context);
  return normalizeItemPage(payload);
}

async function search(input: Record<string, unknown>, context: BoxRequestContext): Promise<Record<string, unknown>> {
  const url = new URL(`${boxApiBaseUrl}/search`);
  setQuery(url, "query", requiredString(input.query, "query", providerInputError));
  setQuery(url, "type", optionalString(input.type));
  setQuery(url, "ancestor_folder_ids", commaSeparated(input.ancestorFolderIds));
  setQuery(url, "file_extensions", commaSeparated(input.fileExtensions));
  setQuery(url, "content_types", commaSeparated(input.contentTypes));
  setQuery(url, "limit", optionalNumber(input.limit));
  setQuery(url, "offset", optionalNumber(input.offset));
  setQuery(url, "sort", optionalString(input.sort));
  setQuery(url, "direction", optionalString(input.direction));
  setQuery(url, "fields", boxItemFields);

  const payload = await boxJsonRequest(url, context);
  const page = normalizeItemPage(payload);
  const offset = optionalNumber(page.offset) ?? 0;
  const limit = optionalNumber(page.limit) ?? 0;
  const totalCount = optionalNumber(page.totalCount) ?? 0;
  return {
    entries: page.entries,
    limit,
    offset,
    totalCount,
    nextOffset: offset + limit < totalCount ? offset + limit : null,
  };
}

async function downloadFile(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<Record<string, unknown>> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "box download_file requires local transit file storage");
  }

  const fileId = requireId(input.fileId, "fileId");
  const { item } = await getItem("files", fileId, context);
  const name = optionalString(input.fileName) ?? requiredString(item.name, "Box file name", providerResponseError);
  const reportedSize = optionalNumber(item.sizeBytes);
  if (reportedSize != null && reportedSize > context.transitFiles.maxBytes) {
    throw new ProviderRequestError(413, `Box download exceeds ${context.transitFiles.maxBytes} bytes`);
  }

  const response = await boxRequest(`/files/${encodeURIComponent(fileId)}/content`, context);
  if (response.status === 202) {
    const retryAfter = response.headers.get("retry-after");
    throw new ProviderRequestError(
      503,
      retryAfter
        ? `Box file is not ready for download; retry after ${retryAfter} seconds`
        : "Box file is not ready for download; retry later",
      retryAfter ? { retryAfter } : undefined,
    );
  }
  if (!response.ok) {
    throw await boxResponseError(response, "Box file download failed");
  }
  const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: context.transitFiles.maxBytes,
    fieldName: "Box download",
    createError: (message) => new ProviderRequestError(413, message),
  });
  const file = await context.transitFiles.create(new File([Uint8Array.from(bytes)], name, { type: mimeType }));
  return { item, file };
}

async function createFolder(
  input: Record<string, unknown>,
  context: BoxRequestContext,
): Promise<{ item: Record<string, unknown> }> {
  const payload = await boxJsonRequest("/folders", context, {
    method: "POST",
    body: JSON.stringify({
      name: requiredString(input.name, "name", providerInputError),
      parent: { id: requireId(input.parentFolderId, "parentFolderId") },
    }),
  });
  return { item: normalizeItem(payload) };
}

async function uploadFile(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<{ item: Record<string, unknown> }> {
  const source = await readTransitFileInput(input.file, context);
  if (source.sizeBytes > boxSimpleUploadMaxBytes) {
    throw new ProviderRequestError(413, "box upload_file only supports files up to 50 MB");
  }

  const attributes: Record<string, unknown> = {
    name: requiredString(input.name, "name", providerInputError),
    parent: { id: requireId(input.parentFolderId, "parentFolderId") },
  };
  const contentCreatedAt = optionalString(input.contentCreatedAt);
  const contentModifiedAt = optionalString(input.contentModifiedAt);
  if (contentCreatedAt) attributes.content_created_at = contentCreatedAt;
  if (contentModifiedAt) attributes.content_modified_at = contentModifiedAt;

  const body = new FormData();
  body.append("attributes", JSON.stringify(attributes));
  body.append("file", source.file, source.name);
  const payload = await boxJsonRequest(new URL(`${boxUploadBaseUrl}/files/content`), context, {
    method: "POST",
    body,
  });
  const entries = readObjectArray(payload.entries);
  const item = entries[0];
  if (!item) throw providerResponseError("Box upload response did not include a file");
  return { item: normalizeItem(item) };
}

async function updateItem(
  resource: "files" | "folders",
  input: Record<string, unknown>,
  context: BoxRequestContext,
): Promise<{ item: Record<string, unknown> }> {
  const key = resource === "files" ? "fileId" : "folderId";
  const id = requireId(input[key], key);
  const body: Record<string, unknown> = {};
  const name = optionalString(input.name);
  const description = typeof input.description === "string" ? input.description : undefined;
  const parentFolderId = optionalString(input.parentFolderId);
  if (name) body.name = name;
  if (description != null) body.description = description;
  if (parentFolderId) body.parent = { id: parentFolderId };
  if (Object.keys(body).length === 0) {
    throw new ProviderRequestError(400, `box ${key === "fileId" ? "update_file" : "update_folder"} requires a change`);
  }

  const headers = new Headers();
  const etag = optionalString(input.etag);
  if (etag) headers.set("if-match", etag);
  const payload = await boxJsonRequest(`/${resource}/${encodeURIComponent(id)}`, context, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  return { item: normalizeItem(payload) };
}

async function deleteItem(
  resource: "files" | "folders",
  input: Record<string, unknown>,
  context: BoxRequestContext,
): Promise<Record<string, unknown>> {
  const key = resource === "files" ? "fileId" : "folderId";
  const id = requireId(input[key], key);
  const url = new URL(`${boxApiBaseUrl}/${resource}/${encodeURIComponent(id)}`);
  const recursive = resource === "folders" ? optionalBoolean(input.recursive) : undefined;
  if (resource === "folders") setQuery(url, "recursive", recursive);
  const headers = new Headers();
  const etag = optionalString(input.etag);
  if (etag) headers.set("if-match", etag);
  const response = await boxRequest(url, context, { method: "DELETE", headers });
  if (resource === "folders" && recursive === true && response.status === 503) {
    return {
      deleted: false,
      folderId: id,
      status: "in_progress",
      retryAfter: response.headers.get("retry-after"),
    };
  }
  if (!response.ok) throw await boxResponseError(response, `Box ${resource.slice(0, -1)} deletion failed`);
  return resource === "folders"
    ? { deleted: true, folderId: id, status: "deleted", retryAfter: null }
    : { deleted: true, fileId: id };
}

async function boxJsonRequest(
  path: string | URL,
  context: BoxRequestContext,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const response = await boxRequest(path, context, init);
  if (!response.ok) throw await boxResponseError(response, "Box request failed");
  const payload = await readProviderJsonBody(response, {
    emptyBody: {},
    invalidJsonMessage: "Box returned invalid JSON",
  });
  return requiredRecord(payload, "Box response", providerResponseError);
}

function boxRequest(path: string | URL, context: BoxRequestContext, init: RequestInit = {}): Promise<Response> {
  const url = typeof path === "string" ? `${boxApiBaseUrl}${path}` : path;
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${context.accessToken}`);
  headers.set("accept", "application/json");
  if (init.body != null && typeof init.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return context.fetcher(url, { ...init, headers, signal: context.signal });
}

async function boxResponseError(response: Response, fallback: string): Promise<ProviderRequestError> {
  const payload = await readProviderJsonBody(response, {
    emptyBody: {},
    invalidJsonMessage: `${fallback} with HTTP ${response.status}`,
    invalidJsonFallback: () => ({}),
  });
  const record = optionalRecord(payload) ?? {};
  const code = optionalString(record.code);
  const message = optionalString(record.message);
  const suffix = [code, message].filter(Boolean).join(": ");
  const retryAfter = response.status === 429 || response.status === 503 ? response.headers.get("retry-after") : null;
  const details = retryAfter ? { ...record, retryAfter } : record;
  return new ProviderRequestError(
    response.status >= 500 ? 502 : response.status,
    suffix ? `${fallback}: ${suffix}` : `${fallback} with HTTP ${response.status}`,
    details,
  );
}

function normalizeItem(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    ...payload,
    id: requiredString(payload.id, "Box item id", providerResponseError),
    type: requiredString(payload.type, "Box item type", providerResponseError),
    name: requiredString(payload.name, "Box item name", providerResponseError),
    etag: optionalString(payload.etag) ?? null,
    sequenceId: optionalString(payload.sequence_id) ?? null,
    description: typeof payload.description === "string" ? payload.description : null,
    sizeBytes: optionalNumber(payload.size) ?? null,
    parent: optionalRecord(payload.parent) ?? null,
    pathCollection: optionalRecord(payload.path_collection) ?? null,
    sharedLink: optionalRecord(payload.shared_link) ?? null,
    createdAt: optionalString(payload.created_at) ?? null,
    modifiedAt: optionalString(payload.modified_at) ?? null,
  };
}

function normalizeItemPage(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    entries: readObjectArray(payload.entries).map(normalizeItem),
    limit: optionalNumber(payload.limit) ?? 0,
    offset: optionalNumber(payload.offset),
    totalCount: optionalNumber(payload.total_count),
    nextMarker: optionalString(payload.next_marker) ?? null,
    previousMarker: optionalString(payload.prev_marker) ?? null,
  };
}

function readObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => requiredRecord(item, `Box entries[${index}]`, providerResponseError));
}

function commaSeparated(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.map((item) => optionalString(item)).filter((item): item is string => item != null);
  return values.length > 0 ? values.join(",") : undefined;
}

function setQuery(url: URL, name: string, value: string | number | boolean | undefined): void {
  if (value != null) url.searchParams.set(name, String(value));
}

function requireId(value: unknown, name: string): string {
  return requiredString(value, name, providerInputError);
}
