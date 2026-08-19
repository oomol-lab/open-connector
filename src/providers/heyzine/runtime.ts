import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  nullableString,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const heyzineApiBaseUrl = "https://heyzine.com";

type HeyzineRequestPhase = "validate" | "execute";
type HeyzineActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface HeyzineRequestInput {
  method: "GET" | "POST";
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: HeyzineRequestPhase;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
}

export const heyzineActionHandlers: ProviderActionHandlers<"heyzine", HeyzineActionHandler> = {
  list_flipbooks(_input, context) {
    return listFlipbooks(context);
  },
  get_flipbook(input, context) {
    return getFlipbook(input, context);
  },
  delete_flipbook(input, context) {
    return deleteFlipbook(input, context);
  },
  list_bookshelves(_input, context) {
    return listBookshelves(context);
  },
  list_bookshelf_flipbooks(input, context) {
    return listBookshelfFlipbooks(input, context);
  },
  add_flipbook_to_bookshelf(input, context) {
    return addFlipbookToBookshelf(input, context);
  },
  remove_flipbook_from_bookshelf(input, context) {
    return removeFlipbookFromBookshelf(input, context);
  },
  set_flipbook_social_data(input, context) {
    return setFlipbookSocialData(input, context);
  },
  set_bookshelf_social_data(input, context) {
    return setBookshelfSocialData(input, context);
  },
};

export async function validateHeyzineCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await heyzineRequest({
    method: "GET",
    path: "/api1/flipbook-list",
    apiKey: input.apiKey,
    fetcher: options.fetcher,
    signal: options.signal,
    phase: "validate",
  });
  const flipbooks = expectArray(payload, "malformed Heyzine flipbook list response");

  return {
    profile: {
      accountId: "api_key",
      displayName: "Heyzine API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: heyzineApiBaseUrl,
      validationEndpoint: "/api1/flipbook-list",
      flipbookCount: flipbooks.length,
    },
  };
}

