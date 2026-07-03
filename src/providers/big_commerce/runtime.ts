import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BigCommerceActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const bigCommerceApiHost = "https://api.bigcommerce.com";
const bigCommerceApiVersion = "v3";
const bigCommerceCredentialHelpUrl = "https://support.bigcommerce.com/s/article/Store-API-Accounts";

type BigCommerceRequestPhase = "validate" | "execute";
type BigCommerceQueryValue = string | number | boolean | undefined;
type BigCommerceActionHandler = ProviderRuntimeHandler<BigCommerceContext>;

export interface BigCommerceContext {
  apiKey: string;
  storeHash: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface BigCommerceRequestOptions {
  context: BigCommerceContext;
  path: string;
  phase: BigCommerceRequestPhase;
  method?: string;
  query?: Record<string, BigCommerceQueryValue>;
  body?: Record<string, unknown>;
  allowEmptyResponse?: boolean;
  notFoundAsInvalidInput?: boolean;
}

export const bigCommerceActionHandlers: Record<BigCommerceActionName, BigCommerceActionHandler> = {
  list_products(input, context) {
    return listProducts(input, context);
  },
  get_product(input, context) {
    return getProduct(input, context);
  },
  create_product(input, context) {
    return createProduct(input, context);
  },
  update_product(input, context) {
    return updateProduct(input, context);
  },
  delete_product(input, context) {
    return deleteProduct(input, context);
  },
};

export async function validateBigCommerceCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const storeHash = normalizeBigCommerceStoreHash(input.values.storeHash);
  const apiBaseUrl = buildBigCommerceApiBaseUrl(storeHash);
  const payload = await requestBigCommerceJson<unknown>({
    context: {
      apiKey: input.apiKey,
      storeHash,
      fetcher,
      signal,
    },
    path: "/catalog/products",
    query: { limit: 1 },
    phase: "validate",
  });
  const listPayload = normalizeListPayload(payload);
  const pagination = normalizePagination(listPayload.meta);
  const sampleProduct = listPayload.data.map(optionalRecord).find((item) => item != null);

