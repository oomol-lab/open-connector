import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FirecrawlActionName } from "./actions.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, pickOptionalBoolean } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "firecrawl";
const firecrawlApiBaseUrl = "https://api.firecrawl.dev";
const firecrawlScrapeOptionAliasKeys = [
  "scrapeOptions_actions",
  "scrapeOptions_formats",
  "scrapeOptions_headers",
  "scrapeOptions_location",
  "scrapeOptions_jsonOptions",
  "scrapeOptions_timeout",
  "scrapeOptions_waitFor",
  "scrapeOptions_maxAge",
  "scrapeOptions_onlyMainContent",
  "scrapeOptions_mobile",
  "scrapeOptions_includeTags",
  "scrapeOptions_excludeTags",
  "scrapeOptions_proxy",
  "scrapeOptions_parsers",
  "scrapeOptions_parsePDF",
  "scrapeOptions_blockAds",
  "scrapeOptions_storeInCache",
  "scrapeOptions_removeBase64Images",
  "scrapeOptions_skipTlsVerification",
  "scrapeOptions_changeTrackingOptions",
] as const;

interface FirecrawlRequestInput {
  method?: string;
  path: string;
  query?: Record<string, string | number | boolean | null | undefined | Array<string | number | boolean>>;
  body?: Record<string, unknown>;
  phase?: FirecrawlRequestPhase;
}

type FirecrawlRequestPhase = "validate" | "execute";
type FirecrawlActionContext = ApiKeyProviderContext;
type FirecrawlActionHandler = (input: Record<string, unknown>, context: FirecrawlActionContext) => Promise<unknown>;

export const firecrawlActionHandlers: Record<FirecrawlActionName, FirecrawlActionHandler> = {
  scrape: firecrawlPostAction("/v2/scrape", buildDirectBody),
  batch_scrape: firecrawlPostAction("/v2/batch/scrape", buildDirectBody),
  batch_scrape_get: firecrawlGetAction((input) => `/v2/batch/scrape/${String(input.id)}`),
  batch_scrape_get_errors: firecrawlGetAction((input) => `/v2/batch/scrape/${String(input.id)}/errors`),
  batch_scrape_cancel: firecrawlDeleteAction((input) => `/v2/batch/scrape/${String(input.id)}`),
  crawl: firecrawlPostAction("/v2/crawl", buildCrawlBody),
  crawl_v2: firecrawlPostAction("/v2/crawl", buildCrawlBody),
  crawl_get: firecrawlGetAction((input) => `/v2/crawl/${String(input.id)}`),
  get_the_status_of_a_crawl_job: firecrawlGetAction((input) => `/v2/crawl/${String(input.id)}`),
  crawl_get_errors: firecrawlGetAction((input) => `/v2/crawl/${String(input.id)}/errors`),
  crawl_cancel: firecrawlDeleteAction((input) => `/v2/crawl/${String(input.id)}`),
  crawl_delete: firecrawlDeleteAction((input) => `/v2/crawl/${String(input.id)}`),
  crawl_list_active: firecrawlGetAction(() => "/v2/crawl/active"),
  crawl_params_preview: firecrawlPostAction("/v2/crawl/params-preview", buildDirectBody),
  extract: firecrawlPostAction("/v2/extract", buildDirectBody),
  extract_get: firecrawlGetAction((input) => `/v2/extract/${String(input.id)}`),
  search: firecrawlPostAction("/v2/search", buildSearchBody),
  map_multiple_urls_based_on_options: firecrawlPostAction("/v2/map", buildDirectBody),
  start_agent: firecrawlPostAction("/v2/agent", buildDirectBody),
  get_agent_status: firecrawlGetAction((input) => `/v2/agent/${String(input.id)}`),
  agent_cancel: firecrawlDeleteAction((input) => `/v2/agent/${String(input.id)}`),
  deep_research: firecrawlPostAction("/v1/deep-research", buildDirectBody),
  get_deep_research_status: firecrawlGetAction((input) => `/v1/deep-research/${String(input.id)}`),
  llms_txt_generate: firecrawlPostAction("/v1/llmstxt", buildDirectBody),
  llms_txt_get: firecrawlGetAction((input) => `/v1/llmstxt/${String(input.id)}`),
  queue_get: firecrawlGetAction(() => "/v2/team/queue-status"),
  credit_usage_get: firecrawlGetAction(() => "/v2/team/credit-usage"),
  credit_usage_get_historical: firecrawlGetAction(() => "/v2/team/credit-usage/historical", buildHistoricalUsageQuery),
  token_usage_get: firecrawlGetAction(() => "/v2/team/token-usage"),
  token_usage_get_historical: firecrawlGetAction(() => "/v2/team/token-usage/historical", buildHistoricalUsageQuery),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, firecrawlActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = optionalRecord(
      await firecrawlRequest({
        apiKey: input.apiKey,
        fetcher,
        signal,
        path: "/v2/team/credit-usage",
        phase: "validate",
      }),
    );

    return {
      profile: {
        accountId: "api_key",
        displayName: "Firecrawl API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: firecrawlApiBaseUrl,
        validationEndpoint: "/v2/team/credit-usage",
        teamCreditUsage: optionalRecord(payload?.data),
        success: typeof payload?.success === "boolean" ? payload.success : undefined,
      }),
    };
  },
};

