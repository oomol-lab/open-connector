import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  optionalBoolean,
  optionalIntegerLike,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  stringArray,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const metronomeApiBaseUrl = "https://api.metronome.com";

type MetronomeRequestPhase = "validate" | "execute";
type MetronomeActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface PaginatedPayload {
  data: unknown[];
  nextPage: string | null;
}

export const metronomeActionHandlers: ProviderActionHandlers<"metronome", MetronomeActionHandler> = {
  list_customers(input, context) {
    return listMetronomeCustomers(input, context);
  },
  get_customer(input, context) {
    return getMetronomeCustomer(input, context);
  },
  list_billable_metrics(input, context) {
    return listMetronomeBillableMetrics(input, context);
  },
  list_invoices(input, context) {
    return listMetronomeInvoices(input, context);
  },
  get_invoice(input, context) {
    return getMetronomeInvoice(input, context);
  },
};

export async function validateMetronomeCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requireMetronomeApiKey(input.apiKey);
  await metronomeGetJson("/v1/customers", apiKey, fetcher, "validate", { limit: 1 }, signal);

  return {
    profile: {
      accountId: "metronome:api-key",
      displayName: "Metronome API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: metronomeApiBaseUrl,
      validationEndpoint: "/v1/customers",
    },
  };
}

async function listMetronomeCustomers(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await metronomeGetJson(
    "/v1/customers",
    context.apiKey,
    context.fetcher,
    "execute",
    {
      limit: readOptionalPositiveInteger(input.limit, "limit"),
      next_page: optionalRawString(input.nextPage),
      ingest_alias: optionalRawString(input.ingestAlias),
      customer_ids: readOptionalStringArray(input.customerIds, "customerIds"),
      only_archived: optionalBoolean(input.onlyArchived),
      salesforce_account_ids: readOptionalStringArray(input.salesforceAccountIds, "salesforceAccountIds"),
    },
    context.signal,
  );
  const page = normalizePaginatedPayload(payload);

  return {
    customers: page.data.map(normalizeCustomer),
    nextPage: page.nextPage,
  };
}

async function getMetronomeCustomer(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const customerId = readRequiredString(input.customerId, "customerId");
  const payload = await metronomeGetJson(
    `/v1/customers/${encodeURIComponent(customerId)}`,
    context.apiKey,
    context.fetcher,
    "execute",
    undefined,
    context.signal,
  );

  return { customer: normalizeCustomer(readDataObject(payload, "customer")) };
}

async function listMetronomeBillableMetrics(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await metronomeGetJson(
    "/v1/billable-metrics",
    context.apiKey,
    context.fetcher,
    "execute",
    {
      limit: readOptionalPositiveInteger(input.limit, "limit"),
      next_page: optionalRawString(input.nextPage),
      include_archived: optionalBoolean(input.includeArchived),
    },
    context.signal,
  );
  const page = normalizePaginatedPayload(payload);

  return {
    billableMetrics: page.data.map(normalizeBillableMetric),
    nextPage: page.nextPage,
  };
}

async function listMetronomeInvoices(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const customerId = readRequiredString(input.customerId, "customerId");
  const payload = await metronomeGetJson(
    `/v1/customers/${encodeURIComponent(customerId)}/invoices`,
    context.apiKey,
    context.fetcher,
    "execute",
    {
      limit: readOptionalPositiveInteger(input.limit, "limit"),
      next_page: optionalRawString(input.nextPage),
      status: optionalRawString(input.status),
      type: optionalRawString(input.type),
      sort: optionalRawString(input.sort),
      skip_zero_qty_line_items: optionalBoolean(input.skipZeroQtyLineItems),
      credit_type_id: optionalRawString(input.creditTypeId),
      contract_id: optionalRawString(input.contractId),
      starting_on: optionalRawString(input.startingOn),
      ending_before: optionalRawString(input.endingBefore),
    },
    context.signal,
  );
  const page = normalizePaginatedPayload(payload);

  return {
    invoices: page.data.map(normalizeInvoice),
    nextPage: page.nextPage,
  };
}

async function getMetronomeInvoice(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const customerId = readRequiredString(input.customerId, "customerId");
  const invoiceId = readRequiredString(input.invoiceId, "invoiceId");
  const payload = await metronomeGetJson(
    `/v1/customers/${encodeURIComponent(customerId)}/invoices/${encodeURIComponent(invoiceId)}`,
    context.apiKey,
    context.fetcher,
    "execute",
    {
      skip_zero_qty_line_items: optionalBoolean(input.skipZeroQtyLineItems),
    },
    context.signal,
  );

  return { invoice: normalizeInvoice(readDataObject(payload, "invoice")) };
}

async function metronomeGetJson(
  path: string,
  apiKey: string,
  fetcher: typeof fetch,
  phase: MetronomeRequestPhase,
  query?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const url = new URL(path, metronomeApiBaseUrl);
  appendQuery(url.searchParams, query);

  return metronomeRequestJson(url, apiKey, fetcher, phase, {
    method: "GET",
    signal,
  });
}

