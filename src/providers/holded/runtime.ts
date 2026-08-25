import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const holdedApiBaseUrl = "https://api.holded.com/api/v2";
const holdedDefaultRequestTimeoutMs = 30_000;

type HoldedPhase = "validate" | "execute";
type HoldedActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface HoldedRequestInput {
  method: "GET" | "POST";
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  query: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  phase: HoldedPhase;
}

export const holdedActionHandlers: ProviderActionHandlers<"holded", HoldedActionHandler> = {
  async list_contacts(input, context) {
    const payload = await requestHoldedJson({
      method: "GET",
      path: "/contacts",
      context,
      query: compactObject({
        phone: optionalString(input.phone),
        mobile: optionalString(input.mobile),
        email: optionalString(input.email),
        code: optionalString(input.code),
        custom_id: optionalString(input.customId),
        cursor: optionalString(input.cursor),
        limit: readOptionalIntegerString(input.limit),
      }),
      phase: "execute",
    });

    return {
      contacts: extractList(payload).map(normalizeContact),
      pagination: normalizePagination(payload),
      raw: payload,
    };
  },
  async get_contact(input, context) {
    const contactId = readRequiredString(input.contactId, "contactId");
    const payload = await requestHoldedJson({
      method: "GET",
      path: `/contacts/${encodeURIComponent(contactId)}`,
      context,
      query: {},
      phase: "execute",
    });

    return {
      contact: normalizeContact(extractObject(payload)),
      raw: payload,
    };
  },
  async create_contact(input, context) {
    const payload = await requestHoldedJson({
      method: "POST",
      path: "/contacts",
      context,
      query: {},
      body: compactObject({
        name: readRequiredString(input.name, "name"),
        email: optionalString(input.email),
        phone: optionalString(input.phone),
        mobile: optionalString(input.mobile),
        code: optionalString(input.code),
        custom_id: optionalString(input.customId),
        type: optionalString(input.type),
      }),
      phase: "execute",
    });

    return {
      contact: normalizeContact(extractObject(payload)),
      raw: payload,
    };
  },
  async list_products(input, context) {
    const payload = await requestHoldedJson({
      method: "GET",
      path: "/products",
      context,
      query: compactObject({
        cursor: optionalString(input.cursor),
        limit: readOptionalIntegerString(input.limit),
      }),
      phase: "execute",
    });

    return {
      products: extractList(payload).map(normalizeProduct),
      pagination: normalizePagination(payload),
      raw: payload,
    };
  },
  async get_product(input, context) {
    const productId = readRequiredString(input.productId, "productId");
    const payload = await requestHoldedJson({
      method: "GET",
      path: `/products/${encodeURIComponent(productId)}`,
      context,
      query: {},
      phase: "execute",
    });

    return {
      product: normalizeProduct(extractObject(payload)),
      raw: payload,
    };
  },
};

export async function validateHoldedCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await requestHoldedJson({
    method: "GET",
    path: "/contacts",
    context: {
      apiKey: input.apiKey,
      fetcher: options.fetcher,
      signal: options.signal,
    },
    query: { limit: "1" },
    phase: "validate",
  });

  return {
    profile: {
      accountId: "api_token",
      displayName: "Holded API Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: holdedApiBaseUrl,
      validationEndpoint: "/contacts",
      contactCountInFirstPage: extractList(payload).length,
    },
  };
}

async function requestHoldedJson(input: HoldedRequestInput): Promise<unknown> {
  const timeoutHandle = createProviderTimeout(input.context.signal, holdedDefaultRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(buildHoldedUrl(input.path, input.query), {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeoutHandle.signal,
    });
    const payload = await readHoldedPayload(response);

    if (!response.ok) {
      throw createHoldedError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Holded request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Holded request failed: ${error.message}` : "Holded request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function buildHoldedUrl(path: string, query: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${holdedApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readHoldedPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Holded returned invalid JSON");
  }
}

function createHoldedError(status: number, payload: unknown, phase: HoldedPhase): ProviderRequestError {
  const message = extractHoldedErrorMessage(payload) ?? `Holded request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function extractHoldedErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  for (const key of ["message", "error", "detail"]) {
    const message = optionalString(record[key]);
    if (message) {
      return message;
    }
  }
  return undefined;
}

function extractList(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map(requireObjectPayload);
  }
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Holded returned an invalid list payload", payload);
  }
  for (const key of ["data", "items", "results", "contacts", "products"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.map(requireObjectPayload);
    }
  }
  throw new ProviderRequestError(502, "Holded response did not include a list", payload);
}

function extractObject(payload: unknown): Record<string, unknown> {
  const direct = optionalRecord(payload);
  if (!direct) {
    throw new ProviderRequestError(502, "Holded returned an invalid object payload", payload);
  }
  for (const key of ["data", "contact", "product"]) {
    const nested = optionalRecord(direct[key]);
    if (nested) {
      return nested;
    }
  }
  return direct;
}

function requireObjectPayload(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "Holded returned a non-object item", value);
  }
  return record;
}

function normalizeContact(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readObjectId(record),
    name: readNullableString(record, "name"),
    email: readNullableString(record, "email"),
    phone: readNullableString(record, "phone"),
    mobile: readNullableString(record, "mobile"),
    code: readNullableString(record, "code"),
    customId: readNullableString(record, "custom_id", "customId"),
    type: readNullableString(record, "type"),
    raw: record,
  };
}

function normalizeProduct(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readObjectId(record),
    name: readNullableString(record, "name"),
    sku: readNullableString(record, "sku", "SKU"),
    description: readNullableString(record, "description"),
    price: readNullableNumber(record, "price"),
    raw: record,
  };
}

function normalizePagination(payload: unknown): Record<string, unknown> | null {
  const record = optionalRecord(payload);
  if (!record) {
    return null;
  }
  const nested =
    optionalRecord(record.pagination) ?? optionalRecord(record.page) ?? optionalRecord(record.meta) ?? record;
  const nextCursor = readNullableString(nested, "next_cursor", "nextCursor", "cursor_next");
  const hasMoreValue = nested.has_more ?? nested.hasMore;
  const hasMore = typeof hasMoreValue === "boolean" ? hasMoreValue : null;
  if (nextCursor === null && hasMore === null && nested === record) {
    return null;
  }
  return {
    nextCursor,
    hasMore,
    raw: nested,
  };
}

function readObjectId(record: Record<string, unknown>): string {
  const id = readNullableString(record, "id", "_id", "uuid");
  if (id) {
    return id;
  }
  throw new ProviderRequestError(502, "Holded response missing object identifier", record);
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalIntegerString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value)) {
    throw new ProviderRequestError(400, "integer input is required");
  }
  return String(value);
}

function readNullableString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = optionalString(record[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return null;
}

function readNullableNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = optionalNumber(record[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return null;
}
