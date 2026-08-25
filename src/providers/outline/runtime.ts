import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  nullableString,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const outlineCloudApiBaseUrl = "https://app.getoutline.com/api";

type OutlineRequestPhase = "validate" | "execute";
type OutlineActionHandler = (input: Record<string, unknown>, context: OutlineActionContext) => Promise<unknown>;

interface OutlineActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface OutlineRequestOptions {
  path: string;
  apiKey: string;
  apiBaseUrl: string;
  fetcher: ProviderFetch;
  phase: OutlineRequestPhase;
  signal?: AbortSignal;
  body?: Record<string, unknown>;
}

interface OutlineNavigationNode {
  id: string;
  title: string;
  url: string;
  children: OutlineNavigationNode[];
}

export const outlineActionHandlers: ProviderActionHandlers<"outline", OutlineActionHandler> = {
  list_collections(input: Record<string, unknown>, context: OutlineActionContext): Promise<unknown> {
    return listCollections(input, context);
  },
  get_collection(input: Record<string, unknown>, context: OutlineActionContext): Promise<unknown> {
    return getCollection(input, context);
  },
  list_collection_documents(input: Record<string, unknown>, context: OutlineActionContext): Promise<unknown> {
    return listCollectionDocuments(input, context);
  },
  list_documents(input: Record<string, unknown>, context: OutlineActionContext): Promise<unknown> {
    return listDocuments(input, context);
  },
  search_documents(input: Record<string, unknown>, context: OutlineActionContext): Promise<unknown> {
    return searchDocuments(input, context);
  },
  get_document(input: Record<string, unknown>, context: OutlineActionContext): Promise<unknown> {
    return getDocument(input, context);
  },
};

export async function validateOutlineCredential(
  input: { apiKey: string; baseUrl?: unknown },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
  const apiBaseUrl = normalizeOutlineBaseUrl(input.baseUrl);
  const payload = await requestOutlineJson({
    path: "/auth.info",
    apiKey,
    apiBaseUrl,
    fetcher,
    signal,
    phase: "validate",
  });

  const data = requireResponseObject(readData(payload), "auth.info.data");
  const user = requireResponseObject(data.user, "auth.info.data.user");
  const team = requireResponseObject(data.team, "auth.info.data.team");
  const userId = requireResponseString(user.id, "auth.info.data.user.id");
  const userName = optionalString(user.name);
  const userEmail = optionalString(user.email);
  const teamId = requireResponseString(team.id, "auth.info.data.team.id");
  const teamName = optionalString(team.name);
  const teamUrl = optionalString(team.url);

  return {
    profile: {
      accountId: userId,
      displayName: userName ?? userEmail ?? "Outline API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      baseUrl: apiBaseUrl,
      validationEndpoint: "/auth.info",
      userId,
      userEmail,
      teamId,
      teamName,
      teamUrl,
    }),
  };
}

function listCollections(input: Record<string, unknown>, context: OutlineActionContext) {
  return requestOutlineJson({
    path: "/collections.list",
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    body: compactObject({
      query: optionalString(input.query),
      statusFilter: readOptionalStringArray(input.statusFilter),
      sort: optionalString(input.sort),
      direction: optionalString(input.direction),
      offset: optionalInteger(input.offset),
      limit: optionalInteger(input.limit),
    }),
  }).then((payload) => ({
    collections: requireResponseObjectArray(readData(payload), "collections.list.data").map((item) =>
      normalizeCollection(item),
    ),
    pagination: normalizePagination(payload),
  }));
}

function getCollection(input: Record<string, unknown>, context: OutlineActionContext) {
  return requestOutlineJson({
    path: "/collections.info",
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    body: {
      id: requireInputString(input.id, "id"),
    },
  }).then((payload) => ({
    collection: normalizeCollection(requireResponseObject(readData(payload), "collections.info.data")),
  }));
}

function listCollectionDocuments(input: Record<string, unknown>, context: OutlineActionContext) {
  return requestOutlineJson({
    path: "/collections.documents",
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    body: {
      id: requireInputString(input.id, "id"),
    },
  }).then((payload) => ({
    tree: requireResponseObjectArray(readData(payload), "collections.documents.data").map((item) =>
      normalizeNavigationNode(item, "tree[]"),
    ),
  }));
}

