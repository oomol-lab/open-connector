import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";

import {
  compactObject,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  optionalString,
  pickOptionalBoolean,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  createProviderFetch,
  providerInputError,
  providerResponseError,
  requiredResponseRecord,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "firecrawl";
const defaultFirecrawlApiBaseUrl = "https://api.firecrawl.dev";
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

interface FirecrawlActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type FirecrawlActionHandler = (input: Record<string, unknown>, context: FirecrawlActionContext) => Promise<unknown>;

export const firecrawlActionHandlers: ProviderActionHandlers<"firecrawl", FirecrawlActionHandler> = {
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
  // Firecrawl shuts down /v1/deep-research on 2026-12-10; deep research now runs on the agent endpoint.
  // https://docs.firecrawl.dev/migrating-from-deep-research
  deep_research: firecrawlPostAction("/v2/agent", buildDeepResearchBody),
  get_deep_research_status: async (input, context) => {
    const payload = await firecrawlRequest({
      apiKey: context.apiKey,
      apiBaseUrl: context.apiBaseUrl,
      fetcher: context.fetcher,
      signal: context.signal,
      path: `/v2/agent/${String(input.id)}`,
      phase: "execute",
    });
    return toDeepResearchStatus(payload);
  },
  // Firecrawl shuts down /v1/llmstxt on 2026-12-10; LLMs.txt is now built from map and batch scrape results.
  // https://docs.firecrawl.dev/migrating-from-llmstxt
  llms_txt_generate: startLlmsTxt,
  llms_txt_get: getLlmsTxt,
  queue_get: firecrawlGetAction(() => "/v2/team/queue-status"),
  credit_usage_get: firecrawlGetAction(() => "/v2/team/credit-usage"),
  credit_usage_get_historical: firecrawlGetAction(() => "/v2/team/credit-usage/historical", buildHistoricalUsageQuery),
  token_usage_get: firecrawlGetAction(() => "/v2/team/token-usage"),
  token_usage_get_historical: firecrawlGetAction(() => "/v2/team/token-usage/historical", buildHistoricalUsageQuery),
};

export const executors: ProviderExecutors = defineProviderExecutors<FirecrawlActionContext>({
  service,
  handlers: firecrawlActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<FirecrawlActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: normalizeFirecrawlApiBaseUrl(credential.values.baseUrl),
      fetcher,
      signal: context.signal,
    };
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeFirecrawlApiBaseUrl(credential.values.baseUrl);
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiBaseUrl = normalizeFirecrawlApiBaseUrl(input.values.baseUrl);
    const payload = optionalRecord(
      await firecrawlRequest({
        apiKey: input.apiKey,
        apiBaseUrl,
        // Re-guard the shared validator fetcher with the private-network
        // opt-in so a self-hosted instance on a private network validates
        // when the deployment allows it.
        fetcher: createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed }),
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
      metadata: compactObject({
        apiBaseUrl,
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
      apiBaseUrl: context.apiBaseUrl,
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
      apiBaseUrl: context.apiBaseUrl,
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
      apiBaseUrl: context.apiBaseUrl,
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

/**
 * Maps a deep research request onto an agent run: the prompts merge into one prompt, and the schema asks
 * for the report and sources that deep research returned, plus the caller's JSON schema when given.
 */
function buildDeepResearchBody(input: Record<string, unknown>): Record<string, unknown> {
  const jsonOptions = optionalRecord(input.jsonOptions);
  const jsonSchema = optionalRecord(jsonOptions?.schema);
  const prompt = [input.query, input.systemPrompt, input.analysisPrompt, jsonOptions?.prompt]
    .map((part) => optionalString(part))
    .filter((part) => part !== undefined)
    .join("\n\n");
  return compactObject({
    prompt,
    schema: {
      type: "object",
      properties: {
        report: { type: "string", description: "A markdown report that answers the question." },
        sources: {
          type: "array",
          description: "The sources the report is based on.",
          items: {
            type: "object",
            properties: { url: { type: "string" }, title: { type: "string" } },
            required: ["url", "title"],
          },
        },
        json: jsonSchema,
      },
      required: jsonSchema ? ["report", "sources", "json"] : ["report", "sources"],
    },
    maxCredits: optionalNumber(input.maxCredits),
  });
}

/** Returns a finished agent run in the deep research status shape: `data.finalAnalysis`, `data.sources`, `sources`. */
function toDeepResearchStatus(payload: unknown): unknown {
  const body = optionalRecord(payload);
  const data = optionalRecord(body?.data);
  if (!body || !data) {
    return payload;
  }
  const sources = optionalArray(data.sources);
  return { ...body, data: { ...data, finalAnalysis: data.report, sources, json: data.json }, sources };
}

const llmsTxtSummaryFormat = {
  type: "json",
  prompt: "Write a 3-4 word title and a 9-10 word description of this page.",
  schema: {
    type: "object",
    properties: { title: { type: "string" }, description: { type: "string" } },
    required: ["title", "description"],
  },
};

/**
 * Starts an LLMs.txt job the way the migration guide builds one: map the site, then batch scrape the pages
 * with a JSON format for each page's title and description, plus markdown for llms-full.txt. A batch scrape
 * keeps neither the root URL nor the map order, so both come back with the job ID for `llms_txt_get`.
 */
async function startLlmsTxt(input: Record<string, unknown>, context: FirecrawlActionContext): Promise<unknown> {
  const url = String(input.url);
  const map = optionalRecord(
    await firecrawlRequest({
      ...context,
      method: "POST",
      path: "/v2/map",
      body: { url, limit: optionalNumber(input.maxUrls) ?? 10, includeSubdomains: false },
      phase: "execute",
    }),
  );
  const urls = (optionalArray(map?.links) ?? [])
    .map((link) => optionalString(optionalRecord(link)?.url ?? link))
    .filter((link) => link !== undefined);
  if (urls.length === 0) {
    throw new ProviderRequestError(422, `Firecrawl map found no pages to scrape for ${url}`, map);
  }

  const batch = optionalRecord(
    await firecrawlRequest({
      ...context,
      method: "POST",
      path: "/v2/batch/scrape",
      body: compactObject({
        urls,
        formats: input.showFullText === true ? ["markdown", llmsTxtSummaryFormat] : [llmsTxtSummaryFormat],
        maxAge: input.cache === false ? 0 : undefined,
      }),
      phase: "execute",
    }),
  );
  return { success: batch?.success === true, id: batch?.id, url, urls };
}

/**
 * Reads an LLMs.txt job's batch scrape and, once it has completed, returns every page of results written into
 * the `/v1/llmstxt` status shape. Running batches report `processing`, failed and cancelled ones `failed`.
 */
async function getLlmsTxt(input: Record<string, unknown>, context: FirecrawlActionContext): Promise<unknown> {
  const path = `/v2/batch/scrape/${String(input.id)}`;
  const job = optionalRecord(await firecrawlRequest({ ...context, path, phase: "execute" })) ?? {};
  const status = optionalString(job.status);
  if (status === undefined) throw providerResponseError("Firecrawl batch response is missing status");
  const expiresAt = optionalString(job.expiresAt);
  if (status === "scraping") {
    return compactObject({ success: true, status: "processing", expiresAt });
  }
  if (status !== "completed") {
    const error = optionalString(job.error) ?? `Firecrawl batch scrape ${status ?? "failed"}`;
    return compactObject({ success: false, status: "failed", error, expiresAt });
  }

  // A completed batch pages its results through `next`, which ends after the last page.
  const results = readBatchResults(job);
  const visited = new Set<string>();
  for (let next = optionalString(job.next); next !== undefined;) {
    const nextUrl = new URL(next, context.apiBaseUrl);
    if (visited.has(nextUrl.href))
      throw new ProviderRequestError(502, "Firecrawl returned a repeated batch result page");
    visited.add(nextUrl.href);
    const basePathname = new URL(context.apiBaseUrl).pathname;
    const basePath = basePathname.endsWith("/") ? basePathname.slice(0, -1) : basePathname;
    const pathname =
      basePath && nextUrl.pathname.startsWith(`${basePath}/`)
        ? nextUrl.pathname.slice(basePath.length)
        : nextUrl.pathname;
    const pagePath = `${pathname}${nextUrl.search}`;
    const page = requiredResponseRecord(
      await firecrawlRequest({ ...context, path: pagePath, phase: "execute" }),
      "Firecrawl batch result page",
    );
    results.push(...readBatchResults(page));
    const following = optionalString(page?.next);
    next = following;
  }

  return compactObject({
    success: true,
    status: "completed",
    data: buildLlmsTxt(results, optionalString(input.url), optionalStringArray(input.urls)),
    expiresAt,
  });
}

/**
 * Writes llms.txt and llms-full.txt in the format `/v1/llmstxt` returned, leaving out pages that came back with a
 * status of 400 or more. Given the root URL and map order from `llms_txt_generate`, the header names the root URL
 * and the pages follow map order (batch results come back in the order they finish). Without them, the header
 * names the site's origin and the pages keep the order Firecrawl returned them in.
 */
function readBatchResults(page: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(page.data)) throw providerResponseError("Firecrawl batch result data must be an array of objects");
  return page.data.map((value) => requiredResponseRecord(value, "Firecrawl batch result item"));
}

function buildLlmsTxt(results: unknown[], rootUrl?: string, urls?: string[]): Record<string, string> {
  const pages = results.map((result) => optionalRecord(result) ?? {});
  const metadataOf = (page: Record<string, unknown>) => optionalRecord(page.metadata) ?? {};
  const pageUrlOf = (page: Record<string, unknown>) =>
    firstText(metadataOf(page).url, metadataOf(page).sourceURL) ?? "";

  const kept = pages.filter((page) => (optionalNumber(metadataOf(page).statusCode) ?? 200) < 400);
  if (urls) {
    const mapOrder = new Map(urls.map((pageUrl, index) => [pageUrl, index]));
    const position = (page: Record<string, unknown>) =>
      mapOrder.get(firstText(metadataOf(page).sourceURL, metadataOf(page).url) ?? "") ?? urls.length;
    kept.sort((a, b) => position(a) - position(b));
  }

  const root = rootUrl ?? (kept[0] ? siteOrigin(pageUrlOf(kept[0])) : "");
  let llmstxt = `# ${root} llms.txt\n\n`;
  let llmsfulltxt = `# ${root} llms-full.txt\n\n`;
  for (const page of kept) {
    const summary = optionalRecord(page.json) ?? {};
    const pageUrl = pageUrlOf(page);
    const title = firstText(summary.title, metadataOf(page).title) ?? pageUrl;
    const description = firstText(summary.description, metadataOf(page).description) ?? "";
    llmstxt += `- [${title}](${pageUrl}): ${description}\n`;
    llmsfulltxt += `## ${title}\n${optionalRawString(page.markdown) ?? ""}\n\n`;
  }

  // The pages carry markdown only when `llms_txt_generate` was asked for llms-full.txt.
  return pages.some((page) => typeof page.markdown === "string") ? { llmstxt, llmsfulltxt } : { llmstxt };
}

/** Returns the first non-empty string; page metadata can hold a string or a list of strings. */
function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = optionalString(Array.isArray(value) ? value[0] : value);
    if (text !== undefined) {
      return text;
    }
  }
  return undefined;
}

function siteOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
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

/**
 * Resolves the Firecrawl API base URL for a connection. Empty input targets
 * the Firecrawl cloud API; otherwise the self-hosted instance URL is
 * validated, embedded credentials are rejected, and query, hash, and trailing
 * slashes are removed while any reverse-proxy path prefix is kept.
 * Private/overlay targets are only accepted when the deployment opts in
 * through `OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK`.
 */
function normalizeFirecrawlApiBaseUrl(value: unknown): string {
  const instanceUrl = optionalString(value);
  if (!instanceUrl) {
    return defaultFirecrawlApiBaseUrl;
  }
  const url = assertPublicHttpUrl(instanceUrl, {
    fieldName: "baseUrl",
    createError: providerInputError,
    allowPrivateNetwork: isPrivateNetworkAccessAllowed(),
  });
  if (url.username || url.password) {
    throw providerInputError("baseUrl must not include credentials");
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString().replace(/\/$/u, "");
}

async function firecrawlRequest(
  input: FirecrawlRequestInput & {
    apiKey: string;
    apiBaseUrl: string;
    fetcher: typeof fetch;
    signal?: AbortSignal;
  },
): Promise<unknown> {
  const url = new URL(`${input.apiBaseUrl}${input.path}`);
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
    return new ProviderRequestError(
      phase === "validate" ? 400 : status,
      message,
      payload,
      phase === "validate" ? "invalid_input" : "provider_error",
    );
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
