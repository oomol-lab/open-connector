import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { looseArray, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { compactJson, queryParams } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "readwise";
const readwiseApiBaseUrl = "https://readwise.io/api";
const validationPath = "/v2/auth/";

type ReadwiseActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const readwiseActionHandlers: ProviderActionHandlers<"readwise", ReadwiseActionHandler> = {
  async create_highlights(input, context) {
    const payload = await requestReadwiseJson({
      path: "/v2/highlights/",
      method: "POST",
      body: { highlights: input.highlights },
      context,
      mode: "execute",
    });
    const books = looseArray(payload);
    return {
      books: books.map(normalizeBook),
      raw: books,
    };
  },
  async export_highlights(input, context) {
    const payload = await requestReadwiseJson({
      path: "/v2/export/",
      query: queryParams({
        updatedAfter: optionalString(input.updatedAfter),
        pageCursor: optionalString(input.pageCursor),
      }),
      context,
      mode: "execute",
    });
    const record = requireRecord(payload, "Readwise returned an invalid export response");
    return {
      count: optionalInteger(record.count) ?? null,
      nextPageCursor: optionalString(record.nextPageCursor) ?? null,
      books: looseArray(record.results).map(normalizeBook),
      raw: record,
    };
  },
  async list_books(input, context) {
    const payload = await requestReadwiseJson({
      path: "/v2/books/",
      query: queryParams({
        page: optionalInteger(input.page),
        page_size: optionalInteger(input.pageSize),
        category: optionalString(input.category),
        updated__gt: optionalString(input.updatedAfter),
        updated__lt: optionalString(input.updatedBefore),
      }),
      context,
      mode: "execute",
    });
    const record = requireRecord(payload, "Readwise returned an invalid books response");
    return {
      count: optionalInteger(record.count) ?? null,
      next: optionalString(record.next) ?? null,
      previous: optionalString(record.previous) ?? null,
      books: looseArray(record.results).map(normalizeBook),
      raw: record,
    };
  },
  async list_documents(input, context) {
    const payload = await requestReadwiseJson({
      path: "/v3/list/",
      query: queryParams({
        pageCursor: optionalString(input.pageCursor),
        updatedAfter: optionalString(input.updatedAfter),
        location: optionalString(input.location),
        category: optionalString(input.category),
        tag: optionalString(input.tag),
      }),
      context,
      mode: "execute",
    });
    const record = requireRecord(payload, "Readwise returned an invalid document list");
    return {
      count: optionalInteger(record.count) ?? null,
      nextPageCursor: optionalString(record.nextPageCursor) ?? null,
      documents: looseArray(record.results).map(normalizeDocument),
      raw: record,
    };
  },
  async save_document(input, context) {
    const payload = await requestReadwiseJson({
      path: "/v3/save/",
      method: "POST",
      body: compactJson({
        url: requiredInputString(input.url, "url"),
        title: optionalString(input.title),
        author: optionalString(input.author),
        summary: optionalString(input.summary),
        should_clean_html: typeof input.shouldCleanHtml === "boolean" ? input.shouldCleanHtml : undefined,
        saved_using: optionalString(input.savedUsing),
        tags: Array.isArray(input.tags) ? input.tags : undefined,
      }),
      context,
      mode: "execute",
    });
    const record = requireRecord(payload, "Readwise returned an invalid save response");
    return {
      document: normalizeDocument(readDocumentRecord(record)),
      raw: record,
    };
  },
  async update_document(input, context) {
    const documentId = requiredInputString(input.documentId, "documentId");
    const payload = await requestReadwiseJson({
      path: `/v3/update/${encodeURIComponent(documentId)}/`,
      method: "PATCH",
      body: compactJson({
        location: optionalString(input.location),
        title: optionalString(input.title),
        author: optionalString(input.author),
        summary: optionalString(input.summary),
        tags: Array.isArray(input.tags) ? input.tags : undefined,
      }),
      context,
      mode: "execute",
    });
    const record = requireRecord(payload, "Readwise returned an invalid update response");
    return {
      document: normalizeDocument(readDocumentRecord(record)),
      raw: record,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, readwiseActionHandlers);

export async function validateReadwiseCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  await requestReadwiseJson({
    path: validationPath,
    context: { apiKey, fetcher, signal },
    mode: "validate",
  });
  return {
    profile: {
      accountId: "readwise-api-key",
      displayName: "Readwise API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: readwiseApiBaseUrl,
      validationEndpoint: validationPath,
    },
  };
}

export const credentialValidators = {
  apiKey(
    input: { apiKey: string },
    { fetcher, signal }: { fetcher: typeof fetch; signal?: AbortSignal },
  ): Promise<CredentialValidationResult> {
    return validateReadwiseCredential(input, fetcher, signal);
  },
};

async function requestReadwiseJson(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  mode: "validate" | "execute";
  method?: "GET" | "POST" | "PATCH";
  query?: Record<string, string>;
  body?: unknown;
}): Promise<unknown> {
  const url = new URL(input.path.replace(/^\/+/, ""), `${readwiseApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Token ${input.context.apiKey}`,
        ...(input.body !== undefined ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Readwise request failed: ${error.message}` : "Readwise request failed",
    );
  }

  const payload = await readReadwisePayload(response);
  if (!response.ok) {
    throw createReadwiseError(response.status, payload, input.mode);
  }
  return payload ?? {};
}

async function readReadwisePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Readwise returned invalid JSON");
  }
}

function createReadwiseError(status: number, payload: unknown, mode: "validate" | "execute"): ProviderRequestError {
  const message = extractReadwiseErrorMessage(payload) ?? `Readwise request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status === 401 || status === 403) {
    return new ProviderRequestError(
      mode === "validate" ? 401 : status,
      mode === "validate" ? "Readwise API key is invalid or unauthorized" : message,
      payload,
    );
  }
  if (status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status || 502, message, payload);
}

function extractReadwiseErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const detail = optionalString(record.detail);
  if (detail) return detail;
  const message = optionalString(record.message) ?? optionalString(record.error);
  if (message) return message;
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      const firstString = value.find((item) => typeof item === "string");
      if (typeof firstString === "string" && firstString.trim()) return firstString.trim();
    }
  }
  return undefined;
}

