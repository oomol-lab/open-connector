import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BestbuyActionName } from "./actions.ts";

import { optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const bestbuyApiOrigin = "https://api.bestbuy.com";
const bestbuyApiBasePath = "/v1";
const bestbuyValidationCategoryId = "abcat0010000";

type BestbuyActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type BestbuyActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const bestbuyActionHandlers: Record<BestbuyActionName, BestbuyActionHandler> = {
  get_categories(input, context) {
    return getCategories(input, context);
  },
  get_category_details(input, context) {
    return getCategoryDetails(input, context);
  },
  get_products(input, context) {
    return getProducts(input, context);
  },
  get_product_details(input, context) {
    return getProductDetails(input, context);
  },
  get_reviews(input, context) {
    return getReviews(input, context);
  },
  get_review_details(input, context) {
    return getReviewDetails(input, context);
  },
  get_stores(input, context) {
    return getStores(input, context);
  },
  get_store_details(input, context) {
    return getStoreDetails(input, context);
  },
};

export async function validateBestbuyCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await bestbuyGetJson(
    buildBestbuyCollectionPath("categories", [`id=${bestbuyValidationCategoryId}`]),
    {
      show: "id,name",
      pageSize: 1,
    },
    { apiKey, fetcher, signal },
    "validate",
  );
  const categories = readArray(payload.categories);

  return {
    profile: {
      accountId: "bestbuy-api-key",
      displayName: "Best Buy API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: `/v1/categories(id=${bestbuyValidationCategoryId})`,
      apiBaseUrl: bestbuyApiOrigin,
      categoryCount: categories.length,
    },
  };
}

async function getCategories(input: Record<string, unknown>, context: BestbuyActionContext): Promise<unknown> {
  return bestbuyGetJson(
    buildBestbuyCollectionPath("categories", buildCategoriesClauses(input)),
    buildBestbuyListQuery(input),
    context,
    "execute",
  );
}

async function getCategoryDetails(input: Record<string, unknown>, context: BestbuyActionContext): Promise<unknown> {
  const payload = await bestbuyGetJson(
    buildBestbuyCollectionPath("categories", [`id=${String(input.id)}`]),
    {
      show: optionalString(input.show),
      pageSize: 1,
    },
    context,
    "execute",
  );

  return pickFirstCollectionItem(payload, "categories", `category ${String(input.id)}`);
}

async function getProducts(input: Record<string, unknown>, context: BestbuyActionContext): Promise<unknown> {
  return bestbuyGetJson(
    buildBestbuyCollectionPath("products", buildProductsClauses(input)),
    buildBestbuyListQuery(input),
    context,
    "execute",
  );
}

async function getProductDetails(input: Record<string, unknown>, context: BestbuyActionContext): Promise<unknown> {
  const payload = await bestbuyGetJson(
    buildBestbuyCollectionPath("products", [`sku=${String(input.sku)}`]),
    {
      show: optionalString(input.show),
      pageSize: 1,
    },
    context,
    "execute",
  );

  return pickFirstCollectionItem(payload, "products", `product ${String(input.sku)}`);
}

async function getReviews(input: Record<string, unknown>, context: BestbuyActionContext): Promise<unknown> {
  validateReviewScoreRange(input);
  return bestbuyGetJson(
    buildBestbuyCollectionPath("reviews", buildReviewClauses(input)),
    buildBestbuyListQuery(input),
    context,
    "execute",
  );
}

async function getReviewDetails(input: Record<string, unknown>, context: BestbuyActionContext): Promise<unknown> {
  const payload = await bestbuyGetJson(
    buildBestbuyCollectionPath("reviews", [`id=${String(input.id)}`]),
    {
      show: optionalString(input.show),
      pageSize: 1,
    },
    context,
    "execute",
  );

  return pickFirstCollectionItem(payload, "reviews", `review ${String(input.id)}`);
}

async function getStores(input: Record<string, unknown>, context: BestbuyActionContext): Promise<unknown> {
  return bestbuyGetJson(
    buildBestbuyCollectionPath("stores", buildStoreClauses(input)),
    buildBestbuyListQuery(input),
    context,
    "execute",
  );
}

async function getStoreDetails(input: Record<string, unknown>, context: BestbuyActionContext): Promise<unknown> {
  const payload = await bestbuyGetJson(
    buildBestbuyCollectionPath("stores", [`storeId=${String(input.storeId)}`]),
    {
      show: optionalString(input.show),
      pageSize: 1,
    },
    context,
    "execute",
  );

  return pickFirstCollectionItem(payload, "stores", `store ${String(input.storeId)}`);
}

