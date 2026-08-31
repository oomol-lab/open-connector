import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import { providerResponseError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const youApiBaseUrl = "https://api.you.com/v1";
const youApiOrigin = "https://api.you.com";
const youIndexOrigin = "https://ydc-index.io";

type YouActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const youActionHandlers: ProviderActionHandlers<"you", YouActionHandler> = {
  search,
  fetch_contents: fetchContents,
  research,
  finance_research: financeResearch,
  get_account_balance(_input, context) {
    return getAccountBalance(context);
  },
};

export async function validateYouCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const balance = normalizeAccountBalance(
    await youRequest({
      origin: youApiOrigin,
      path: "/v1/billing/account_balance",
      method: "GET",
      apiKey,
      fetcher,
      phase: "validate",
      signal,
    }),
  );
  return {
    profile: {
      accountId: balance.id,
      displayName: "You.com API Key",
    },
    metadata: {
      apiBaseUrl: youApiBaseUrl,
      validationEndpoint: "/billing/account_balance",
      accountId: balance.id,
      balanceCents: balance.balanceCents,
    },
  };
}

async function search(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const body = buildSearchPostBody(input);
  const payload = await youRequest({
    ...(body
      ? { origin: youIndexOrigin, path: "/v1/search", method: "POST" as const, body }
      : { url: buildSearchGetUrl(input), method: "GET" as const }),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const response = requiredRecord(payload, "you search response", providerResponseError);
  const results = optionalRecord(response.results) ?? {};
  return {
    web: readArray(results.web).map(normalizeWebResult),
    news: readArray(results.news).map(normalizeNewsResult),
    metadata: normalizeSearchMetadata(response.metadata),
    raw: response,
  };
}

async function fetchContents(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await youRequest({
    origin: youIndexOrigin,
    path: "/v1/contents",
    method: "POST",
    body: compactObject({
      urls: input.urls,
      formats: input.formats,
      crawl_timeout: input.crawlTimeout,
    }),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const items = readArray(payload);
  return { pages: items.map(normalizeContentPage), raw: items };
}

async function research(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await youRequest({
    origin: youApiOrigin,
    path: "/v1/research",
    method: "POST",
    body: compactObject({
      input: input.input,
      research_effort: input.researchEffort,
      source_control: buildSourceControl(input.sourceControl),
      output_schema: input.outputSchema,
    }),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const response = requiredRecord(payload, "you research response", providerResponseError);
  return { output: normalizeResearchOutput(response.output), raw: response };
}

async function financeResearch(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await youRequest({
    origin: youApiOrigin,
    path: "/v1/finance_research",
    method: "POST",
    body: compactObject({ input: input.input, research_effort: input.researchEffort }),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const response = requiredRecord(payload, "you finance research response", providerResponseError);
  return { output: normalizeResearchOutput(response.output), raw: response };
}

async function getAccountBalance(context: ApiKeyProviderContext): Promise<unknown> {
  return normalizeAccountBalance(
    await youRequest({
      origin: youApiOrigin,
      path: "/v1/billing/account_balance",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    }),
  );
}

async function youRequest(input: {
  origin?: string;
  path?: string;
  url?: URL;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  phase: "validate" | "execute";
}): Promise<unknown> {
  const url = input.url ?? new URL(input.path ?? "/", input.origin);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: youHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
    payload = await readYouPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `you request failed: ${error.message}` : "you request failed",
    );
  }
  if (!response.ok) throw createYouError(response, payload, input.phase);
  return payload;
}

function youHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return compactObject({
    accept: "application/json",
    "x-api-key": apiKey,
    "user-agent": providerUserAgent,
    "content-type": hasBody ? "application/json" : undefined,
  }) as Record<string, string>;
}

async function readYouPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createYouError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readErrorMessage(payload) ?? (response.statusText.trim() || "you request failed");
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && response.status === 401) return new ProviderRequestError(401, message, payload);
  if (response.status === 400 || response.status === 422) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(response.status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload;
  const object = optionalRecord(payload);
  const detail = object?.detail;
  const firstDetail = Array.isArray(detail) ? optionalRecord(detail[0]) : undefined;
  return optionalString(detail) ?? optionalString(firstDetail?.msg) ?? optionalString(object?.error);
}

function buildSearchGetUrl(input: Record<string, unknown>): URL {
  const url = new URL("/v1/search", youIndexOrigin);
  for (const [key, value] of Object.entries(buildSearchQuery(input))) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  for (const value of readOptionalStringArray(input.livecrawlFormats)) {
    url.searchParams.append("livecrawl_formats", value);
  }
  return url;
}

function buildSearchQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    query: requiredProviderString(input.query, "query"),
    count: stringifyOptional(input.count),
    freshness: stringifyOptional(input.freshness),
    offset: stringifyOptional(input.offset),
    country: stringifyOptional(input.country),
    language: stringifyOptional(input.language),
    safesearch: stringifyOptional(input.safesearch),
    livecrawl: stringifyOptional(input.livecrawl),
    crawl_timeout: stringifyOptional(input.crawlTimeout),
  }) as Record<string, string | undefined>;
}

function buildSearchPostBody(input: Record<string, unknown>): Record<string, unknown> | undefined {
  const includeDomains = readOptionalStringArray(input.includeDomains);
  const excludeDomains = readOptionalStringArray(input.excludeDomains);
  const boostDomains = readOptionalStringArray(input.boostDomains);
  if (includeDomains.length === 0 && excludeDomains.length === 0 && boostDomains.length === 0) return undefined;
  return compactObject({
    query: requiredProviderString(input.query, "query"),
    count: input.count,
    freshness: input.freshness,
    offset: input.offset,
    country: input.country,
    language: input.language,
    safesearch: input.safesearch,
    livecrawl: input.livecrawl,
    livecrawl_formats: readOptionalArray(input.livecrawlFormats),
    include_domains: includeDomains.length > 0 ? includeDomains : undefined,
    exclude_domains: excludeDomains.length > 0 ? excludeDomains : undefined,
    boost_domains: boostDomains.length > 0 ? boostDomains : undefined,
    crawl_timeout: input.crawlTimeout,
  });
}

function buildSourceControl(value: unknown): Record<string, unknown> | undefined {
  const input = optionalRecord(value);
  if (!input) return undefined;
  return compactObject({
    include_domains: input.includeDomains,
    exclude_domains: input.excludeDomains,
    boost_domains: input.boostDomains,
    freshness: input.freshness,
    country: input.country,
  });
}

function normalizeSearchMetadata(value: unknown): Record<string, unknown> {
  const input = optionalRecord(value) ?? {};
  return compactObject({
    searchUuid: optionalString(input.search_uuid),
    query: optionalString(input.query),
    latency: optionalNumber(input.latency),
    raw: input,
  });
}

function normalizeWebResult(value: unknown): Record<string, unknown> {
  const input = requiredRecord(value, "you web result", providerResponseError);
  return compactObject({
    url: optionalString(input.url),
    title: optionalString(input.title),
    description: optionalString(input.description),
    snippets: readStringArray(input.snippets),
    thumbnailUrl: optionalString(input.thumbnail_url),
    pageAge: optionalString(input.page_age),
    contents: normalizeContents(input.contents),
    authors: readStringArray(input.authors),
    faviconUrl: optionalString(input.favicon_url),
    raw: input,
  });
}

function normalizeNewsResult(value: unknown): Record<string, unknown> {
  const input = requiredRecord(value, "you news result", providerResponseError);
  return compactObject({
    url: optionalString(input.url),
    title: optionalString(input.title),
    description: optionalString(input.description),
    pageAge: optionalString(input.page_age),
    thumbnailUrl: optionalString(input.thumbnail_url),
    contents: normalizeContents(input.contents),
    raw: input,
  });
}

function normalizeContents(value: unknown): Record<string, unknown> | undefined {
  const input = optionalRecord(value);
  if (!input) return undefined;
  return compactObject({ html: optionalString(input.html), markdown: optionalString(input.markdown) });
}

function normalizeContentPage(value: unknown): Record<string, unknown> {
  const input = requiredRecord(value, "you content page", providerResponseError);
  return compactObject({
    url: optionalString(input.url),
    title: optionalString(input.title),
    html: optionalNullableString(input.html),
    markdown: optionalNullableString(input.markdown),
    metadata: optionalRecord(input.metadata),
    raw: input,
  });
}

function normalizeResearchOutput(value: unknown): Record<string, unknown> {
  const input = requiredRecord(value, "you output", providerResponseError);
  return {
    content: input.content,
    contentType: requiredProviderString(input.content_type, "content_type"),
    sources: readArray(input.sources).map(normalizeResearchSource),
    raw: input,
  };
}

function normalizeResearchSource(value: unknown): Record<string, unknown> {
  const input = requiredRecord(value, "you source", providerResponseError);
  return compactObject({
    url: requiredProviderString(input.url, "source.url"),
    title: optionalString(input.title),
    snippets: readStringArray(input.snippets),
    raw: input,
  });
}

function normalizeAccountBalance(value: unknown): {
  type: string;
  id: string;
  balanceCents: number;
  balanceUsd: number;
  raw: Record<string, unknown>;
} {
  const response = requiredRecord(value, "you balance response", providerResponseError);
  const data = requiredRecord(response.data, "you balance data", providerResponseError);
  const attributes = requiredRecord(data.attributes, "you balance attributes", providerResponseError);
  const balanceCents = requiredProviderNumber(attributes.balance, "balance");
  return {
    type: requiredProviderString(data.type, "type"),
    id: requiredProviderString(data.id, "id"),
    balanceCents,
    balanceUsd: balanceCents / 100,
    raw: response,
  };
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map((item) => String(item)) : undefined;
}

function readOptionalArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function readOptionalStringArray(value: unknown): string[] {
  return readOptionalArray(value)?.map((item) => String(item)) ?? [];
}

function stringifyOptional(value: unknown): string | undefined {
  return value == null ? undefined : String(value);
}

function optionalNullableString(value: unknown): string | null | undefined {
  return value === null ? null : optionalString(value);
}

function requiredProviderString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (text) return text;
  throw new ProviderRequestError(502, `you response is missing ${fieldName}`);
}

function requiredProviderNumber(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new ProviderRequestError(502, `you response is missing ${fieldName}`);
}