async function metronomeRequestJson(
  url: URL,
  apiKey: string,
  fetcher: typeof fetch,
  phase: MetronomeRequestPhase,
  init: RequestInit,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await fetcher(url, {
      ...init,
      headers: metronomeHeaders(apiKey, init.headers),
    });
    payload = await readMetronomePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `metronome request failed: ${error.message}` : "metronome request failed",
    );
  }

  if (!response.ok) {
    throw createMetronomeError(response, payload, phase);
  }

  return payload;
}

function metronomeHeaders(apiKey: string, extraHeaders?: HeadersInit): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
    authorization: `Bearer ${apiKey}`,
    ...Object.fromEntries(new Headers(extraHeaders).entries()),
  };
}

function appendQuery(searchParams: URLSearchParams, query?: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value == null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        searchParams.append(key, String(item));
      }
      continue;
    }
    searchParams.set(key, String(value));
  }
}

async function readMetronomePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createMetronomeError(
  response: Response,
  payload: unknown,
  phase: MetronomeRequestPhase,
): ProviderRequestError {
  const message = extractMetronomeErrorMessage(payload) ?? response.statusText ?? "metronome request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(409, message, payload);
  }

  if ([400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractMetronomeErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["message", "error", "detail"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  const nestedError = optionalRecord(record.error);
  const nestedMessage = optionalRawString(nestedError?.message);
  return nestedMessage?.trim() || undefined;
}

function normalizePaginatedPayload(payload: unknown): PaginatedPayload {
  const record = readObject(payload, "response");
  const data = record.data;
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, "metronome response did not include data array");
  }

  return {
    data,
    nextPage: readNullableString(record.next_page),
  };
}

function readDataObject(payload: unknown, fieldName: string): Record<string, unknown> {
  const record = readObject(payload, "response");
  return readObject(record.data, fieldName);
}

function normalizeCustomer(value: unknown): Record<string, unknown> {
  const record = readObject(value, "customer");
  return {
    id: readRequiredString(record.id, "customer.id"),
    externalId: readNullableString(record.external_id),
    name: readRequiredString(record.name, "customer.name"),
    ingestAliases: readStringArray(record.ingest_aliases),
    createdAt: readRequiredString(record.created_at, "customer.created_at"),
    updatedAt: readRequiredString(record.updated_at, "customer.updated_at"),
    archivedAt: readNullableString(record.archived_at),
    customerConfig: readLooseObject(record.customer_config),
    customFields: readLooseObject(record.custom_fields),
    raw: record,
  };
}

function normalizeBillableMetric(value: unknown): Record<string, unknown> {
  const record = readObject(value, "billableMetric");
  return {
    id: readRequiredString(record.id, "billableMetric.id"),
    name: readRequiredString(record.name, "billableMetric.name"),
    aggregationType: readNullableString(record.aggregation_type),
    aggregationKey: readNullableString(record.aggregation_key),
    archivedAt: readNullableString(record.archived_at),
    customFields: readLooseObject(record.custom_fields),
    raw: record,
  };
}

function normalizeInvoice(value: unknown): Record<string, unknown> {
  const record = readObject(value, "invoice");
  return {
    id: readRequiredString(record.id, "invoice.id"),
    customerId: readRequiredString(record.customer_id, "invoice.customer_id"),
    status: readNullableString(record.status),
    type: readNullableString(record.type),
    contractId: readNullableString(record.contract_id),
    startTimestamp: readNullableString(record.start_timestamp),
    endTimestamp: readNullableString(record.end_timestamp),
    issuedAt: readNullableString(record.issued_at),
    total: readNullableNumber(record.total),
    subtotal: readNullableNumber(record.subtotal),
    amountDue: readNullableNumber(record.amount_due),
    lineItems: readObjectArray(record.line_items),
    raw: record,
  };
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `metronome response did not include ${fieldName}`);
  }
  return record;
}

function readLooseObject(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? {};
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [record] : [];
  });
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item));
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  return stringArray(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readRequiredString(value: unknown, fieldName: string): string {
  const stringValue = optionalRawString(value);
  if (!stringValue) {
    throw new ProviderRequestError(502, `metronome response did not include ${fieldName}`);
  }
  return stringValue;
}

function readNullableString(value: unknown): string | null {
  return value == null ? null : String(value);
}

function readNullableNumber(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  return optionalNumber(value) ?? null;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  const integer = optionalIntegerLike(value, fieldName, (message) => new ProviderRequestError(400, message));
  if (integer === undefined) {
    return undefined;
  }
  if (integer <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return integer;
}

function requireMetronomeApiKey(value: unknown): string {
  if (typeof value !== "string" || !value) {
    throw new ProviderRequestError(400, "apiKey is required");
  }
  return value;
}
