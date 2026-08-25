import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const mobileTextAlertsApiBaseUrl = "https://api.mobile-text-alerts.com/v3";

type RequestPhase = "validate" | "execute";
type RequestMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface RequestOptions {
  apiKey: string;
  path: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  phase: RequestPhase;
  method?: RequestMethod;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}

const mutationFields = ["firstName", "lastName", "email", "number", "e164Number", "groupIds", "subscriberFields"];

export const mobileTextAlertsActionHandlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async list_subscribers(input, context) {
    const payload = await requestMobileTextAlertsJson({
      apiKey: context.apiKey,
      path: "/subscribers",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      query: compactObject({
        page: optionalNumber(input.page),
        pageSize: optionalNumber(input.pageSize),
        query: optionalString(input.query),
        sortBy: optionalString(input.sortBy),
        sortDirection: optionalString(input.sortDirection),
        allSubscribers: optionalBoolean(input.allSubscribers),
      }),
    });
    const data = requireObjectProperty(payload, "data", "subscriber list response");
    return {
      subscribers: requireArrayProperty(data, "rows", "subscriber list response"),
      page: requireNumberProperty(data, "page", "subscriber list response"),
      pageSize: requireNumberProperty(data, "pageSize", "subscriber list response"),
      total: requireNumberProperty(data, "total", "subscriber list response"),
    };
  },
  async get_subscriber(input, context) {
    return subscriberMutationResponse(
      await requestMobileTextAlertsJson({
        apiKey: context.apiKey,
        path: `/subscribers/${pathValue(input.subscriberId, "subscriberId")}`,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
      "get subscriber response",
    );
  },
  async create_subscriber(input, context) {
    return subscriberMutationResponse(
      await requestMobileTextAlertsJson({
        apiKey: context.apiKey,
        path: "/subscribers",
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
        method: "POST",
        body: pickBody(input, mutationFields),
      }),
      "create subscriber response",
    );
  },
  async update_subscriber(input, context) {
    return subscriberMutationResponse(
      await requestMobileTextAlertsJson({
        apiKey: context.apiKey,
        path: `/subscribers/${pathValue(input.subscriberId, "subscriberId")}`,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
        method: "PATCH",
        body: pickBody(input, mutationFields),
      }),
      "update subscriber response",
    );
  },
  async delete_subscriber(input, context) {
    const payload = await requestMobileTextAlertsJson({
      apiKey: context.apiKey,
      path: `/subscribers/${pathValue(input.subscriberId, "subscriberId")}`,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      method: "DELETE",
    });
    return {
      deleted: true,
      message: requireStringProperty(payload, "message", "delete subscriber response"),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "mobile_text_alerts",
  mobileTextAlertsActionHandlers,
  { skipDnsValidation: true },
);

export async function validateMobileTextAlertsCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestMobileTextAlertsJson({
    apiKey,
    path: "/auth/verify-api-key",
    fetcher,
    signal,
    phase: "validate",
  });
  const data = requireObjectProperty(payload, "data", "API key verification response");
  const name = requireStringProperty(data, "name", "API key verification response");
  return {
    profile: { accountId: name, displayName: name },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: mobileTextAlertsApiBaseUrl,
      validationEndpoint: "/auth/verify-api-key",
    },
  };
}

async function requestMobileTextAlertsJson(options: RequestOptions): Promise<unknown> {
  const url = new URL(`${mobileTextAlertsApiBaseUrl}${options.path}`);
  for (const [name, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }

  let response: Response;
  try {
    response = await options.fetcher(url, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal ?? AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new ProviderRequestError(
      error instanceof DOMException && error.name === "TimeoutError" ? 504 : 502,
      error instanceof Error
        ? `Mobile Text Alerts request failed: ${error.message}`
        : "Mobile Text Alerts request failed",
    );
  }

  const payload = await readPayload(response);
  if (!response.ok) throw mobileTextAlertsError(response, payload, options.phase);
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function mobileTextAlertsError(response: Response, payload: unknown, phase: RequestPhase) {
  const record = optionalRecord(payload);
  const message = optionalString(record?.message) ?? `Mobile Text Alerts request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 429) return new ProviderRequestError(429, message);
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}

function subscriberMutationResponse(payload: unknown, label: string) {
  return {
    subscriber: requireObjectProperty(payload, "data", label),
    message: requireStringProperty(payload, "message", label),
  };
}

function pickBody(input: Record<string, unknown>, fields: readonly string[]) {
  const body: Record<string, unknown> = {};
  for (const field of fields) if (input[field] !== undefined) body[field] = input[field];
  return body;
}

function pathValue(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, `${field} must be a non-empty string`);
  }
  return encodeURIComponent(value);
}

function requireObjectProperty(value: unknown, field: string, label: string) {
  const record = optionalRecord(value);
  const property = optionalRecord(record?.[field]);
  if (!property) throw new ProviderRequestError(502, `Mobile Text Alerts ${label} is missing ${field}`);
  return property;
}

function requireArrayProperty(value: unknown, field: string, label: string) {
  const record = optionalRecord(value);
  const property = record?.[field];
  if (!Array.isArray(property)) throw new ProviderRequestError(502, `Mobile Text Alerts ${label} is missing ${field}`);
  return property;
}

function requireStringProperty(value: unknown, field: string, label: string) {
  const record = optionalRecord(value);
  const property = record?.[field];
  if (typeof property !== "string")
    throw new ProviderRequestError(502, `Mobile Text Alerts ${label} is missing ${field}`);
  return property;
}

function requireNumberProperty(value: unknown, field: string, label: string) {
  const record = optionalRecord(value);
  const property = record?.[field];
  if (typeof property !== "number")
    throw new ProviderRequestError(502, `Mobile Text Alerts ${label} is missing ${field}`);
  return property;
}
