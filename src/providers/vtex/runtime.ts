import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { VtexActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, positiveInteger, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const vtexEnvironment = "vtexcommercestable";
export const vtexCredentialHelpUrl = "https://developers.vtex.com/docs/guides/api-authentication-using-api-keys";

type VtexQueryValue = string | number | boolean | readonly string[] | undefined;
type VtexActionHandler = (input: Record<string, unknown>, context: VtexContext) => Promise<unknown>;

export interface VtexContext {
  appKey: string;
  appToken: string;
  accountName: string;
  environment: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface VtexRequestInput {
  path: string;
  query?: Record<string, VtexQueryValue>;
}

export const vtexActionHandlers: Record<VtexActionName, VtexActionHandler> = {
  list_product_and_sku_ids(input, context) {
    return listProductAndSkuIds(input, context);
  },
  get_product(input, context) {
    return getProduct(input, context);
  },
  list_brands(_input, context) {
    return listBrands(context);
  },
  list_category_tree(input, context) {
    return listCategoryTree(input, context);
  },
  search_products(input, context) {
    return searchProducts(input, context);
  },
};

export async function validateVtexCredential(input: {
  appKey: string;
  appToken?: string;
  accountName?: string;
  environment?: string;
}): Promise<CredentialValidationResult> {
  const appKey = requiredString(input.appKey, "apiKey", invalidInputError);
  requireVtexAppToken(input.appToken);
  const accountName = readVtexAccountName(input.accountName);
  const environment = normalizeVtexEnvironment(input.environment);

  return {
    profile: {
      accountId: `vtex:${accountName}.${environment}`,
      displayName: `VTEX ${accountName}`,
    },
    grantedScopes: [],
    metadata: {
      accountName,
      environment,
      apiBaseUrl: buildVtexApiBaseUrl(accountName, environment),
      credentialHelpUrl: vtexCredentialHelpUrl,
      validationMode: "format_only",
      appKeyTail: appKey.slice(-4),
    },
  };
}

async function listProductAndSkuIds(input: Record<string, unknown>, context: VtexContext): Promise<unknown> {
  const payload = await requestVtexJson(context, {
    path: "/api/catalog_system/pvt/products/GetProductAndSkuIds",
    query: compactObject({
      categoryId: readOptionalNumber(input.categoryId),
      _from: readOptionalNumber(input.from),
      _to: readOptionalNumber(input.to),
    }),
  });
  const body = requireVtexObject(payload, "vtex product and SKU ID response is missing object body");
  return {
    productIdsByProductId: requireVtexObject(body.data, "vtex product and SKU ID response is missing data"),
    range: requireVtexObject(body.range, "vtex product and SKU ID response is missing range"),
  };
}

async function getProduct(input: Record<string, unknown>, context: VtexContext): Promise<unknown> {
  const productId = positiveInteger(input.productId, "productId", invalidInputError);
  const product = await requestVtexJson(context, {
    path: `/api/catalog/pvt/product/${productId}`,
  });
  return { product: requireVtexObject(product, "vtex product response is missing product object") };
}

async function listBrands(context: VtexContext): Promise<unknown> {
  const brands = await requestVtexJson(context, {
    path: "/api/catalog_system/pvt/brand/list",
  });
  return { brands: requireVtexArray(brands, "vtex brand list response is not an array") };
}

async function listCategoryTree(input: Record<string, unknown>, context: VtexContext): Promise<unknown> {
  const categoryLevels = positiveInteger(input.categoryLevels, "categoryLevels", invalidInputError);
  const categories = await requestVtexJson(context, {
    path: `/api/catalog_system/pub/category/tree/${categoryLevels}`,
  });
  return {
    categories: requireVtexArray(categories, "vtex category tree response is not an array"),
  };
}

async function searchProducts(input: Record<string, unknown>, context: VtexContext): Promise<unknown> {
  assertSearchPaginationRange(input);
  const products = await requestVtexJson(context, {
    path: "/api/catalog_system/pub/products/search",
    query: compactObject({
      ft: optionalString(input.fullText),
      fq: readStringArray(input.filterQueries),
      O: optionalString(input.orderBy),
      _from: readOptionalNumber(input.from),
      _to: readOptionalNumber(input.to),
    }),
  });
  return { products: requireVtexArray(products, "vtex product search response is not an array") };
}

async function requestVtexJson(context: VtexContext, request: VtexRequestInput): Promise<unknown> {
  const appToken = requireVtexAppToken(context.appToken);
  const url = new URL(request.path, buildVtexApiBaseUrl(context.accountName, context.environment));
  appendVtexQuery(url, request.query);

  let response: Response;
  try {
    response = await context.fetcher(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-vtex-api-appkey": context.appKey,
        "x-vtex-api-apptoken": appToken,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `vtex request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
      error,
    );
  }

  const payload = await readVtexJson(response);
  if (!response.ok) {
    throw mapVtexError(response.status, readVtexErrorMessage(payload), payload);
  }
  return payload;
}

async function readVtexJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "vtex returned malformed JSON");
    }
    return { message: text };
  }
}

function mapVtexError(status: number, message: string, payload: unknown): ProviderRequestError {
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function readVtexErrorMessage(payload: unknown): string {
  const body = optionalRecord(payload);
  const nestedError = optionalRecord(body?.error);
  return (
    optionalString(nestedError?.message) ??
    optionalString(body?.message) ??
    optionalString(body?.Message) ??
    optionalString(body?.error) ??
    "vtex request failed"
  );
}

function requireVtexObject(value: unknown, message: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message, value);
  }
  return object;
}

function requireVtexArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message, value);
  }
  return value;
}

function appendVtexQuery(url: URL, query: Record<string, VtexQueryValue> | undefined): void {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

export function requireVtexAppToken(value: unknown): string {
  return requiredString(value, "vtex appToken", invalidInputError);
}

export function readVtexAccountName(value: unknown): string {
  const accountName = optionalString(value)?.toLowerCase();
  if (!accountName || !isValidVtexAccountName(accountName)) {
    throw new ProviderRequestError(400, "vtex accountName must be a valid account label");
  }
  return accountName;
}

function isValidVtexAccountName(value: string): boolean {
  if (value.length > 63 || value.startsWith("-") || value.endsWith("-")) {
    return false;
  }

  for (const char of value) {
    const code = char.charCodeAt(0);
    const isLowercaseLetter = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    if (!isLowercaseLetter && !isDigit && char !== "-") {
      return false;
    }
  }
  return true;
}

export function normalizeVtexEnvironment(value: unknown): string {
  const environment = optionalString(value) || vtexEnvironment;
  if (environment !== vtexEnvironment) {
    throw new ProviderRequestError(400, `vtex environment must be ${vtexEnvironment}`);
  }
  return environment;
}

export function buildVtexApiBaseUrl(accountName: string, environment: string): string {
  return `https://${accountName}.${environment}.com.br`;
}

function readStringArray(value: unknown): string[] | undefined {
  if (value === undefined || !Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function assertSearchPaginationRange(input: Record<string, unknown>): void {
  const from = readOptionalNumber(input.from);
  const to = readOptionalNumber(input.to);
  if (from === undefined || to === undefined) {
    return;
  }
  if (to < from || to - from > 50) {
    throw new ProviderRequestError(
      400,
      "to must be greater than or equal to from and no more than 50 greater than from",
    );
  }
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
