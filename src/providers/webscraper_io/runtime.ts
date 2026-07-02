import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { WebscraperIoActionName } from "./actions.ts";

import {
  objectArray,
  optionalIntegerLike,
  optionalRecord,
  optionalString,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const webscraperIoApiBaseUrl = "https://api.webscraper.io/api/v1";
const webscraperIoRequestTimeoutMs = 30_000;

type WebscraperIoPhase = "validate" | "execute";
type WebscraperIoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface WebscraperIoRequestInput {
  method?: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
  phase: WebscraperIoPhase;
}

export const webscraperIoActionHandlers: Record<WebscraperIoActionName, WebscraperIoActionHandler> = {
  async get_account_info(_input, context) {
    const payload = await requestWebscraperIoJson({ path: "/account", phase: "execute" }, context);
    return normalizeAccountInfo(requireDataObject(payload, "Web Scraper Cloud account"));
  },
  async create_sitemap(input, context) {
    const payload = await requestWebscraperIoJson(
      {
        method: "POST",
        path: "/sitemap",
        body: buildCreateSitemapBody(input),
        phase: "execute",
      },
      context,
    );
    const data = requireDataObject(payload, "Web Scraper Cloud sitemap creation response");
    return { id: requirePositiveIntegerResponse(data.id, "sitemap id") };
  },
  async get_sitemap(input, context) {
    const sitemapId = requirePositiveIntegerInput(input.sitemap_id, "sitemap_id");
    const payload = await requestWebscraperIoJson({ path: `/sitemap/${sitemapId}`, phase: "execute" }, context);
    return normalizeSitemapDetail(requireDataObject(payload, "Web Scraper Cloud sitemap"));
  },
  async list_sitemaps(input, context) {
    const payload = await requestWebscraperIoJson(
      {
        path: "/sitemaps",
        query: {
          page: readOptionalPositiveInteger(input.page, "page"),
          tag: optionalString(input.tag),
        },
        phase: "execute",
      },
      context,
    );
    return normalizeSitemapList(payload);
  },
  async update_sitemap(input, context) {
    const sitemapId = requirePositiveIntegerInput(input.sitemap_id, "sitemap_id");
    const payload = await requestWebscraperIoJson(
      {
        method: "PUT",
        path: `/sitemap/${sitemapId}`,
        body: buildUpdateSitemapBody(input),
        phase: "execute",
      },
      context,
    );
    return normalizeOkResponse(payload, "Web Scraper Cloud sitemap update response");
  },
  async delete_sitemap(input, context) {
    const sitemapId = requirePositiveIntegerInput(input.sitemap_id, "sitemap_id");
    const payload = await requestWebscraperIoJson(
      { method: "DELETE", path: `/sitemap/${sitemapId}`, phase: "execute" },
      context,
    );
    return normalizeOkResponse(payload, "Web Scraper Cloud sitemap deletion response");
  },
  async create_scraping_job(input, context) {
    const payload = await requestWebscraperIoJson(
      {
        method: "POST",
        path: "/scraping-job",
        body: buildCreateScrapingJobBody(input),
        phase: "execute",
      },
      context,
    );
    const data = requireDataObject(payload, "Web Scraper Cloud scraping job creation response");
    return {
      id: requirePositiveIntegerResponse(data.id, "scraping job id"),
      custom_id: readNullableString(data.custom_id),
    };
  },
  async get_scraping_job(input, context) {
    const scrapingJobId = requirePositiveIntegerInput(input.scraping_job_id, "scraping_job_id");
    const payload = await requestWebscraperIoJson(
      { path: `/scraping-job/${scrapingJobId}`, phase: "execute" },
      context,
    );
    return normalizeScrapingJob(requireDataObject(payload, "Web Scraper Cloud scraping job"));
  },
  async list_scraping_jobs(input, context) {
    const payload = await requestWebscraperIoJson(
      {
        path: "/scraping-jobs",
        query: {
          page: readOptionalPositiveInteger(input.page, "page"),
          sitemap_id: readOptionalPositiveInteger(input.sitemap_id, "sitemap_id"),
          tag: optionalString(input.tag),
        },
        phase: "execute",
      },
      context,
    );
    return normalizeScrapingJobList(payload);
  },
  async delete_scraping_job(input, context) {
    const scrapingJobId = requirePositiveIntegerInput(input.scraping_job_id, "scraping_job_id");
    const payload = await requestWebscraperIoJson(
      { method: "DELETE", path: `/scraping-job/${scrapingJobId}`, phase: "execute" },
      context,
    );
    return normalizeOkResponse(payload, "Web Scraper Cloud scraping job deletion response");
  },
  async download_scraping_job_json(input, context) {
    const scrapingJobId = requirePositiveIntegerInput(input.scraping_job_id, "scraping_job_id");
    const content = await requestWebscraperIoText(
      { path: `/scraping-job/${scrapingJobId}/json`, phase: "execute" },
      context,
    );
    return normalizeJsonLines(content);
  },
};

export async function validateWebscraperIoCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestWebscraperIoJson({ path: "/account", phase: "validate" }, { apiKey, fetcher, signal });
  const account = normalizeAccountInfo(requireDataObject(payload, "Web Scraper Cloud account"));
  return {
    profile: {
      accountId: account.email ?? "webscraper-io-api-token",
      displayName: buildAccountLabel(account),
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: webscraperIoApiBaseUrl,
      validationEndpoint: "/account",
      email: account.email,
      firstname: account.firstname,
      lastname: account.lastname,
      page_credits: account.page_credits,
    },
  };
}

