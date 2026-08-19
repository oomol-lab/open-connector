import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

type JsonObject = Record<string, unknown>;
type BooqableRequestMethod = "GET" | "POST";
type BooqablePhase = "validate" | "execute";

export interface BooqableContext extends Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal"> {
  companySlug: string;
}

interface BooqableRequestInput {
  context: Pick<BooqableContext, "apiKey" | "companySlug" | "fetcher" | "signal">;
  method: BooqableRequestMethod;
  path: string;
  phase?: BooqablePhase;
  query?: Record<string, unknown>;
  body?: JsonObject;
  notFoundAsInvalidInput?: boolean;
}

const booqableRequestTimeoutMs = 30_000;

export const booqableActionHandlers: ProviderActionHandlers<"booqable", ProviderRuntimeHandler<BooqableContext>> = {
  async get_current_company(input, context) {
    return normalizeSingleResponse(
      await requestBooqableJson({
        context,
        method: "GET",
        path: "/companies/current",
        query: buildCompanyQuery(input),
      }),
      "company",
      "company",
    );
  },
  async list_customers(input, context) {
    return normalizeCollectionResponse(
      await requestBooqableJson({ context, method: "GET", path: "/customers", query: buildListQuery(input) }),
      "customers",
      "customers",
    );
  },
  async search_customers(input, context) {
    return normalizeCollectionResponse(
      await requestBooqableJson({ context, method: "POST", path: "/customers/search", body: readSearchBody(input) }),
      "customers",
      "customers",
    );
  },
  async get_customer(input, context) {
    return normalizeSingleResponse(
      await requestBooqableJson({
        context,
        method: "GET",
        path: `/customers/${encodeURIComponent(readRequiredString(input.customerId, "customerId"))}`,
        query: buildSingleQuery(input),
        notFoundAsInvalidInput: true,
      }),
      "customer",
      "customer",
    );
  },
  async list_orders(input, context) {
    return normalizeCollectionResponse(
      await requestBooqableJson({ context, method: "GET", path: "/orders", query: buildListQuery(input) }),
      "orders",
      "orders",
    );
  },
  async search_orders(input, context) {
    return normalizeCollectionResponse(
      await requestBooqableJson({ context, method: "POST", path: "/orders/search", body: readSearchBody(input) }),
      "orders",
      "orders",
    );
  },
  async get_order(input, context) {
    return normalizeSingleResponse(
      await requestBooqableJson({
        context,
        method: "GET",
        path: `/orders/${encodeURIComponent(readRequiredString(input.orderId, "orderId"))}`,
        query: buildSingleQuery(input),
        notFoundAsInvalidInput: true,
      }),
      "order",
      "order",
    );
  },
  async list_product_groups(input, context) {
    return normalizeCollectionResponse(
      await requestBooqableJson({ context, method: "GET", path: "/product_groups", query: buildListQuery(input) }),
      "productGroups",
      "product groups",
    );
  },
  async search_product_groups(input, context) {
    return normalizeCollectionResponse(
      await requestBooqableJson({
        context,
        method: "POST",
        path: "/product_groups/search",
        body: readSearchBody(input),
      }),
      "productGroups",
      "product groups",
    );
  },
  async get_product_group(input, context) {
    return normalizeSingleResponse(
      await requestBooqableJson({
        context,
        method: "GET",
        path: `/product_groups/${encodeURIComponent(readRequiredString(input.productGroupId, "productGroupId"))}`,
        query: buildSingleQuery(input),
        notFoundAsInvalidInput: true,
      }),
      "productGroup",
      "product group",
    );
  },
};

export async function validateBooqableCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = readRequiredString(input.apiKey, "apiKey");
  const companySlug = normalizeBooqableCompanySlug(input.values.companySlug);
  const raw = await requestBooqableJson({
    context: { apiKey, companySlug, fetcher, signal },
    method: "GET",
    path: "/companies/current",
    phase: "validate",
  });
  const company = readObject(raw.data, "company resource");
  const attributes = optionalRecord(company.attributes) ?? {};
  const companyId = optionalString(company.id);
  const companyName = optionalString(attributes.name);
  const responseCompanySlug = optionalString(attributes.slug);
  const storedCompanySlug = normalizeBooqableCompanySlug(responseCompanySlug ?? companySlug);

  return {
    profile: {
      accountId: `booqable:${companyId ?? storedCompanySlug}`,
      displayName: companyName ?? `Booqable ${storedCompanySlug}`,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: buildBooqableApiBaseUrl(storedCompanySlug),
      validationEndpoint: "/api/4/companies/current",
      companySlug: storedCompanySlug,
      ...(companyId ? { companyId } : {}),
      ...(companyName ? { companyName } : {}),
    },
  };
}

export function buildBooqableApiBaseUrl(companySlug: string): string {
  return `https://${normalizeBooqableCompanySlug(companySlug)}.booqable.com/api/4`;
}

export function normalizeBooqableCompanySlug(value: unknown): string {
  const rawValue = optionalString(value)?.toLowerCase();
  if (!rawValue) {
    throw new ProviderRequestError(400, "companySlug is required");
  }
  if (
    rawValue.startsWith("http://") ||
    rawValue.startsWith("https://") ||
    rawValue.includes("/") ||
    rawValue.includes(".") ||
    rawValue.startsWith("-") ||
    rawValue.endsWith("-")
  ) {
    throw new ProviderRequestError(400, "companySlug must be a Booqable company slug");
  }
  for (const char of rawValue) {
    const code = char.charCodeAt(0);
    const isLowercaseLetter = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    if (!isLowercaseLetter && !isDigit && char !== "-") {
      throw new ProviderRequestError(400, "companySlug must be a Booqable company slug");
    }
  }
  return rawValue;
}