function normalizeHighlight(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    id: optionalInteger(record.id) ?? null,
    text: optionalString(record.text) ?? "",
    title: optionalString(record.title) ?? null,
    author: optionalString(record.author) ?? null,
    note: typeof record.note === "string" ? record.note : null,
    url: optionalString(record.url) ?? null,
    highlightedAt: optionalString(record.highlighted_at) ?? optionalString(record.highlightedAt) ?? null,
    updatedAt: optionalString(record.updated_at) ?? optionalString(record.updatedAt) ?? null,
    raw: record,
  };
}

function normalizeBook(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    id: optionalInteger(record.user_book_id) ?? optionalInteger(record.id) ?? null,
    title: optionalString(record.title) ?? null,
    author: optionalString(record.author) ?? null,
    category: optionalString(record.category) ?? null,
    source: optionalString(record.source) ?? null,
    numHighlights: optionalInteger(record.num_highlights) ?? optionalInteger(record.numHighlights) ?? null,
    updatedAt: optionalString(record.updated) ?? optionalString(record.updated_at) ?? null,
    highlights: looseArray(record.highlights).map(normalizeHighlight),
    raw: record,
  };
}

function normalizeDocument(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    id: optionalString(record.id) ?? optionalString(record.document_id) ?? null,
    url: optionalString(record.url) ?? null,
    sourceUrl: optionalString(record.source_url) ?? optionalString(record.sourceUrl) ?? null,
    title: optionalString(record.title) ?? null,
    author: optionalString(record.author) ?? null,
    category: optionalString(record.category) ?? null,
    location: optionalString(record.location) ?? null,
    tags: readStringArray(record.tags),
    createdAt: optionalString(record.created_at) ?? optionalString(record.createdAt) ?? null,
    updatedAt: optionalString(record.updated_at) ?? optionalString(record.updatedAt) ?? null,
    raw: record,
  };
}

function readDocumentRecord(payload: Record<string, unknown>): Record<string, unknown> {
  return (
    optionalRecord(payload.document) ??
    optionalRecord(payload.result) ??
    optionalRecord(payload.saved_document) ??
    payload
  );
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, message);
  return record;
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  const record = optionalRecord(value);
  return record ? Object.keys(record) : [];
}