async function requestWebscraperIoJson(
  input: WebscraperIoRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(context.signal, webscraperIoRequestTimeoutMs);
  try {
    const response = await context.fetcher(buildWebscraperIoUrl(input.path, context.apiKey, input.query), {
      method: input.method ?? "GET",
      headers: buildHeaders(input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readWebscraperIoJson(response);
    if (!response.ok) {
      throw createWebscraperIoError(response.status, payload, input.phase);
    }
    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "Web Scraper Cloud returned an invalid payload", payload);
    }
    if (record.success === false) {
      throw createWebscraperIoError(502, record, input.phase);
    }
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      timeout.didTimeout() || isAbortLikeError(error) ? 504 : 502,
      error instanceof Error
        ? `Web Scraper Cloud request failed: ${error.message}`
        : "Web Scraper Cloud request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function requestWebscraperIoText(
  input: Pick<WebscraperIoRequestInput, "path" | "query" | "phase">,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<string> {
  const timeout = createProviderTimeout(context.signal, webscraperIoRequestTimeoutMs);
  try {
    const response = await context.fetcher(buildWebscraperIoUrl(input.path, context.apiKey, input.query), {
      method: "GET",
      headers: buildHeaders(false),
      signal: timeout.signal,
    });
    const content = await response.text();
    if (!response.ok) {
      throw createWebscraperIoError(response.status, parseJsonOrText(content), input.phase);
    }
    return content;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      timeout.didTimeout() || isAbortLikeError(error) ? 504 : 502,
      error instanceof Error
        ? `Web Scraper Cloud request failed: ${error.message}`
        : "Web Scraper Cloud request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildWebscraperIoUrl(path: string, apiKey: string, query?: Record<string, string | number | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${webscraperIoApiBaseUrl}/`);
  url.searchParams.set("api_token", apiKey);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

function buildHeaders(hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (hasBody) headers["content-type"] = "application/json";
  return headers;
}

async function readWebscraperIoJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Web Scraper Cloud returned invalid JSON");
  }
}

function parseJsonOrText(content: string): unknown {
  if (content.trim() === "") return content;
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return content;
  }
}

function createWebscraperIoError(status: number, payload: unknown, phase: WebscraperIoPhase): ProviderRequestError {
  const message = extractWebscraperIoErrorMessage(payload) ?? `Web Scraper Cloud request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  if (phase === "execute" && (status === 401 || status === 403))
    return new ProviderRequestError(status, message, payload);
  if (phase === "execute" && status >= 400 && status < 500) return new ProviderRequestError(status, message, payload);
  return new ProviderRequestError(status || 502, message, payload);
}

function extractWebscraperIoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") return payload;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const topLevelMessage =
    optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.error_message);
  if (topLevelMessage) return topLevelMessage;
  const dataMessage = optionalString(record.data);
  if (dataMessage) return dataMessage;
  if (Array.isArray(record.errors)) {
    for (const error of record.errors) {
      const errorRecord = optionalRecord(error);
      const message = optionalString(errorRecord?.message) ?? optionalString(errorRecord?.error);
      if (message) return message;
    }
  }
  return undefined;
}

function buildAccountLabel(account: {
  email: string | null;
  firstname: string | null;
  lastname: string | null;
}): string {
  const fullName = [account.firstname, account.lastname].filter(Boolean).join(" ").trim();
  return fullName || account.email || "Web Scraper Cloud API Token";
}

function buildCreateSitemapBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    _id: requiredString(input._id, "_id", providerInputError),
    startUrl: stringArray(input.startUrl, "startUrl", providerInputError),
    selectors: objectArray(input.selectors, "selectors", providerInputError),
    ...omitKeys(input, ["_id", "startUrl", "selectors"]),
  };
}

function buildUpdateSitemapBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    _id: requiredString(input._id, "_id", providerInputError),
    startUrl: stringArray(input.startUrl, "startUrl", providerInputError),
    selectors: objectArray(input.selectors, "selectors", providerInputError),
    ...omitKeys(input, ["sitemap_id", "_id", "startUrl", "selectors"]),
  };
}

function buildCreateScrapingJobBody(input: Record<string, unknown>): Record<string, unknown> {
  return withoutUndefined({
    sitemap_id: requirePositiveIntegerInput(input.sitemap_id, "sitemap_id"),
    driver: optionalString(input.driver),
    page_load_delay: optionalIntegerLike(input.page_load_delay, "page_load_delay", providerInputError),
    request_interval: optionalIntegerLike(input.request_interval, "request_interval", providerInputError),
    proxy: optionalString(input.proxy),
    start_urls: input.start_urls == null ? undefined : stringArray(input.start_urls, "start_urls", providerInputError),
    custom_id: optionalString(input.custom_id),
  });
}

function normalizeAccountInfo(account: Record<string, unknown>): {
  email: string | null;
  firstname: string | null;
  lastname: string | null;
  page_credits: number | null;
  raw: Record<string, unknown>;
} {
  return {
    email: readNullableString(account.email),
    firstname: readNullableString(account.firstname),
    lastname: readNullableString(account.lastname),
    page_credits: readNullableInteger(account.page_credits),
    raw: account,
  };
}

function normalizeSitemapDetail(record: Record<string, unknown>): Record<string, unknown> {
  const sitemapJson = requireStringResponse(record.sitemap, "sitemap");
  return {
    id: requirePositiveIntegerResponse(record.id, "sitemap id"),
    name: requireStringResponse(record.name, "sitemap name"),
    sitemap: parseSitemapJson(sitemapJson),
    sitemap_json: sitemapJson,
  };
}

function normalizeSitemapList(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    items: requireDataArray(payload, "Web Scraper Cloud sitemap list").map((item) =>
      normalizeSitemapSummary(requireObjectResponse(item, "sitemap summary")),
    ),
    ...readPagination(payload),
  };
}

function normalizeSitemapSummary(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requirePositiveIntegerResponse(record.id, "sitemap id"),
    name: requireStringResponse(record.name, "sitemap name"),
  };
}

function normalizeScrapingJobList(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    items: requireDataArray(payload, "Web Scraper Cloud scraping job list").map((item) =>
      normalizeScrapingJob(requireObjectResponse(item, "scraping job")),
    ),
    ...readPagination(payload),
  };
}

function normalizeScrapingJob(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requirePositiveIntegerResponse(record.id, "scraping job id"),
    custom_id: readNullableString(record.custom_id),
    sitemap_name: readNullableString(record.sitemap_name),
    status: readNullableString(record.status),
    sitemap_id: readNullableInteger(record.sitemap_id),
    test_run: readNullableInteger(record.test_run),
    jobs_scheduled: readNullableInteger(record.jobs_scheduled),
    jobs_executed: readNullableInteger(record.jobs_executed),
    jobs_failed: readNullableInteger(record.jobs_failed),
    jobs_empty: readNullableInteger(record.jobs_empty),
    jobs_no_value: readNullableInteger(record.jobs_no_value),
    stored_record_count: readNullableInteger(record.stored_record_count),
    request_interval: readNullableInteger(record.request_interval),
    page_load_delay: readNullableInteger(record.page_load_delay),
    driver: readNullableString(record.driver),
    scheduled: readNullableInteger(record.scheduled),
    time_created: readNullableInteger(record.time_created),
    scraping_duration: readNullableInteger(record.scraping_duration),
    raw: record,
  };
}

function normalizeJsonLines(content: string): Record<string, unknown> {
  const rows = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line, index) => parseJsonLine(line, index));
  return { rows, row_count: rows.length };
}

function normalizeOkResponse(payload: Record<string, unknown>, label: string): Record<string, boolean> {
  if (typeof payload.data === "string" && payload.data.trim().toLowerCase() === "ok") return { ok: true };
  throw new ProviderRequestError(502, `${label} was not acknowledged`, payload);
}

function parseSitemapJson(value: string): Record<string, unknown> {
  try {
    return requireObjectResponse(JSON.parse(value) as unknown, "sitemap JSON");
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(502, "Web Scraper Cloud returned invalid sitemap JSON");
  }
}

function parseJsonLine(line: string, index: number): Record<string, unknown> {
  try {
    return requireObjectResponse(JSON.parse(line) as unknown, `JSON Lines row ${index}`);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(502, `Web Scraper Cloud returned invalid JSON Lines row at index ${index}`);
  }
}

function readPagination(payload: Record<string, unknown>): Record<string, number> {
  return {
    current_page: requirePositiveIntegerResponse(payload.current_page, "current_page"),
    last_page: requirePositiveIntegerResponse(payload.last_page, "last_page"),
    total: requireNonNegativeIntegerResponse(payload.total, "total"),
    per_page: requireNonNegativeIntegerResponse(payload.per_page, "per_page"),
  };
}

function requireDataObject(payload: Record<string, unknown>, label: string): Record<string, unknown> {
  const data = optionalRecord(payload.data);
  if (!data) throw new ProviderRequestError(502, `${label} is missing an object data payload`, payload);
  return data;
}

function requireDataArray(payload: Record<string, unknown>, label: string): unknown[] {
  if (!Array.isArray(payload.data)) {
    throw new ProviderRequestError(502, `${label} is missing an array data payload`, payload);
  }
  return payload.data;
}

function requireObjectResponse(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${label} must be an object`, value);
  return record;
}

function requireStringResponse(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new ProviderRequestError(502, `${fieldName} is missing from provider response`);
  return parsed;
}

function requirePositiveIntegerResponse(value: unknown, fieldName: string): number {
  const parsed = readNullableInteger(value);
  if (parsed == null || parsed <= 0) throw new ProviderRequestError(502, `${fieldName} must be a positive integer`);
  return parsed;
}

function requireNonNegativeIntegerResponse(value: unknown, fieldName: string): number {
  const parsed = readNullableInteger(value);
  if (parsed == null || parsed < 0) throw new ProviderRequestError(502, `${fieldName} must be a non-negative integer`);
  return parsed;
}

function requirePositiveIntegerInput(value: unknown, fieldName: string): number {
  const parsed = readOptionalPositiveInteger(value, fieldName);
  if (parsed == null) throw new ProviderRequestError(400, `${fieldName} is required`);
  return parsed;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  const parsed = readNullableInteger(value);
  if (parsed == null) return undefined;
  if (parsed <= 0) throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  return parsed;
}

function readNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  return null;
}

function readNullableString(value: unknown): string | null {
  return value == null ? null : (optionalString(value) ?? null);
}

function omitKeys(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const keySet = new Set(keys);
  return Object.fromEntries(Object.entries(input).filter(([key]) => !keySet.has(key)));
}

function withoutUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