function firecrawlPostAction(
  path: string,
  buildBody: (input: Record<string, unknown>) => Record<string, unknown>,
): FirecrawlActionHandler {
  return (input, context) =>
    firecrawlRequest({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "POST",
      path,
      body: buildBody(input),
      phase: "execute",
    });
}

function firecrawlGetAction(
  buildPath: (input: Record<string, unknown>) => string,
  buildQuery?: (
    input: Record<string, unknown>,
  ) => Record<string, string | number | boolean | null | undefined | Array<string | number | boolean>>,
): FirecrawlActionHandler {
  return (input, context) =>
    firecrawlRequest({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      path: buildPath(input),
      query: buildQuery?.(input),
      phase: "execute",
    });
}

function firecrawlDeleteAction(buildPath: (input: Record<string, unknown>) => string): FirecrawlActionHandler {
  return (input, context) =>
    firecrawlRequest({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "DELETE",
      path: buildPath(input),
      phase: "execute",
    });
}

function buildDirectBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({ ...input });
}

function buildSearchBody(input: Record<string, unknown>): Record<string, unknown> {
  const baseInput = omitKeys(input, ["formats"]);
  const formats = optionalArray(input.formats);
  return compactObject({
    ...baseInput,
    scrapeOptions: mergeRecords(optionalRecord(baseInput.scrapeOptions), formats ? { formats } : undefined),
  });
}

function buildCrawlBody(input: Record<string, unknown>): Record<string, unknown> {
  const baseInput = omitKeys(input, firecrawlScrapeOptionAliasKeys);
  return compactObject({
    ...baseInput,
    scrapeOptions: mergeRecords(optionalRecord(baseInput.scrapeOptions), buildScrapeOptionsFromInput(input)),
  });
}

function buildHistoricalUsageQuery(input: Record<string, unknown>): Record<string, boolean | undefined> {
  return compactObject({
    byApiKey: pickOptionalBoolean(input, "byApiKey"),
  });
}

function buildScrapeOptionsFromInput(input: Record<string, unknown>): Record<string, unknown> | undefined {
  const flattened = compactObject({
    actions: optionalArray(input.scrapeOptions_actions),
    formats: optionalArray(input.scrapeOptions_formats),
    headers: optionalRecord(input.scrapeOptions_headers),
    location: optionalRecord(input.scrapeOptions_location),
    jsonOptions: optionalRecord(input.scrapeOptions_jsonOptions),
    timeout: optionalNumber(input.scrapeOptions_timeout),
    waitFor: optionalNumber(input.scrapeOptions_waitFor),
    maxAge: optionalNumber(input.scrapeOptions_maxAge),
    onlyMainContent: pickOptionalBoolean(input, "scrapeOptions_onlyMainContent"),
    mobile: pickOptionalBoolean(input, "scrapeOptions_mobile"),
    includeTags: optionalStringArray(input.scrapeOptions_includeTags),
    excludeTags: optionalStringArray(input.scrapeOptions_excludeTags),
    proxy: optionalString(input.scrapeOptions_proxy),
    parsers: optionalStringArray(input.scrapeOptions_parsers),
    parsePDF: pickOptionalBoolean(input, "scrapeOptions_parsePDF"),
    blockAds: pickOptionalBoolean(input, "scrapeOptions_blockAds"),
    storeInCache: pickOptionalBoolean(input, "scrapeOptions_storeInCache"),
    removeBase64Images: pickOptionalBoolean(input, "scrapeOptions_removeBase64Images"),
    skipTlsVerification: pickOptionalBoolean(input, "scrapeOptions_skipTlsVerification"),
    changeTrackingOptions: optionalRecord(input.scrapeOptions_changeTrackingOptions),
  });

  return Object.keys(flattened).length > 0 ? flattened : undefined;
}

async function firecrawlRequest(
  input: FirecrawlRequestInput & {
    apiKey: string;
    fetcher: typeof fetch;
    signal?: AbortSignal;
  },
): Promise<unknown> {
  const url = new URL(input.path, firecrawlApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value == null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: buildFirecrawlHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Firecrawl request failed: ${error.message}` : "Firecrawl request failed",
    );
  }

  const payload = await readFirecrawlPayload(response);
  if (!response.ok) {
    throw createFirecrawlError(response.status, payload, input.phase ?? "execute");
  }

  return payload;
}

function buildFirecrawlHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readFirecrawlPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return response.ok ? { data: text } : text;
  }
}

function createFirecrawlError(status: number, payload: unknown, phase: FirecrawlRequestPhase): ProviderRequestError {
  const message = readFirecrawlErrorMessage(payload, status);
  if (status === 400 || status === 404) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function readFirecrawlErrorMessage(payload: unknown, status: number): string {
  if (typeof payload === "string" && payload) {
    return payload;
  }

  const body = optionalRecord(payload);
  if (!body) {
    return `Firecrawl request failed with ${status}`;
  }

  const directError =
    optionalString(body.error) ?? optionalString(optionalRecord(body.error)?.message) ?? optionalString(body.message);
  const nestedData = optionalRecord(body.data);
  return directError ?? optionalString(nestedData?.error) ?? `Firecrawl request failed with ${status}`;
}

function omitKeys(input: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const output = { ...input };
  for (const key of keys) {
    delete output[key];
  }
  return output;
}

function mergeRecords(...records: Array<Record<string, unknown> | undefined>): Record<string, unknown> | undefined {
  const merged = Object.assign(
    {},
    ...records.filter((record): record is Record<string, unknown> => record !== undefined),
  );
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function optionalArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map((item) => String(item)) : undefined;
}
