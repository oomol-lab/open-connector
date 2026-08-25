import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const retentlyApiBaseUrl = "https://app.retently.com";

const retentlyDefaultRequestTimeoutMs = 30_000;

type RetentlyPhase = "validate" | "execute";
type RetentlyActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface RetentlyRequestOptions {
  path: string;
  method: "GET" | "POST";
  apiKey: string;
  fetcher: ProviderFetch;
  phase: RetentlyPhase;
  params?: Record<string, string | undefined>;
  attributes?: unknown;
  body?: unknown;
  signal?: AbortSignal;
}

export const retentlyActionHandlers: ProviderActionHandlers<"retently", RetentlyActionHandler> = {
  async get_account_status(_input, context) {
    const payload = await requestRetentlyJson({
      ...context,
      path: "/api/v2/ping",
      method: "GET",
      phase: "execute",
    });

    return normalizeAccountStatus(payload);
  },
  async list_customers(input, context) {
    const payload = await requestRetentlyJson({
      ...context,
      path: "/api/v2/customers",
      method: "GET",
      phase: "execute",
      params: buildListCustomersParams(input),
      attributes: input.attributes,
    });

    const data = optionalRecord(payload.data);
    return {
      customers: normalizeCustomers(payload),
      pagination: normalizePagination(payload, data),
      raw: payload,
    };
  },
  async get_customer(input, context) {
    const payload = await requestRetentlyJson({
      ...context,
      path: `/api/v2/customers/${encodeURIComponent(requiredProviderString(input.customerId, "customerId"))}`,
      method: "GET",
      phase: "execute",
    });

    return {
      customer: normalizeCustomer(payload),
      raw: payload,
    };
  },
  async list_feedback(input, context) {
    const payload = await requestRetentlyJson({
      ...context,
      path: "/api/v2/feedback",
      method: "GET",
      phase: "execute",
      params: buildListFeedbackParams(input),
      attributes: input.attributes,
    });

    const data = optionalRecord(payload.data);
    return {
      feedback: normalizeFeedbackList(payload),
      pagination: normalizePagination(payload, data),
      raw: payload,
    };
  },
  async get_feedback(input, context) {
    const payload = await requestRetentlyJson({
      ...context,
      path: `/api/v2/feedback/${encodeURIComponent(requiredProviderString(input.feedbackId, "feedbackId"))}`,
      method: "GET",
      phase: "execute",
    });

    return {
      feedback: normalizeFeedback(payload),
      raw: payload,
    };
  },
  async list_templates(_input, context) {
    const payload = await requestRetentlyJson({
      ...context,
      path: "/api/v2/templates",
      method: "GET",
      phase: "execute",
    });

    return {
      templates: normalizeRecordList(readNestedValue(payload, "templates")),
      raw: payload,
    };
  },
  async get_template(input, context) {
    const payload = await requestRetentlyJson({
      ...context,
      path: `/api/v2/templates/${encodeURIComponent(requiredProviderString(input.templateId, "templateId"))}`,
      method: "GET",
      phase: "execute",
    });

    return {
      template: optionalRecord(payload.data) ?? null,
      raw: payload,
    };
  },
  async list_campaigns(_input, context) {
    const payload = await requestRetentlyJson({
      ...context,
      path: "/api/v2/campaigns",
      method: "GET",
      phase: "execute",
    });

    return {
      campaigns: normalizeRecordList(readNestedValue(payload, "campaigns")),
      raw: payload,
    };
  },
  async upsert_customers(input, context) {
    const payload = await requestRetentlyJson({
      ...context,
      path: "/api/v2/customers",
      method: "POST",
      phase: "execute",
      body: {
        subscribers: input.subscribers,
      },
    });

    const data = optionalRecord(payload.data);
    return {
      customers: normalizeCustomers(payload),
      pagination: normalizePagination(payload, data),
      raw: payload,
    };
  },
};

export async function validateRetentlyCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestRetentlyJson({
    path: "/api/v2/ping",
    method: "GET",
    apiKey,
    fetcher,
    signal,
    phase: "validate",
  });

  const data = optionalRecord(payload.data);
  const account = optionalRecord(data?.account);
  const plan = optionalRecord(data?.plan);
  const accountName = optionalString(account?.name);
  const accountId = optionalString(account?.id);

  return {
    profile: {
      accountId: accountId ?? "api_key",
      displayName: accountName ? `Retently ${accountName}` : accountId ? `Retently ${accountId}` : "Retently API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      accountId,
      accountName,
      planCode: optionalString(plan?.code),
      validationEndpoint: "/api/v2/ping",
    }),
  };
}

function buildListCustomersParams(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    email: optionalString(input.email),
    page: readOptionalIntegerString(input.page),
    limit: readOptionalIntegerString(input.limit),
    sort: optionalString(input.sort),
    startDate: optionalString(input.startDate),
    endDate: optionalString(input.endDate),
    match: optionalString(input.match),
  });
}

