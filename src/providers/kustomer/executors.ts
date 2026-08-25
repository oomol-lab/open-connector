import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "kustomer";
const kustomerApiBaseUrl = "https://api.kustomerapp.com/v1";
const kustomerDefaultRequestTimeoutMs = 30_000;

type KustomerActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type KustomerActionHandler = (input: Record<string, unknown>, context: KustomerActionContext) => Promise<unknown>;
type KustomerQueryValue = string | number | boolean | null | undefined;

interface KustomerRequestInput {
  apiKey: string;
  path: string;
  method: "GET" | "POST" | "PUT";
  fetcher: typeof fetch;
  signal?: AbortSignal;
  query?: URLSearchParams;
  body?: unknown;
}

export const kustomerActionHandlers: ProviderActionHandlers<"kustomer", KustomerActionHandler> = {
  async list_customers(input, context): Promise<unknown> {
    const payload = await requestKustomerJson({
      ...context,
      path: "/customers",
      method: "GET",
      query: buildListCustomersQuery(input),
    });
    return normalizeKustomerListEnvelope(payload, "Kustomer customers response");
  },
  async get_customer(input, context): Promise<unknown> {
    const payload = await requestKustomerJson({
      ...context,
      path: `/customers/${encodePath(requiredString(input.id, "id", providerInputError))}`,
      method: "GET",
      query: buildLookupQuery(input),
    });
    return normalizeKustomerSingleEnvelope(payload, "Kustomer customer response");
  },
  async get_customer_by_email(input, context): Promise<unknown> {
    const payload = await requestKustomerJson({
      ...context,
      path: `/customers/email=${encodePath(requiredString(input.email, "email", providerInputError))}`,
      method: "GET",
      query: buildLookupQuery(input),
    });
    return normalizeKustomerSingleEnvelope(payload, "Kustomer customer by email response");
  },
  async get_customer_by_external_id(input, context): Promise<unknown> {
    const payload = await requestKustomerJson({
      ...context,
      path: `/customers/externalId=${encodePath(requiredString(input.externalId, "externalId", providerInputError))}`,
      method: "GET",
      query: buildLookupQuery(input),
    });
    return normalizeKustomerSingleEnvelope(payload, "Kustomer customer by external ID response");
  },
  async get_customer_by_phone(input, context): Promise<unknown> {
    const payload = await requestKustomerJson({
      ...context,
      path: `/customers/phone=${encodePath(requiredString(input.phone, "phone", providerInputError))}`,
      method: "GET",
      query: buildLookupQuery(input),
    });
    return normalizeKustomerSingleEnvelope(payload, "Kustomer customer by phone response");
  },
  async search_customers(input, context): Promise<unknown> {
    const payload = await requestKustomerJson({
      ...context,
      path: "/customers/search",
      method: "POST",
      query: buildQueryParams(input, ["page", "pageSize", "idsOnly", "id", "withIntelliAggs", "trackTotalHits"]),
      body: requiredRecord(input.query, "query", providerInputError),
    });
    return normalizeKustomerSearchEnvelope(payload, "Kustomer customer search response", input.idsOnly === true);
  },
  async create_customer(input, context): Promise<unknown> {
    const payload = await requestKustomerJson({
      ...context,
      path: "/customers",
      method: "POST",
      body: requiredRecord(input.customer, "customer", providerInputError),
    });
    return normalizeKustomerSingleEnvelope(payload, "Kustomer create customer response");
  },
  async update_customer(input, context): Promise<unknown> {
    const payload = await requestKustomerJson({
      ...context,
      path: `/customers/${encodePath(requiredString(input.id, "id", providerInputError))}`,
      method: "PUT",
      query: buildQueryParams(input, ["replace"]),
      body: requiredRecord(input.customer, "customer", providerInputError),
    });
    return normalizeKustomerSingleEnvelope(payload, "Kustomer update customer response");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, kustomerActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    requiredString(input.apiKey, "apiKey", providerInputError);
    return {
      profile: {
        accountId: "api_key",
        displayName: "Kustomer API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: kustomerApiBaseUrl,
        validationMode: "format_only",
      },
    };
  },
};

async function requestKustomerJson(input: KustomerRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, kustomerDefaultRequestTimeoutMs);
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${input.apiKey}`,
    "user-agent": providerUserAgent,
  };
  const init: RequestInit = {
    method: input.method,
    headers,
    signal: timeout.signal,
  };

  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(input.body);
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(buildKustomerUrl(input), init);
    payload = await readKustomerPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Kustomer request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Kustomer request failed: ${error.message}` : "Kustomer request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createKustomerError(response.status, payload);
  }

  return payload;
}