function listDocuments(input: Record<string, unknown>, context: OutlineActionContext) {
  return requestOutlineJson({
    path: "/documents.list",
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    body: compactObject({
      offset: optionalInteger(input.offset),
      limit: optionalInteger(input.limit),
      sort: optionalString(input.sort),
      direction: optionalString(input.direction),
      collectionId: optionalString(input.collectionId),
      userId: optionalString(input.userId),
      backlinkDocumentId: optionalString(input.backlinkDocumentId),
      parentDocumentId: optionalString(input.parentDocumentId),
      statusFilter: readOptionalStringArray(input.statusFilter),
    }),
  }).then((payload) => ({
    documents: requireResponseObjectArray(readData(payload), "documents.list.data").map((item) =>
      normalizeDocument(item),
    ),
    pagination: normalizePagination(payload),
  }));
}

function searchDocuments(input: Record<string, unknown>, context: OutlineActionContext) {
  return requestOutlineJson({
    path: "/documents.search",
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    body: compactObject({
      query: requireInputString(input.query, "query"),
      offset: optionalInteger(input.offset),
      limit: optionalInteger(input.limit),
      userId: optionalString(input.userId),
      collectionId: optionalString(input.collectionId),
      documentId: optionalString(input.documentId),
      statusFilter: readOptionalStringArray(input.statusFilter),
      dateFilter: optionalString(input.dateFilter),
      shareId: optionalString(input.shareId),
      snippetMinWords: optionalInteger(input.snippetMinWords),
      snippetMaxWords: optionalInteger(input.snippetMaxWords),
      sort: optionalString(input.sort),
      direction: optionalString(input.direction),
    }),
  }).then((payload) => ({
    documents: requireResponseObjectArray(readData(payload), "documents.search.data").map((item) =>
      normalizeDocument(item),
    ),
    pagination: normalizePagination(payload),
  }));
}

function getDocument(input: Record<string, unknown>, context: OutlineActionContext) {
  const id = optionalString(input.id);
  const shareId = optionalString(input.shareId);
  if (!id && !shareId) {
    throw new ProviderRequestError(400, "Provide at least one of id or shareId.");
  }

  return requestOutlineJson({
    path: "/documents.info",
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    body: compactObject({
      id,
      shareId,
    }),
  }).then((payload) => ({
    document: normalizeDocument(requireResponseObject(readData(payload), "documents.info.data")),
  }));
}

async function requestOutlineJson(options: OutlineRequestOptions): Promise<unknown> {
  const url = new URL(normalizeOutlinePath(options.path), `${options.apiBaseUrl}/`);

  let response: Response;
  try {
    response = await options.fetcher(url, {
      method: "POST",
      headers: buildOutlineHeaders(options.apiKey),
      body: JSON.stringify(options.body ?? {}),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `outline request failed: ${error.message}` : "outline request failed",
    );
  }

  const payload = await readOutlinePayload(response, { tolerateInvalidJson: !response.ok });
  if (!response.ok) {
    throw createOutlineError(response.status, payload, options.phase);
  }

  return payload;
}

function buildOutlineHeaders(apiKey: string) {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readOutlinePayload(response: Response, options: { tolerateInvalidJson: boolean }): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (options.tolerateInvalidJson) {
      return { message: text.trim() };
    }

    throw new ProviderRequestError(502, "outline returned invalid JSON");
  }
}