async function listFlipbooks(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await heyzineRequest({
    method: "GET",
    path: "/api1/flipbook-list",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    flipbooks: expectArray(payload, "malformed Heyzine flipbook list response").map((item) => normalizeFlipbook(item)),
  };
}

async function getFlipbook(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await heyzineRequest({
    method: "GET",
    path: "/api1/flipbook-get",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: {
      id: pickRequiredString(input, "id"),
    },
  });

  return {
    flipbook: normalizeFlipbook(payload, "malformed Heyzine flipbook detail response"),
  };
}

async function deleteFlipbook(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await heyzineRequest({
    method: "POST",
    path: "/api1/flipbook-delete",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    body: {
      id: pickRequiredString(input, "id"),
    },
  });

  return normalizeOperationResult(payload);
}

async function listBookshelves(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await heyzineRequest({
    method: "GET",
    path: "/api1/bookshelf-list",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    bookshelves: expectArray(payload, "malformed Heyzine bookshelf list response").map((item) =>
      normalizeBookshelf(item),
    ),
  };
}

async function listBookshelfFlipbooks(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await heyzineRequest({
    method: "GET",
    path: "/api1/bookshelf-get",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: {
      id: pickRequiredString(input, "id"),
    },
  });

  return {
    flipbooks: expectArray(payload, "malformed Heyzine bookshelf flipbook response").map((item) =>
      normalizeFlipbook(item),
    ),
  };
}

async function addFlipbookToBookshelf(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await heyzineRequest({
    method: "POST",
    path: "/api1/bookshelf-add",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    body: compactObject({
      id: pickRequiredString(input, "id"),
      flipbook_id: pickRequiredString(input, "flipbook_id"),
      position: optionalInteger(input.position),
    }),
  });

  return normalizeOperationResult(payload);
}

async function removeFlipbookFromBookshelf(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await heyzineRequest({
    method: "POST",
    path: "/api1/bookshelf-remove",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    body: {
      id: pickRequiredString(input, "id"),
      flipbook_id: pickRequiredString(input, "flipbook_id"),
    },
  });

  return normalizeOperationResult(payload);
}

async function setFlipbookSocialData(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await heyzineRequest({
    method: "POST",
    path: "/api1/flipbook-social",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    body: buildSocialMetadataBody(input),
  });

  return normalizeOperationResult(payload);
}

async function setBookshelfSocialData(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await heyzineRequest({
    method: "POST",
    path: "/api1/bookshelf-social",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    body: buildSocialMetadataBody(input),
  });

  return normalizeOperationResult(payload);
}

function buildSocialMetadataBody(input: Record<string, unknown>): Record<string, unknown> {
  const body = compactObject({
    id: pickRequiredString(input, "id"),
    title: optionalString(input.title),
    description: optionalString(input.description),
    thumbnail: optionalString(input.thumbnail),
  });
  if (!body.title && !body.description && !body.thumbnail) {
    throw new ProviderRequestError(400, "At least one of title, description, or thumbnail is required.");
  }
  return body;
}

async function heyzineRequest(input: HeyzineRequestInput): Promise<unknown> {
  const url = new URL(input.path, heyzineApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: input.method === "POST" ? heyzineJsonHeaders(input.apiKey) : heyzineHeaders(input.apiKey),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Heyzine request failed: ${error.message}` : "Heyzine request failed",
    );
  }

  const payload = await readHeyzinePayload(response);
  const payloadStatus = resolveHeyzinePayloadStatus(payload);
  if (payloadStatus !== undefined) {
    throw createHeyzineError(payloadStatus, payload, input.phase, response.statusText);
  }
  if (!response.ok) {
    throw createHeyzineError(response.status, payload, input.phase, response.statusText);
  }

  return payload;
}

function heyzineHeaders(apiKey: string): Headers {
  return new Headers({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });
}

function heyzineJsonHeaders(apiKey: string): Headers {
  const headers = heyzineHeaders(apiKey);
  headers.set("content-type", "application/json");
  return headers;
}

async function readHeyzinePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createHeyzineError(
  status: number,
  payload: unknown,
  phase: HeyzineRequestPhase,
  statusText?: string,
): ProviderRequestError {
  const message = extractHeyzineErrorMessage(payload) ?? statusText ?? "Heyzine request failed";
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 400 || status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && (status === 400 || status === 404)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function resolveHeyzinePayloadStatus(payload: unknown): number | undefined {
  const record = optionalRecord(payload);
  if (!record || optionalBoolean(record.success) !== false) {
    return undefined;
  }
  return optionalInteger(record.code) ?? 400;
}

function extractHeyzineErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return (
    optionalString(record.msg) ??
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.code)
  );
}

function normalizeFlipbook(
  value: unknown,
  errorMessage = "malformed Heyzine flipbook response",
): Record<string, unknown> {
  const record = expectObject(value, errorMessage);
  return compactObject({
    id: optionalString(record.id),
    date: optionalString(record.date),
    title: nullableString(record.title) ?? null,
    subtitle: nullableString(record.subtitle) ?? null,
    description: nullableString(record.description) ?? null,
    pages: optionalInteger(record.pages),
    size: optionalInteger(record.size),
    private: nullableString(record.private) ?? undefined,
    position: optionalInteger(record.position),
    tags: normalizeTags(record.tags),
    links: normalizeFlipbookLinks(record.links),
    oembed: normalizeOembed(record.oembed),
  });
}

function normalizeBookshelf(value: unknown): Record<string, unknown> {
  const record = expectObject(value, "malformed Heyzine bookshelf response");
  return {
    id: optionalString(record.id),
    title: nullableString(record.title) ?? null,
    description: nullableString(record.description) ?? null,
    thumbnail: nullableString(record.thumbnail) ?? null,
    flipbook_count: optionalInteger(record.flipbook_count),
  };
}

function normalizeOperationResult(value: unknown): Record<string, unknown> {
  const record = expectObject(value, "malformed Heyzine operation response");
  return compactObject({
    success: optionalBoolean(record.success),
    code: optionalInteger(record.code),
    msg: optionalString(record.msg) ?? optionalString(record.message),
  });
}

function normalizeFlipbookLinks(value: unknown): Record<string, unknown> {
  const record = expectObject(value, "malformed Heyzine flipbook links");
  return {
    custom: nullableString(record.custom) ?? null,
    base: optionalString(record.base),
    thumbnail: optionalString(record.thumbnail),
    pdf: optionalString(record.pdf),
  };
}

function normalizeOembed(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  return compactObject({
    type: optionalString(record.type),
    version: optionalString(record.version),
    title: nullableString(record.title) ?? null,
    provider_name: optionalString(record.provider_name),
    provider_url: optionalString(record.provider_url),
    html: optionalString(record.html),
    width: optionalInteger(record.width),
    height: optionalInteger(record.height),
    thumbnail_url: optionalString(record.thumbnail_url),
    thumbnail_width: optionalInteger(record.thumbnail_width),
    thumbnail_height: optionalInteger(record.thumbnail_height),
  });
}

function normalizeTags(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

function expectObject(value: unknown, errorMessage: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, errorMessage, value);
  }
  return record;
}

function expectArray(value: unknown, errorMessage: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, errorMessage, value);
  }
  return value;
}

function pickRequiredString(input: Record<string, unknown>, key: string): string {
  return requiredString(input[key], key, (message) => new ProviderRequestError(400, message));
}
