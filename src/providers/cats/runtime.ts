import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalIntegerLike, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerInputError, ProviderRequestError, providerUserAgent, setSearchParams } from "../provider-runtime.ts";

export const catsApiBaseUrl = "https://api.catsone.com/v3";

type CatsListResource = "candidates" | "companies" | "jobs";
type CatsActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const catsActionHandlers: ProviderActionHandlers<"cats", CatsActionHandler> = {
  get_site(_input, context) {
    return getSite(context);
  },
  list_candidates(input, context) {
    return listResource(input, context, "candidates");
  },
  get_candidate(input, context) {
    return getResource(input, context, "candidates", "candidate", "candidateId");
  },
  search_candidates(input, context) {
    return searchResource(input, context, "candidates");
  },
  list_companies(input, context) {
    return listResource(input, context, "companies");
  },
  get_company(input, context) {
    return getResource(input, context, "companies", "company", "companyId");
  },
  search_companies(input, context) {
    return searchResource(input, context, "companies");
  },
  list_jobs(input, context) {
    return listResource(input, context, "jobs");
  },
  get_job(input, context) {
    return getResource(input, context, "jobs", "job", "jobId");
  },
  search_jobs(input, context) {
    return searchResource(input, context, "jobs");
  },
};

export async function validateCatsCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await catsRequest({
    apiKey,
    fetcher,
    path: "/site",
    phase: "validate",
    signal,
  });
  const site = optionalRecord(payload) ?? {};
  const siteName = readString(site.name) ?? readString(site.subdomain);
  const siteId = readString(site.id);
  const siteSubdomain = readString(site.subdomain);

  return {
    profile: {
      accountId: siteId ?? siteSubdomain ?? "cats",
      displayName: siteName ?? "CATS API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      siteId,
      siteSubdomain,
      validationEndpoint: "/site",
    }),
  };
}

async function getSite(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await catsRequest({
    ...context,
    path: "/site",
    phase: "execute",
  });

  return {
    site: optionalRecord(payload) ?? {},
    raw: payload,
  };
}

async function listResource(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  resource: CatsListResource,
): Promise<unknown> {
  const response = await catsRequest({
    ...context,
    path: `/${resource}`,
    searchParams: paginationSearchParams(input),
    phase: "execute",
    includeResponse: true,
  });

  return normalizeListResponse(response.payload, response.response, resource);
}

async function searchResource(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  resource: CatsListResource,
): Promise<unknown> {
  const response = await catsRequest({
    ...context,
    path: `/${resource}/search`,
    searchParams: {
      ...paginationSearchParams(input),
      query: requiredString(input.query, "query", providerInputError),
    },
    phase: "execute",
    includeResponse: true,
  });

  return normalizeListResponse(response.payload, response.response, resource);
}

async function getResource(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  resource: CatsListResource,
  outputField: "candidate" | "company" | "job",
  inputField: "candidateId" | "companyId" | "jobId",
): Promise<unknown> {
  const id = readRequiredPositiveInteger(input[inputField], inputField);
  const payload = await catsRequest({
    ...context,
    path: `/${resource}/${id}`,
    phase: "execute",
  });

  return {
    [outputField]: optionalRecord(payload) ?? {},
    raw: payload,
  };
}

async function catsRequest(input: {
  apiKey: string;
  fetcher: typeof fetch;
  path: string;
  searchParams?: Record<string, string | undefined>;
  phase: "validate" | "execute";
  signal?: AbortSignal;
  includeResponse?: false;
}): Promise<unknown>;
async function catsRequest(input: {
  apiKey: string;
  fetcher: typeof fetch;
  path: string;
  searchParams?: Record<string, string | undefined>;
  phase: "validate" | "execute";
  signal?: AbortSignal;
  includeResponse: true;
}): Promise<{ payload: unknown; response: Response }>;
async function catsRequest(input: {
  apiKey: string;
  fetcher: typeof fetch;
  path: string;
  searchParams?: Record<string, string | undefined>;
  phase: "validate" | "execute";
  signal?: AbortSignal;
  includeResponse?: boolean;
}): Promise<unknown> {
  const url = new URL(`${catsApiBaseUrl}${input.path}`);
  setSearchParams(url, input.searchParams ?? {});

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: "GET",
      headers: catsHeaders(input.apiKey),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `cats request failed: ${error.message}` : "cats request failed",
    );
  }

  const payload = await readCatsPayload(response);
  assertCatsResponse(response, payload, input.phase);

  return input.includeResponse ? { payload, response } : payload;
}