function createOutlineError(status: number, payload: unknown, phase: OutlineRequestPhase): ProviderRequestError {
  const message = readOutlineErrorMessage(payload) ?? `outline request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }

  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function readOutlineErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const direct = optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.status);
  return direct;
}

function normalizeCollection(input: Record<string, unknown>) {
  return compactObject({
    id: requireResponseString(input.id, "collection.id"),
    urlId: nullableString(input.urlId),
    name: requireResponseString(input.name, "collection.name"),
    description: nullableString(input.description),
    sort: normalizeCollectionSort(input.sort),
    index: nullableString(input.index),
    color: nullableString(input.color),
    icon: nullableString(input.icon),
    permission: nullableString(input.permission),
    sharing: readNullableBoolean(input.sharing),
    createdAt: nullableString(input.createdAt),
    updatedAt: nullableString(input.updatedAt),
    archivedAt: nullableString(input.archivedAt),
    deletedAt: nullableString(input.deletedAt),
    raw: input,
  });
}

function normalizeCollectionSort(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  const field = optionalString(record.field);
  const direction = optionalString(record.direction);
  if (!field || !direction) {
    return undefined;
  }

  return {
    field,
    direction,
  };
}

function normalizeDocument(input: Record<string, unknown>) {
  return compactObject({
    id: requireResponseString(input.id, "document.id"),
    collectionId: nullableString(input.collectionId),
    parentDocumentId: nullableString(input.parentDocumentId),
    title: requireResponseString(input.title, "document.title"),
    fullWidth: readNullableBoolean(input.fullWidth),
    emoji: nullableString(input.emoji),
    text: nullableString(input.text),
    urlId: nullableString(input.urlId),
    pinned: readNullableBoolean(input.pinned),
    templateId: nullableString(input.templateId),
    revision: optionalInteger(input.revision),
    createdAt: nullableString(input.createdAt),
    createdBy: normalizeOptionalUser(input.createdBy),
    updatedAt: nullableString(input.updatedAt),
    updatedBy: normalizeOptionalUser(input.updatedBy),
    publishedAt: nullableString(input.publishedAt),
    dataAttributes: normalizeOptionalDataAttributes(input.dataAttributes),
    archivedAt: nullableString(input.archivedAt),
    deletedAt: nullableString(input.deletedAt),
    raw: input,
  });
}

function normalizeOptionalUser(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  const id = optionalString(record.id);
  const name = optionalString(record.name);
  if (!id && !name) {
    return undefined;
  }

  return compactObject({
    id,
    name,
    avatarUrl: nullableString(record.avatarUrl),
    email: nullableString(record.email),
    role: nullableString(record.role),
    isSuspended: readNullableBoolean(record.isSuspended),
    lastActiveAt: nullableString(record.lastActiveAt),
    createdAt: nullableString(record.createdAt),
  });
}

function normalizeOptionalDataAttributes(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) =>
      compactObject({
        dataAttributeId: requireResponseString(item.dataAttributeId, "document.dataAttributes[].dataAttributeId"),
        value: item.value,
        updatedAt: nullableString(item.updatedAt),
      }),
    );
}

function normalizePagination(payload: unknown) {
  const record = optionalRecord(payload);
  const pagination = optionalRecord(record?.pagination);
  return {
    offset: optionalInteger(pagination?.offset) ?? 0,
    limit: optionalInteger(pagination?.limit) ?? 0,
  };
}

function normalizeNavigationNode(input: Record<string, unknown>, label: string): OutlineNavigationNode {
  return {
    id: requireResponseString(input.id, `${label}.id`),
    title: requireResponseString(input.title, `${label}.title`),
    url: requireResponseString(input.url, `${label}.url`),
    children: Array.isArray(input.children)
      ? input.children
          .map((child) => optionalRecord(child))
          .filter((child): child is Record<string, unknown> => Boolean(child))
          .map((child) => normalizeNavigationNode(child, `${label}.children[]`))
      : [],
  };
}

function readData(payload: unknown) {
  const record = optionalRecord(payload);
  if (!record || !("data" in record)) {
    throw new ProviderRequestError(502, "outline response did not include data", payload);
  }

  return record.data;
}

export function normalizeOutlineBaseUrl(value: unknown): string {
  const candidate = optionalString(value) ?? outlineCloudApiBaseUrl;
  const parsed = assertPublicHttpUrl(candidate, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (parsed.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must use https");
  }
  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");

  const normalized = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  return normalized.endsWith("/api") ? normalized : `${normalized}/api`;
}

function normalizeOutlinePath(path: string) {
  return path.replace(/^\/+/, "");
}

function requireResponseObject(value: unknown, label: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `outline ${label} was not an object`, value);
  }

  return record;
}

function requireResponseObjectArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `outline ${label} was not an array`, value);
  }

  return value.map((item, index) => requireResponseObject(item, `${label}[${index}]`));
}

function requireInputString(value: unknown, fieldName: string) {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requireResponseString(value: unknown, fieldName: string) {
  return requiredString(
    value,
    fieldName,
    () => new ProviderRequestError(502, `outline response did not include ${fieldName}`),
  );
}

function readOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const result = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return result.length > 0 ? result : undefined;
}

function readNullableBoolean(value: unknown) {
  if (value === null) {
    return null;
  }

  return optionalBoolean(value);
}