async function bestbuyGetJson(
  path: string,
  query: Record<string, string | number | undefined>,
  context: BestbuyActionContext,
  mode: "validate" | "execute",
): Promise<Record<string, unknown>> {
  const url = buildBestbuyUrl(path, query, context.apiKey);
  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: bestbuyHeaders(),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(502, toErrorMessage(error));
  }

  await assertBestbuyResponse(response, mode);
  try {
    return await readJsonObject(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "bestbuy response is not valid JSON");
  }
}

function buildBestbuyUrl(path: string, query: Record<string, string | number | undefined>, apiKey: string): string {
  const url = new URL(bestbuyApiOrigin);
  url.pathname = path;
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("format", "json");

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function buildBestbuyCollectionPath(resource: string, clauses: string[]): string {
  const filter = clauses.filter(Boolean).join("&");
  return `${bestbuyApiBasePath}/${resource}${filter ? `(${filter})` : ""}`;
}

function buildBestbuyListQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return {
    page: optionalInteger(input.page),
    pageSize: optionalInteger(input.pageSize),
    show: optionalString(input.show),
    sort: optionalString(input.sort),
  };
}

function buildCategoriesClauses(input: Record<string, unknown>): string[] {
  const clauses: string[] = [];
  const id = optionalString(input.id);
  if (id) {
    clauses.push(buildPipeSeparatedEqualsClause("id", id));
  }

  const name = optionalString(input.name);
  if (name) {
    clauses.push(buildPipeSeparatedTextClause("name", name));
  }

  return clauses;
}

function buildProductsClauses(input: Record<string, unknown>): string[] {
  const clauses: string[] = [];
  if (input.sku != null) {
    clauses.push(buildEqualityClause("sku", String(input.sku)));
  }

  const upc = optionalString(input.upc);
  if (upc) {
    clauses.push(buildEqualityClause("upc", upc));
  }

  const name = optionalString(input.name);
  if (name) {
    clauses.push(buildTextOrRawClause("name", name));
  }

  const salePrice = optionalString(input.salePrice);
  if (salePrice) {
    clauses.push(buildComparatorOrRawClause("salePrice", salePrice));
  }

  const categoryPathId = optionalString(input.categoryPathId) ?? optionalString(input["categoryPath.id"]);
  if (categoryPathId) {
    clauses.push(buildEqualityClause("categoryPath.id", categoryPathId));
  }

  return clauses;
}

function buildReviewClauses(input: Record<string, unknown>): string[] {
  const clauses: string[] = [];
  const sku = input.sku != null ? String(input.sku) : undefined;
  if (sku) {
    clauses.push(buildEqualityClause("sku", sku));
  }

  const reviewer = optionalString(input.reviewer);
  if (reviewer) {
    clauses.push(buildTextOrRawClause("reviewer", reviewer));
  }

  const minScore = optionalInteger(input.minScore);
  if (minScore !== undefined) {
    clauses.push(`rating>=${minScore}`);
  }

  const maxScore = optionalInteger(input.maxScore);
  if (maxScore !== undefined) {
    clauses.push(`rating<=${maxScore}`);
  }

  return clauses;
}

function buildStoreClauses(input: Record<string, unknown>): string[] {
  const clauses: string[] = [];
  const geo = optionalRecord(input.geo);
  if (geo) {
    const lat = readRequiredNumber(geo.lat, "geo.lat");
    const long = readRequiredNumber(geo.long, "geo.long");
    const radius = optionalInteger(geo.radius) ?? 10;
    clauses.push(`area(${lat},${long},${radius})`);
  }

  const city = optionalString(input.city);
  if (city) {
    clauses.push(buildTextOrRawClause("city", city));
  }

  const region = optionalString(input.region) ?? optionalString(input.state);
  if (region) {
    clauses.push(buildTextOrRawClause("region", region));
  }

  if (input.storeId != null) {
    clauses.push(buildEqualityClause("storeId", String(input.storeId)));
  }

  const storeType = optionalString(input.storeType);
  if (storeType) {
    clauses.push(buildTextOrRawClause("storeType", storeType));
  }

  const postalCode = optionalString(input.postalCode);
  if (postalCode) {
    clauses.push(buildEqualityClause("postalCode", postalCode));
  }

  const services = optionalString(input.services);
  if (services) {
    clauses.push(buildTextOrRawClause("services", services));
  }

  return clauses;
}

