import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { FirstbaseActionName } from "./actions.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const firstbaseApiBaseUrl = "https://apipub.firstbasehq.com";
const firstbaseValidationPath = "/api/v1/inventory?page=1&size=1";

type FirstbaseRequestMode = "validate" | "execute";
type FirstbaseQueryValue = string | string[];

export const firstbaseActionHandlers: Record<FirstbaseActionName, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async list_inventory(input, context) {
    validateListInventoryInput(input);
    return {
      inventory: await firstbaseGetArray("/api/v1/inventory", context, readInventoryQuery(input)),
    };
  },
  async get_inventory(input, context) {
    const inventoryId = requiredActionString(input.inventoryId, "inventoryId");
    return {
      inventory: await firstbaseGetJson(`/api/v1/inventory/${encodePathSegment(inventoryId)}`, context),
    };
  },
  async list_catalog_skus(input, context) {
    return {
      skus: await firstbaseGetArray("/api/v1/catalog/skus", context, readCatalogQuery(input)),
    };
  },
  async get_catalog_sku(input, context) {
    const skuId = requiredActionString(input.skuId, "skuId");
    return {
      sku: await firstbaseGetJson(`/api/v1/catalog/skus/${encodePathSegment(skuId)}`, context),
    };
  },
  async list_brands(input, context) {
    return normalizePage(await firstbaseGetJson("/api/v1/brands", context, readMetadataQuery(input)), "brands");
  },
  async list_categories(input, context) {
    return normalizePage(await firstbaseGetJson("/api/v1/categories", context, readMetadataQuery(input)), "categories");
  },
};

export async function validateFirstbaseCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  await firstbaseRequestJson("GET", firstbaseValidationPath, { apiKey, fetcher, signal }, "validate");

  return {
    profile: {
      accountId: "firstbase:api-key",
      displayName: "Firstbase API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: firstbaseApiBaseUrl,
      validationEndpoint: firstbaseValidationPath,
      validationMode: "inventory_list_probe",
    },
  };
}

async function firstbaseGetArray(
  path: string,
  context: ApiKeyProviderContext,
  query?: Record<string, FirstbaseQueryValue>,
): Promise<unknown[]> {
  const payload = await firstbaseGetJson(path, context, query);
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Firstbase response must be an array", payload);
  }
  return payload;
}

async function firstbaseGetJson(
  path: string,
  context: ApiKeyProviderContext,
  query?: Record<string, FirstbaseQueryValue>,
): Promise<unknown> {
  return firstbaseRequestJson("GET", firstbasePath(path, query), context, "execute");
}

async function firstbaseRequestJson(
  method: "GET",
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  mode: FirstbaseRequestMode,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(firstbaseUrl(path), {
      method,
      headers: {
        accept: "application/json",
        authorization: `ApiKey ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readFirstbasePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Firstbase request failed: ${error.message}` : "Firstbase request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createFirstbaseError(response, payload, mode);
  }

  return payload;
}

function readInventoryQuery(input: Record<string, unknown>): Record<string, FirstbaseQueryValue> {
  return compactFirstbaseQuery({
    page: optionalIntegerString(input.page),
    size: optionalIntegerString(input.size),
    personId: optionalString(input.personId),
    warehouseId: optionalString(input.warehouseId),
    officeId: optionalString(input.officeId),
    categories: optionalStringArray(input.categories),
    deployStatuses: optionalStringArray(input.deployStatuses),
    skuIds: optionalStringArray(input.skuIds),
    searchString: optionalString(input.searchString),
    updatedAtFrom: optionalString(input.updatedAtFrom),
    updatedAtTo: optionalString(input.updatedAtTo),
    assignedEmail: optionalString(input.assignedEmail),
    serialNumber: optionalStringArray(input.serialNumber),
    vendorSku: optionalStringArray(input.vendorSku),
    sortBy: optionalString(input.sortBy),
    sortDirection: optionalString(input.sortDirection),
  });
}

function readCatalogQuery(input: Record<string, unknown>): Record<string, FirstbaseQueryValue> {
  return compactFirstbaseQuery({
    page: optionalIntegerString(input.page),
    size: optionalIntegerString(input.size),
    categories: optionalStringArray(input.categories),
  });
}

function readMetadataQuery(input: Record<string, unknown>): Record<string, FirstbaseQueryValue> {
  return compactFirstbaseQuery({
    page: optionalIntegerString(input.page),
    size: optionalIntegerString(input.size),
    code: optionalString(input.code),
    name: optionalString(input.name),
    active: optionalBooleanString(input.active),
  });
}

function compactFirstbaseQuery(
  input: Record<string, FirstbaseQueryValue | undefined>,
): Record<string, FirstbaseQueryValue> {
  const query: Record<string, FirstbaseQueryValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      query[key] = value;
    }
  }
  return query;
}

function normalizePage(payload: unknown, key: "brands" | "categories"): Record<string, unknown> {
  const page = requiredObject(payload, "Firstbase page response");
  const data = page.data;
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, "Firstbase page data must be an array", page);
  }
  return {
    [key]: data,
    pageNumber: requiredNumber(page.pageNumber, "pageNumber"),
    size: requiredNumber(page.size, "size"),
    totalElements: requiredNumber(page.totalElements, "totalElements"),
    totalPages: requiredNumber(page.totalPages, "totalPages"),
  };
}

function firstbasePath(path: string, query?: Record<string, FirstbaseQueryValue>): string {
  if (!query) {
    return path;
  }
  const url = new URL(path, firstbaseApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

function firstbaseUrl(path: string): URL {
  return new URL(path, firstbaseApiBaseUrl);
}

async function readFirstbasePayload(response: Response): Promise<unknown> {
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

function createFirstbaseError(response: Response, payload: unknown, mode: FirstbaseRequestMode): ProviderRequestError {
  const message = readFirstbaseErrorMessage(payload) ?? `Firstbase API returned ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 500) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(400, message, payload);
}

function readFirstbaseErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = optionalString(record.message) ?? optionalString(record.detail);
  if (message) {
    return message;
  }
  if (Array.isArray(record.errors)) {
    const details = record.errors
      .map((item) => optionalRecord(item))
      .map((item) => optionalString(item?.detail))
      .filter((item) => item !== undefined);
    if (details.length > 0) {
      return details.join("; ");
    }
  }
  return undefined;
}

function validateListInventoryInput(input: Record<string, unknown>): void {
  if (input.personId !== undefined && input.assignedEmail !== undefined) {
    throw new ProviderRequestError(400, "personId and assignedEmail cannot be combined");
  }
}

function requiredObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${label} must be an object`, value);
  }
  return object;
}

function requiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number") {
    throw new ProviderRequestError(502, `Firstbase page ${fieldName} must be a number`);
  }
  return value;
}

function requiredActionString(value: unknown, fieldName: string): string {
  const result = optionalString(value);
  if (!result) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return result;
}

function optionalIntegerString(value: unknown): string | undefined {
  const parsed = optionalInteger(value);
  return parsed === undefined ? undefined : String(parsed);
}

function optionalBooleanString(value: unknown): string | undefined {
  const parsed = optionalBoolean(value);
  return parsed === undefined ? undefined : String(parsed);
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => optionalString(item)).filter((item) => item !== undefined);
}