function buildKustomerUrl(input: { path: string; query?: URLSearchParams }): URL {
  const relativePath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(relativePath, `${kustomerApiBaseUrl}/`);
  if (input.query && input.query.size > 0) {
    url.search = input.query.toString();
  }
  return url;
}

function buildLookupQuery(input: Record<string, unknown>): URLSearchParams | undefined {
  return buildQueryParams(input, ["include"]);
}

function buildListCustomersQuery(input: Record<string, unknown>): URLSearchParams | undefined {
  const query = buildQueryParams(input, ["sort", "page", "pageSize"]) ?? new URLSearchParams();
  const filter = optionalRecord(input.filter);
  if (filter) {
    appendDateRangeFilter(query, filter, "createdAt");
    appendDateRangeFilter(query, filter, "updatedAt");
  }
  return query.size > 0 ? query : undefined;
}

function appendDateRangeFilter(query: URLSearchParams, filter: Record<string, unknown>, field: string): void {
  const range = optionalRecord(filter[field]);
  if (!range) {
    return;
  }

  for (const operator of ["gt", "gte", "lt", "lte"]) {
    const value = optionalString(range[operator]);
    if (value) {
      query.set(`filter[${field}][${operator}]`, value);
    }
  }
}

function buildQueryParams(
  input: Record<string, unknown>,
  allowedFields: readonly string[],
): URLSearchParams | undefined {
  const query = new URLSearchParams();

  for (const field of allowedFields) {
    const value = input[field] as KustomerQueryValue;
    if (value === undefined || value === null || value === "") {
      continue;
    }
    query.set(field, String(value));
  }

  return query.size > 0 ? query : undefined;
}

async function readKustomerPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }
    throw new ProviderRequestError(502, "invalid Kustomer JSON response");
  }
}

function normalizeKustomerListEnvelope(payload: unknown, label: string): Record<string, unknown> {
  const body = requireProviderObject(payload, label);
  if (!Array.isArray(body.data)) {
    throw new ProviderRequestError(502, `${label} data is invalid`, payload);
  }

  return withOptionalEnvelopeFields(
    {
      data: body.data.map((item) => requireProviderObject(item, `${label} item`)),
    },
    body,
    label,
  );
}

function normalizeKustomerSearchEnvelope(payload: unknown, label: string, idsOnly: boolean): Record<string, unknown> {
  const body = requireProviderObject(payload, label);
  if (!Array.isArray(body.data)) {
    throw new ProviderRequestError(502, `${label} data is invalid`, payload);
  }

  return withOptionalEnvelopeFields(
    {
      data: body.data.map((item) => {
        if (idsOnly && typeof item === "string" && item.trim()) {
          return item;
        }
        return requireProviderObject(item, `${label} item`);
      }),
    },
    body,
    label,
  );
}

function normalizeKustomerSingleEnvelope(payload: unknown, label: string): Record<string, unknown> {
  const body = requireProviderObject(payload, label);
  if (!isCustomerData(body.data)) {
    throw new ProviderRequestError(502, `${label} data is invalid`, payload);
  }

  return withOptionalEnvelopeFields({ data: body.data }, body, label);
}

function withOptionalEnvelopeFields(
  output: { data: Record<string, unknown> | Array<Record<string, unknown> | string> },
  body: Record<string, unknown>,
  label: string,
): Record<string, unknown> {
  const envelope: Record<string, unknown> = { data: output.data };
  const meta = optionalRecord(body.meta);
  const links = optionalRecord(body.links);
  const included = normalizeOptionalIncluded(body.included, label);
  if (meta) {
    envelope.meta = meta;
  }
  if (links) {
    envelope.links = links;
  }
  if (included) {
    envelope.included = included;
  }
  return envelope;
}

function normalizeOptionalIncluded(value: unknown, label: string): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} included is invalid`, value);
  }
  return value.map((item) => requireProviderObject(item, `${label} included item`));
}

function isCustomerData(value: unknown): value is Record<string, unknown> | Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.every((item) => Boolean(optionalRecord(item)));
  }
  return Boolean(optionalRecord(value));
}

function createKustomerError(status: number, payload: unknown): ProviderRequestError {
  const message = extractKustomerErrorMessage(payload) ?? `Kustomer request failed with status ${status}`;

  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractKustomerErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage = optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
  if (directMessage) {
    return directMessage;
  }

  if (Array.isArray(record.errors)) {
    for (const item of record.errors) {
      const error = optionalRecord(item);
      const message = optionalString(error?.message) ?? optionalString(error?.detail) ?? optionalString(error?.title);
      if (message) {
        return message;
      }
    }
  }

  return undefined;
}

function requireProviderObject(payload: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, `${label} is invalid`, payload);
  }
  return object;
}

function encodePath(value: string): string {
  return encodeURIComponent(value);
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
