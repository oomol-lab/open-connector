import type { ProviderActionHandlers, ProviderActionName, ProviderActionSources } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { mapProviderActionSources, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const jungleScoutApiBaseUrl = "https://developer.junglescout.com/api/";

interface JungleScoutContext {
  apiKey: string;
  keyName: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
interface Endpoint {
  method: "GET" | "POST";
  path: string;
  bodyType?: string;
}

const endpointByActionName: ProviderActionSources<"junglescout", Endpoint> = {
  get_keywords_by_asin: { method: "POST", path: "keywords/keywords_by_asin_query", bodyType: "keywords_by_asin_query" },
  get_keywords_by_keyword: {
    method: "POST",
    path: "keywords/keywords_by_keyword_query",
    bodyType: "keywords_by_keyword_query",
  },
  get_historical_search_volume: { method: "GET", path: "keywords/historical_search_volume" },
  search_products: { method: "POST", path: "product_database_query", bodyType: "product_database_query" },
  get_sales_estimates: { method: "GET", path: "sales_estimates_query" },
  get_share_of_voice: { method: "GET", path: "share_of_voice" },
};

export const jungleScoutActionHandlers: ProviderActionHandlers<
  "junglescout",
  (input: Record<string, unknown>, context: JungleScoutContext) => Promise<unknown>
> = mapProviderActionSources(
  "junglescout",
  endpointByActionName,
  (actionName): ((input: Record<string, unknown>, context: JungleScoutContext) => Promise<unknown>) =>
    (input, context) =>
      executeJungleScoutAction(actionName, input, context),
);

export function validateJungleScoutCredential(
  apiKey: string,
  keyName: string,
): { profile: { accountId: string; displayName: string }; grantedScopes: string[]; metadata: Record<string, unknown> } {
  if (!apiKey.trim()) throw new ProviderRequestError(400, "apiKey is required");
  if (!keyName.trim()) throw new ProviderRequestError(400, "keyName is required");
  return {
    profile: { accountId: `junglescout:${keyName.trim()}`, displayName: "Jungle Scout API Key" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: jungleScoutApiBaseUrl,
      apiType: "junglescout",
      keyName: keyName.trim(),
      validationMode: "local",
    },
  };
}

async function executeJungleScoutAction(
  actionName: ProviderActionName<"junglescout">,
  input: Record<string, unknown>,
  context: JungleScoutContext,
): Promise<unknown> {
  const endpoint = endpointByActionName[actionName];
  if (!endpoint) throw new ProviderRequestError(400, `unknown Jungle Scout action: ${actionName}`);
  const normalizedInput = validateAndNormalizeInput(actionName, input);
  const url = new URL(endpoint.path, jungleScoutApiBaseUrl);
  appendQuery(url, normalizedInput, endpoint.method);
  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: endpoint.method,
      headers: jungleScoutHeaders(`${context.keyName}:${context.apiKey}`),
      body: endpoint.bodyType
        ? JSON.stringify({ data: { type: endpoint.bodyType, attributes: requestAttributes(normalizedInput) } })
        : undefined,
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Jungle Scout request failed: ${error.message}` : "Jungle Scout request failed",
    );
  }
  const text = await response.text().catch(() => "");
  const payload = parseJson(text);
  if (!response.ok) throw createJungleScoutError(response.status, payload);
  const record = optionalRecord(payload);
  if (!record || !("data" in record))
    throw new ProviderRequestError(502, "Jungle Scout returned an invalid JSON:API response", payload);
  return record;
}

export function jungleScoutHeaders(authorization: string): Record<string, string> {
  return {
    accept: "application/vnd.junglescout.v1+json",
    authorization,
    "content-type": "application/vnd.api+json",
    "user-agent": providerUserAgent,
    "x-api-type": "junglescout",
  };
}

function validateAndNormalizeInput(actionName: string, source: Record<string, unknown>): Record<string, unknown> {
  const input = { ...source };
  if (actionName === "get_keywords_by_asin") {
    if (!Array.isArray(input.asins)) throw new ProviderRequestError(400, "asins is required");
    input.asins = input.asins.map((value) => normalizeAsin(value, false));
    validateRanges(input, keywordRanges);
  } else if (actionName === "get_keywords_by_keyword") {
    input.search_terms = normalizedRequiredString(input.search_terms, "search_terms");
    if (Array.isArray(input.categories))
      input.categories = input.categories.map((value) => normalizedRequiredString(value, "categories"));
    validateRanges(input, keywordRanges);
  } else if (actionName === "get_historical_search_volume") {
    input.keyword = normalizedRequiredString(input.keyword, "keyword");
    validateDateRange(input, 366);
  } else if (actionName === "search_products") {
    validateRanges(input, productRanges);
    validateOptionalDate(input.min_updated_at, "min_updated_at");
    validateOptionalDate(input.max_updated_at, "max_updated_at");
  } else if (actionName === "get_sales_estimates") {
    input.asin = normalizeAsin(input.asin, true);
    validateDateRange(input);
    const endDate = normalizedRequiredString(input.end_date, "end_date");
    if (endDate >= new Date().toISOString().slice(0, 10))
      throw new ProviderRequestError(400, "end_date must be before the current date");
  } else if (actionName === "get_share_of_voice") {
    input.keyword = normalizedRequiredString(input.keyword, "keyword");
  }
  return input;
}

const keywordRanges = [
  ["min_monthly_search_volume_exact", "max_monthly_search_volume_exact"],
  ["min_monthly_search_volume_broad", "max_monthly_search_volume_broad"],
  ["min_word_count", "max_word_count"],
  ["min_organic_product_count", "max_organic_product_count"],
] as const;
const productRanges = [
  ["min_price", "max_price"],
  ["min_net", "max_net"],
  ["min_rank", "max_rank"],
  ["min_sales", "max_sales"],
  ["min_revenue", "max_revenue"],
  ["min_reviews", "max_reviews"],
  ["min_rating", "max_rating"],
  ["min_weight", "max_weight"],
  ["min_sellers", "max_sellers"],
  ["min_lqs", "max_lqs"],
  ["min_updated_at", "max_updated_at"],
] as const;

function validateRanges(input: Record<string, unknown>, ranges: readonly (readonly [string, string])[]): void {
  for (const [minimumField, maximumField] of ranges) {
    const minimum = input[minimumField];
    const maximum = input[maximumField];
    if (
      ((typeof minimum === "number" && typeof maximum === "number") ||
        (typeof minimum === "string" && typeof maximum === "string")) &&
      minimum > maximum
    ) {
      throw new ProviderRequestError(400, `${minimumField} must not be greater than ${maximumField}`);
    }
  }
}
function validateDateRange(input: Record<string, unknown>, maximumDays?: number): void {
  const startDate = normalizedRequiredString(input.start_date, "start_date");
  const endDate = normalizedRequiredString(input.end_date, "end_date");
  if (!isIsoDate(startDate) || !isIsoDate(endDate))
    throw new ProviderRequestError(400, "start_date and end_date must use YYYY-MM-DD format");
  validateRanges(input, [["start_date", "end_date"]]);
  if (maximumDays !== undefined && Date.parse(endDate) - Date.parse(startDate) > maximumDays * 86_400_000)
    throw new ProviderRequestError(400, `start_date and end_date must be no more than ${maximumDays} days apart`);
}
function normalizeAsin(value: unknown, salesEstimate: boolean): string {
  const asin = normalizedRequiredString(value, "asin").toUpperCase();
  if (asin.length !== 10 || !isAsciiLettersAndDigits(asin))
    throw new ProviderRequestError(400, "ASIN must contain 10 ASCII letters or digits");
  if (
    salesEstimate &&
    !(asin.startsWith("B") || (isAsciiDigits(asin.slice(0, 9)) && (asin[9] === "X" || isAsciiDigits(asin[9] ?? ""))))
  )
    throw new ProviderRequestError(400, "ASIN must use the format accepted by Jungle Scout sales estimates");
  return asin;
}
function normalizedRequiredString(value: unknown, field: string): string {
  const result = optionalString(value)?.trim();
  if (!result) throw new ProviderRequestError(400, `${field} must be a non-empty string`);
  return result;
}
function isAsciiLettersAndDigits(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (!((code >= 48 && code <= 57) || (code >= 65 && code <= 90))) return false;
  }
  return true;
}
function isAsciiDigits(value: string): boolean {
  if (!value) return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 48 || code > 57) return false;
  }
  return true;
}
function isIsoDate(value: string): boolean {
  if (value.length !== 10 || value[4] !== "-" || value[7] !== "-") return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}
function validateOptionalDate(value: unknown, field: string): void {
  if (value === undefined) return;
  const date = normalizedRequiredString(value, field);
  if (!isIsoDate(date)) throw new ProviderRequestError(400, `${field} must use YYYY-MM-DD format`);
}
function appendQuery(url: URL, input: Record<string, unknown>, method: "GET" | "POST"): void {
  const entries =
    method === "GET"
      ? Object.entries(input)
      : Object.entries({
          marketplace: input.marketplace,
          sort: input.sort,
          collapse_by_parent: input.collapse_by_parent,
          page_size: input.page_size,
          cursor: input.cursor,
        });
  for (const [name, value] of entries)
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      url.searchParams.set(
        name === "page_size" ? "page[size]" : name === "cursor" ? "page[cursor]" : name,
        String(value),
      );
}
function requestAttributes(input: Record<string, unknown>): Record<string, unknown> {
  const {
    marketplace: _marketplace,
    sort: _sort,
    collapse_by_parent: _collapse,
    page_size: _pageSize,
    cursor: _cursor,
    ...attributes
  } = input;
  return attributes;
}
function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
function createJungleScoutError(status: number, payload: unknown): ProviderRequestError {
  const record = optionalRecord(payload);
  const first = Array.isArray(record?.errors) ? optionalRecord(record.errors[0]) : undefined;
  const message =
    optionalString(first?.detail)?.trim() ||
    optionalString(first?.title)?.trim() ||
    optionalString(first?.code)?.trim() ||
    `Jungle Scout request failed with HTTP ${status}`;
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}