  return {
    profile: {
      accountId: `big_commerce:${storeHash}`,
      displayName: `BigCommerce ${storeHash}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      storeHash,
      apiBaseUrl,
      validationEndpoint: `/${bigCommerceApiVersion}/catalog/products?limit=1`,
      productCount: pagination.total ?? undefined,
      sampleProductId: optionalInteger(sampleProduct?.id),
      credentialHelpUrl: bigCommerceCredentialHelpUrl,
    }),
  };
}

export function normalizeBigCommerceStoreHash(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new ProviderRequestError(400, "storeHash is required");
  }

  let candidate = trimmed;
  if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
    try {
      const parsed = new URL(candidate);
      const segments = parsed.pathname.split("/").filter(Boolean);
      const storeIndex = segments.indexOf("stores");
      if (storeIndex >= 0 && segments[storeIndex + 1]) {
        candidate = segments[storeIndex + 1];
      } else {
        candidate = parsed.hostname.split(".")[0] ?? "";
      }
    } catch {
      throw new ProviderRequestError(400, "storeHash must be a BigCommerce store hash");
    }
  }

  const normalized = candidate.trim();
  if (!isValidStoreHash(normalized)) {
    throw new ProviderRequestError(400, "storeHash must be a BigCommerce store hash");
  }
  return normalized;
}

export function buildBigCommerceApiBaseUrl(storeHash: string): string {
  return `${bigCommerceApiHost}/stores/${storeHash}/${bigCommerceApiVersion}`;
}

function isValidStoreHash(value: string): boolean {
  if (value.length === 0 || value.length > 64) {
    return false;
  }

  for (const char of value) {
    const code = char.charCodeAt(0);
    const isLowerAlpha = code >= 97 && code <= 122;
    const isUpperAlpha = code >= 65 && code <= 90;
    const isDigit = code >= 48 && code <= 57;
    if (!isLowerAlpha && !isUpperAlpha && !isDigit) {
      return false;
    }
  }
  return true;
}

async function listProducts(
  input: Record<string, unknown>,
  context: BigCommerceContext,
): Promise<Record<string, unknown>> {
  const payload = await requestBigCommerceJson<unknown>({
    context,
    path: "/catalog/products",
    query: compactObject({
      page: optionalInteger(input.page),
      limit: optionalInteger(input.limit),
      keyword: optionalString(input.keyword),
      name: optionalString(input.name),
      sku: optionalString(input.sku),
      is_visible: optionalBoolean(input.isVisible),
      include: commaList(input.include),
      include_fields: commaList(input.includeFields),
      exclude_fields: commaList(input.excludeFields),
      sort: optionalString(input.sort),
      direction: optionalString(input.direction),
    }),
    phase: "execute",
  });
  const listPayload = normalizeListPayload(payload);
  return {
    products: listPayload.data.map(normalizeProduct),
    pagination: normalizePagination(listPayload.meta),
  };
}

async function getProduct(
  input: Record<string, unknown>,
  context: BigCommerceContext,
): Promise<Record<string, unknown>> {
  const productId = requireInputInteger(input.productId, "productId");
  const payload = await requestBigCommerceJson<unknown>({
    context,
    path: `/catalog/products/${productId}`,
    query: buildProductReadQuery(input),
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { product: normalizeProduct(extractDataRecord(payload)) };
}

async function createProduct(
  input: Record<string, unknown>,
  context: BigCommerceContext,
): Promise<Record<string, unknown>> {
  const payload = await requestBigCommerceJson<unknown>({
    context,
    path: "/catalog/products",
    method: "POST",
    body: buildProductBody(input),
    phase: "execute",
  });
  return { product: normalizeProduct(extractDataRecord(payload)) };
}

async function updateProduct(
  input: Record<string, unknown>,
  context: BigCommerceContext,
): Promise<Record<string, unknown>> {
  const productId = requireInputInteger(input.productId, "productId");
  const body = buildProductBody(input, ["productId"]);
  if (Object.keys(body).length === 0) {
    throw new ProviderRequestError(400, "at least one product field must be provided for update");
  }

  const payload = await requestBigCommerceJson<unknown>({
    context,
    path: `/catalog/products/${productId}`,
    method: "PUT",
    body,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { product: normalizeProduct(extractDataRecord(payload)) };
}

async function deleteProduct(
  input: Record<string, unknown>,
  context: BigCommerceContext,
): Promise<Record<string, unknown>> {
  const productId = requireInputInteger(input.productId, "productId");
  await requestBigCommerceJson<unknown>({
    context,
    path: `/catalog/products/${productId}`,
    method: "DELETE",
    phase: "execute",
    allowEmptyResponse: true,
    notFoundAsInvalidInput: true,
  });
  return { success: true, productId };
}

async function requestBigCommerceJson<T>(input: BigCommerceRequestOptions): Promise<T> {
  const url = new URL(`${buildBigCommerceApiBaseUrl(input.context.storeHash)}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: buildBigCommerceHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
    payload = await readBigCommercePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "unknown error";
    throw new ProviderRequestError(502, `big_commerce ${input.phase} request failed: ${message}`);
  }

  if (!response.ok) {
    throw createBigCommerceError(response, payload, input.phase, input.notFoundAsInvalidInput);
  }

  if (payload == null) {
    if (input.allowEmptyResponse) {
      return null as T;
    }
    throw new ProviderRequestError(502, "big_commerce response body is empty");
  }

  return payload as T;
}

async function readBigCommercePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "big_commerce response body is not JSON");
  }
}

function buildBigCommerceHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    "x-auth-token": apiKey,
    "user-agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