function validateReviewScoreRange(input: Record<string, unknown>): void {
  const minScore = optionalInteger(input.minScore);
  const maxScore = optionalInteger(input.maxScore);
  if (minScore !== undefined && maxScore !== undefined && minScore > maxScore) {
    throw new ProviderRequestError(400, "minScore must be less than or equal to maxScore");
  }
}

function buildPipeSeparatedEqualsClause(field: string, value: string): string {
  if (startsWithFieldClause(field, value)) {
    return value;
  }

  const parts = value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return buildEqualityClause(field, value);
  }
  return parts.map((item) => buildEqualityClause(field, item)).join("|");
}

function buildPipeSeparatedTextClause(field: string, value: string): string {
  if (startsWithFieldClause(field, value)) {
    return value;
  }

  const parts = value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return buildTextOrRawClause(field, value);
  }
  return parts.map((item) => buildTextOrRawClause(field, item)).join("|");
}

function buildEqualityClause(field: string, value: string): string {
  return `${field}=${value}`;
}

function buildTextOrRawClause(field: string, value: string): string {
  if (startsWithFieldClause(field, value)) {
    return value;
  }
  return `${field}=${quoteBestbuyValue(value)}`;
}

function buildComparatorOrRawClause(field: string, value: string): string {
  if (startsWithFieldClause(field, value)) {
    return value;
  }

  const trimmed = value.trim();
  if (
    trimmed.startsWith(">=") ||
    trimmed.startsWith("<=") ||
    trimmed.startsWith("!=") ||
    trimmed.startsWith(">") ||
    trimmed.startsWith("<") ||
    trimmed.startsWith("=")
  ) {
    return `${field}${trimmed}`;
  }

  return `${field}=${value}`;
}

function startsWithFieldClause(field: string, value: string): boolean {
  const normalized = value.trim();
  return (
    normalized.startsWith(`${field}=`) ||
    normalized.startsWith(`${field}>`) ||
    normalized.startsWith(`${field}<`) ||
    normalized.startsWith(`${field}!`)
  );
}

function quoteBestbuyValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (typeof parsed !== "string") {
        throw new Error("Best Buy filter value must be a string literal");
      }
      return JSON.stringify(parsed);
    } catch {
      throw new ProviderRequestError(400, "Best Buy filter value contains invalid quoted text");
    }
  }
  return JSON.stringify(trimmed);
}

function pickFirstCollectionItem(
  payload: Record<string, unknown>,
  collectionKey: string,
  label: string,
): Record<string, unknown> {
  const items = readArray(payload[collectionKey]);
  if (items.length === 0) {
    throw new ProviderRequestError(404, `${label} was not found`);
  }

  const first = optionalRecord(items[0]);
  if (!first) {
    throw new ProviderRequestError(502, `bestbuy ${collectionKey} item is invalid`);
  }

  return first;
}

function bestbuyHeaders(): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
}

async function assertBestbuyResponse(response: Response, mode: "validate" | "execute"): Promise<void> {
  if (response.ok) {
    return;
  }

  const message = await readBestbuyError(response);

  if (response.status === 429) {
    throw new ProviderRequestError(429, message);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, message);
  }
  if (mode === "execute" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(response.status, message);
  }
  if (response.status === 400 || response.status === 404) {
    throw new ProviderRequestError(response.status, message);
  }

  throw new ProviderRequestError(response.status, message);
}

async function readBestbuyError(response: Response): Promise<string> {
  let text = "";
  try {
    text = await response.text();
  } catch {
    return `bestbuy request failed with ${response.status}`;
  }

  try {
    const payload = JSON.parse(text) as {
      error?: unknown;
      message?: unknown;
      errors?: unknown;
    };
    if (typeof payload.message === "string" && payload.message.length > 0) {
      return payload.message;
    }
    if (typeof payload.error === "string" && payload.error.length > 0) {
      return payload.error;
    }
    if (Array.isArray(payload.errors) && typeof payload.errors[0] === "string") {
      return String(payload.errors[0]);
    }
  } catch {}

  return text || `bestbuy request failed with ${response.status}`;
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  const payload = (await response.json()) as unknown;
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "bestbuy response is not an object");
  }
  return record;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "bestbuy request failed";
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  const number = optionalNumber(value);
  if (number === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be a number`);
  }
  return number;
}