function catsHeaders(apiKey: string): HeadersInit {
  return {
    accept: "application/json",
    authorization: `Token ${apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

function paginationSearchParams(input: Record<string, unknown>): Record<string, string | undefined> {
  const page = optionalIntegerLike(input.page, "page", providerInputError);
  const perPage = optionalIntegerLike(input.perPage, "perPage", providerInputError);
  return {
    page: page === undefined ? undefined : String(page),
    per_page: perPage === undefined ? undefined : String(perPage),
  };
}

function normalizeListResponse(payload: unknown, response: Response, resource: CatsListResource): unknown {
  return {
    [resource]: extractListItems(payload, resource),
    pagination: compactObject(readPagination(payload, response)),
    raw: payload,
  };
}

function extractListItems(payload: unknown, resource: CatsListResource): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.map((item) => optionalRecord(item) ?? {});
  const object = optionalRecord(payload) ?? {};
  const embeddedItems = optionalRecord(object._embedded)?.[resource];
  if (Array.isArray(embeddedItems)) return embeddedItems.map((item) => optionalRecord(item) ?? {});
  const directItems = object[resource];
  if (Array.isArray(directItems)) return directItems.map((item) => optionalRecord(item) ?? {});
  const dataItems = object.data;
  return Array.isArray(dataItems) ? dataItems.map((item) => optionalRecord(item) ?? {}) : [];
}

function readPagination(payload: unknown, response: Response): Record<string, number | undefined> {
  const object = optionalRecord(payload) ?? {};
  return {
    page: readPositiveIntegerHeader(response, "x-pagination-page") ?? readPositiveInteger(object.page),
    perPage:
      readPositiveIntegerHeader(response, "x-pagination-per-page") ??
      readPositiveInteger(object.per_page) ??
      readPositiveInteger(object.perPage) ??
      readPositiveInteger(object.count),
    total: readNonNegativeIntegerHeader(response, "x-pagination-total") ?? readNonNegativeInteger(object.total),
    totalPages:
      readNonNegativeIntegerHeader(response, "x-pagination-total-pages") ??
      readNonNegativeInteger(object.total_pages) ??
      readNonNegativeInteger(object.totalPages),
  };
}

async function readCatsPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function assertCatsResponse(response: Response, payload: unknown, phase: "validate" | "execute"): void {
  if (response.ok) return;
  const message = (extractCatsMessage(payload) ?? response.statusText) || "cats request failed";
  if (response.status === 429) throw new ProviderRequestError(429, message, payload);
  if (response.status === 401 || response.status === 403) {
    throw new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  throw new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function extractCatsMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const object = optionalRecord(payload);
  return optionalString(object?.message) ?? optionalString(object?.error) ?? optionalString(object?.detail);
}

function readRequiredPositiveInteger(value: unknown, key: string): number {
  const parsed = optionalIntegerLike(value, key, providerInputError);
  if (parsed === undefined || parsed < 1) throw new ProviderRequestError(400, `${key} is required`);
  return parsed;
}

function readPositiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function readPositiveIntegerHeader(response: Response, name: string): number | undefined {
  return readPositiveInteger(response.headers.get(name));
}

function readNonNegativeIntegerHeader(response: Response, name: string): number | undefined {
  return readNonNegativeInteger(response.headers.get(name));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string"
    ? value
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : undefined;
}