function createBigCommerceError(
  response: Response,
  payload: unknown,
  phase: BigCommerceRequestPhase,
  notFoundAsInvalidInput: boolean | undefined,
): ProviderRequestError {
  const message =
    extractBigCommerceErrorMessage(payload) ?? response.statusText ?? `big_commerce ${phase} request failed`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(404, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(502, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractBigCommerceErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.title) ??
    optionalString(record.detail) ??
    optionalString(record.message) ??
    optionalString(record.error)
  );
}

function normalizeListPayload(payload: unknown): { data: unknown[]; meta: unknown } {
  const record = optionalRecord(payload);
  if (!record || !Array.isArray(record.data)) {
    throw new ProviderRequestError(502, "big_commerce list response is invalid");
  }
  return {
    data: record.data,
    meta: record.meta,
  };
}

function extractDataRecord(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  const data = optionalRecord(record?.data);
  if (!data) {
    throw new ProviderRequestError(502, "big_commerce product response is invalid");
  }
  return data;
}

function normalizeProduct(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "big_commerce product record is invalid");
  }

  const id = optionalInteger(record.id);
  const name = optionalString(record.name);
  if (id === undefined || !name) {
    throw new ProviderRequestError(502, "big_commerce product is missing id or name");
  }

  return {
    id,
    name,
    type: optionalString(record.type) ?? null,
    sku: optionalString(record.sku) ?? null,
    price: optionalDecimalNumber(record.price) ?? null,
    inventoryLevel: optionalInteger(record.inventory_level) ?? null,
    isVisible: optionalBoolean(record.is_visible) ?? null,
    customUrl: normalizeCustomUrl(record.custom_url),
    raw: record,
  };
}

function optionalDecimalNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeCustomUrl(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  const record = optionalRecord(value);
  return optionalString(record?.url) ?? null;
}

function normalizePagination(meta: unknown): Record<string, number | null> {
  const pagination = optionalRecord(optionalRecord(meta)?.pagination);
  return {
    total: optionalInteger(pagination?.total) ?? null,
    count: optionalInteger(pagination?.count) ?? null,
    perPage: optionalInteger(pagination?.per_page) ?? null,
    currentPage: optionalInteger(pagination?.current_page) ?? null,
    totalPages: optionalInteger(pagination?.total_pages) ?? null,
  };
}

function buildProductReadQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    include: commaList(input.include),
    include_fields: commaList(input.includeFields),
    exclude_fields: commaList(input.excludeFields),
  });
}

function buildProductBody(input: Record<string, unknown>, omittedKeys: string[] = []): Record<string, unknown> {
  const omitted = new Set(omittedKeys);
  return compactObject({
    name: omitted.has("name") ? undefined : optionalString(input.name),
    type: omitted.has("type") ? undefined : optionalString(input.type),
    price: omitted.has("price") ? undefined : optionalNumber(input.price),
    sku: omitted.has("sku") ? undefined : optionalString(input.sku),
    weight: omitted.has("weight") ? undefined : optionalNumber(input.weight),
    description: omitted.has("description") ? undefined : optionalString(input.description),
    is_visible: omitted.has("isVisible") ? undefined : optionalBoolean(input.isVisible),
    inventory_tracking: omitted.has("inventoryTracking") ? undefined : optionalString(input.inventoryTracking),
    inventory_level: omitted.has("inventoryLevel") ? undefined : optionalInteger(input.inventoryLevel),
    categories: omitted.has("categories") ? undefined : integerArray(input.categories),
    brand_id: omitted.has("brandId") ? undefined : optionalInteger(input.brandId),
    custom_url: omitted.has("customUrl") ? undefined : buildCustomUrl(input.customUrl),
  });
}

function buildCustomUrl(value: unknown): Record<string, unknown> | undefined {
  const url = optionalString(value);
  if (!url) {
    return undefined;
  }
  return {
    url,
    is_customized: true,
  };
}

function commaList(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value.map(String).filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized.join(",") : undefined;
}

function integerArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => requireInputInteger(item, "categories"));
}

function requireInputInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}