function buildListFeedbackParams(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    email: optionalString(input.email),
    customerId: optionalString(input.customerId),
    campaignId: optionalString(input.campaignId),
    page: readOptionalIntegerString(input.page),
    limit: readOptionalIntegerString(input.limit),
    sort: optionalString(input.sort),
    startDate: optionalString(input.startDate),
    endDate: optionalString(input.endDate),
    match: optionalString(input.match),
  });
}

async function requestRetentlyJson(input: RetentlyRequestOptions): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.signal, retentlyDefaultRequestTimeoutMs);
  try {
    const response = await input.fetcher(buildRetentlyUrl(input.path, input.params, input.attributes), {
      method: input.method,
      headers: buildRetentlyHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readRetentlyPayload(response);

    if (!response.ok) {
      throw createRetentlyError(response.status, payload, input.phase);
    }

    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "Retently returned an invalid payload", payload);
    }
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Retently request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Retently request failed: ${error.message}` : "Retently request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildRetentlyUrl(
  path: string,
  params: Record<string, string | undefined> | undefined,
  attributes: unknown,
): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${retentlyApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  appendAttributeFilters(url, attributes);
  return url;
}

function buildRetentlyHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readRetentlyPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Retently returned invalid JSON");
  }
}

function createRetentlyError(status: number, payload: unknown, phase: RetentlyPhase): ProviderRequestError {
  const message = extractRetentlyErrorMessage(payload) ?? `Retently request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractRetentlyErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(optionalRecord(record.error)?.message)
  );
}

function normalizeAccountStatus(payload: Record<string, unknown>): Record<string, unknown> {
  const data = optionalRecord(payload.data);
  return {
    account: optionalRecord(data?.account) ?? null,
    plan: optionalRecord(data?.plan) ?? null,
    usage: optionalRecord(data?.usage) ?? null,
    cache: optionalRecord(data?.cache) ?? null,
    raw: payload,
  };
}

function normalizeCustomers(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const data = optionalRecord(payload.data);
  const nestedList = readNestedValue(payload, "subscribers");
  if (Array.isArray(nestedList)) {
    return normalizeRecordList(nestedList);
  }

  const fallbackList = readNestedValue(payload, "customers");
  if (Array.isArray(fallbackList)) {
    return normalizeRecordList(fallbackList);
  }

  return data && looksLikeRecord(data) ? [data] : [];
}

function normalizeCustomer(payload: Record<string, unknown>): Record<string, unknown> | null {
  const customers = normalizeCustomers(payload);
  if (customers.length > 0) {
    return customers[0] ?? null;
  }

  return optionalRecord(payload.data) ?? null;
}

function normalizeFeedbackList(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  return normalizeRecordList(readNestedValue(payload, "responses"));
}

function normalizeFeedback(payload: Record<string, unknown>): Record<string, unknown> | null {
  const feedback = normalizeFeedbackList(payload);
  if (feedback.length > 0) {
    return feedback[0] ?? null;
  }

  return optionalRecord(payload.data) ?? null;
}

function normalizeRecordList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined);
}

function normalizePagination(
  payload: Record<string, unknown>,
  data: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return {
    page: readOptionalInteger(data?.page) ?? readOptionalInteger(payload.page) ?? null,
    pages: readOptionalInteger(data?.pages) ?? readOptionalInteger(payload.pages) ?? null,
    limit: readOptionalInteger(data?.limit) ?? readOptionalInteger(payload.limit) ?? null,
    sort: optionalString(data?.sort) ?? optionalString(payload.sort) ?? null,
    total: readOptionalInteger(data?.total) ?? readOptionalInteger(payload.total) ?? null,
  };
}

function readNestedValue(payload: Record<string, unknown>, fieldName: string): unknown {
  const data = optionalRecord(payload.data);
  return data?.[fieldName] ?? payload[fieldName];
}

function appendAttributeFilters(url: URL, value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }

  value.forEach((entry, index) => {
    const filter = optionalRecord(entry);
    if (!filter) {
      return;
    }

    const name = optionalString(filter.name);
    const op = optionalString(filter.op);
    const filterValue = optionalString(filter.value);
    if (!name || !op || !filterValue) {
      return;
    }

    url.searchParams.set(`attributes[${index}][name]`, name);
    url.searchParams.set(`attributes[${index}][op]`, op);
    url.searchParams.set(`attributes[${index}][value]`, filterValue);
  });
}

function requiredProviderString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalIntegerString(value: unknown): string | undefined {
  const number = readOptionalInteger(value);
  return number === undefined ? undefined : String(number);
}

function readOptionalInteger(value: unknown): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }

  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) ? number : undefined;
}

function looksLikeRecord(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => !["page", "pages", "limit", "sort", "total"].includes(key));
}