function buildCompanyQuery(input: Record<string, unknown>): Record<string, unknown> {
  return {
    fields: optionalRecord(input.fields),
    extra_fields: optionalRecord(input.extraFields),
  };
}

function buildListQuery(input: Record<string, unknown>): Record<string, unknown> {
  return {
    fields: optionalRecord(input.fields),
    filter: optionalRecord(input.filter),
    include: optionalString(input.include),
    meta: optionalRecord(input.meta),
    page: {
      number: input.pageNumber,
      size: input.pageSize,
    },
    sort: optionalString(input.sort),
  };
}

function buildSingleQuery(input: Record<string, unknown>): Record<string, unknown> {
  return {
    fields: optionalRecord(input.fields),
    include: optionalString(input.include),
  };
}

function readSearchBody(input: Record<string, unknown>): JsonObject {
  const search = optionalRecord(input.search);
  if (!search) {
    throw new ProviderRequestError(400, "search is required");
  }
  return search;
}

async function requestBooqableJson(input: BooqableRequestInput): Promise<JsonObject> {
  const timeout = createProviderTimeout(input.context.signal, booqableRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(buildBooqableUrl(input.context.companySlug, input.path, input.query), {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readJsonObject(response, { tolerant: !response.ok });
    if (!response.ok) {
      throw mapBooqableError(response, payload, input.phase ?? "execute", {
        notFoundAsInvalidInput: input.notFoundAsInvalidInput,
      });
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Booqable API request timed out");
    }
    throw error;
  } finally {
    timeout.cleanup();
  }
}

function buildBooqableUrl(companySlug: string, path: string, query: Record<string, unknown> | undefined): string {
  const url = new URL(trimLeadingSlash(path), `${buildBooqableApiBaseUrl(companySlug)}/`);
  appendQueryObject(url.searchParams, [], query);
  return url.toString();
}

function trimLeadingSlash(value: string): string {
  let index = 0;
  while (value[index] === "/") {
    index += 1;
  }
  return value.slice(index);
}

function appendQueryObject(searchParams: URLSearchParams, path: string[], value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      appendQueryObject(searchParams, [...path, ""], item);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      appendQueryObject(searchParams, [...path, key], child);
    }
    return;
  }
  if (path.length > 0) {
    searchParams.append(formatQueryKey(path), String(value));
  }
}

function formatQueryKey(path: string[]): string {
  const [first, ...rest] = path;
  return `${first}${rest.map((part) => `[${part}]`).join("")}`;
}

async function readJsonObject(
  response: Response,
  options: { tolerant: boolean } = { tolerant: false },
): Promise<JsonObject> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return readObject(JSON.parse(text) as unknown, "response");
  } catch (error) {
    if (options.tolerant) {
      return {};
    }
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "Booqable returned invalid JSON");
  }
}

function mapBooqableError(
  response: Response,
  payload: JsonObject,
  phase: BooqablePhase,
  options: { notFoundAsInvalidInput?: boolean } = {},
): ProviderRequestError {
  const message = readBooqableErrorMessage(payload) ?? `Booqable API request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (
    response.status === 400 ||
    response.status === 422 ||
    (response.status === 404 && options.notFoundAsInvalidInput)
  ) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function readBooqableErrorMessage(payload: JsonObject): string | undefined {
  const direct =
    optionalString(payload.message) ?? optionalString(payload.error) ?? optionalString(payload.error_description);
  if (direct) {
    return direct;
  }
  const errors = payload.errors;
  if (!Array.isArray(errors)) {
    return undefined;
  }
  for (const error of errors) {
    if (typeof error === "string") {
      return error;
    }
    const errorObject = optionalRecord(error);
    const message =
      optionalString(errorObject?.detail) ?? optionalString(errorObject?.title) ?? optionalString(errorObject?.code);
    if (message) {
      return message;
    }
  }
  return undefined;
}

function normalizeCollectionResponse(payload: JsonObject, outputKey: string, label: string): Record<string, unknown> {
  const data = payload.data;
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, `Booqable returned invalid ${label} data`);
  }
  return {
    [outputKey]: data.map((item) => readObject(item, `${label} resource`)),
    included: readObjectArray(payload.included, "included"),
    links: readOptionalObject(payload.links),
    meta: readOptionalObject(payload.meta),
  };
}

function normalizeSingleResponse(payload: JsonObject, outputKey: string, label: string): Record<string, unknown> {
  return {
    [outputKey]: readObject(payload.data, `${label} resource`),
    included: readObjectArray(payload.included, "included"),
    meta: readOptionalObject(payload.meta),
  };
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readObject(value: unknown, label: string): JsonObject {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Booqable returned invalid ${label}`);
  }
  return record;
}

function readOptionalObject(value: unknown): JsonObject {
  return optionalRecord(value) ?? {};
}

function readObjectArray(value: unknown, label: string): JsonObject[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Booqable returned invalid ${label}`);
  }
  return value.map((item) => readObject(item, `${label} resource`));
}
