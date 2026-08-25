import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const squareApiBaseUrl = "https://connect.squareup.com";
export const squareApiVersion = "2026-05-20";

type SquareRequestPhase = "validate" | "execute";
type SquareActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface SquareRequestInput {
  path: string;
  method: "GET" | "POST" | "PUT";
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: SquareRequestPhase;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

export const squareActionHandlers: ProviderActionHandlers<"square", SquareActionHandler> = {
  async list_locations(_input, context) {
    const payload = await requestSquareJson({
      path: "/v2/locations",
      method: "GET",
      context,
      phase: "execute",
    });
    const record = asRecord(payload, "Square locations response");
    return {
      locations: Array.isArray(record.locations) ? record.locations : [],
    };
  },
  async list_customers(input, context) {
    const payload = await requestSquareJson({
      path: "/v2/customers",
      method: "GET",
      context,
      phase: "execute",
      query: pickQuery(input, ["cursor", "limit", "sort_field"]),
    });
    return normalizeCustomerPage(payload);
  },
  async get_customer(input, context) {
    const payload = await requestSquareJson({
      path: `/v2/customers/${encodePathSegment(requiredInputString(input, "customer_id"))}`,
      method: "GET",
      context,
      phase: "execute",
    });
    return { customer: requireResponseObject(payload, "customer", "Square customer response") };
  },
  async create_customer(input, context) {
    const payload = await requestSquareJson({
      path: "/v2/customers",
      method: "POST",
      context,
      phase: "execute",
      body: customerRequestBody(input),
    });
    return {
      customer: requireResponseObject(payload, "customer", "Square create customer response"),
    };
  },
  async update_customer(input, context) {
    const payload = await requestSquareJson({
      path: `/v2/customers/${encodePathSegment(requiredInputString(input, "customer_id"))}`,
      method: "PUT",
      context,
      phase: "execute",
      body: customerRequestBody(input),
    });
    return {
      customer: requireResponseObject(payload, "customer", "Square update customer response"),
    };
  },
  async search_customers(input, context) {
    const payload = await requestSquareJson({
      path: "/v2/customers/search",
      method: "POST",
      context,
      phase: "execute",
      body: compactObject({
        query: input.query,
        limit: input.limit,
        cursor: input.cursor,
      }),
    });
    return normalizeCustomerPage(payload);
  },
};

export async function validateSquareCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestSquareJson({
    path: "/v2/locations",
    method: "GET",
    context: { apiKey, fetcher, signal },
    phase: "validate",
  });
  const record = asRecord(payload, "Square locations response");
  const locations = Array.isArray(record.locations) ? record.locations : [];
  const firstLocation = optionalRecord(locations[0]);
  const firstLocationName = optionalString(firstLocation?.name);
  const firstLocationId = optionalString(firstLocation?.id);
  const businessName = optionalString(firstLocation?.business_name);
  const merchantId = optionalString(firstLocation?.merchant_id);

  return {
    profile: {
      accountId: merchantId ?? firstLocationId,
      displayName: businessName ?? firstLocationName ?? firstLocationId ?? "Square Access Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: squareApiBaseUrl,
      validationEndpoint: "/v2/locations",
      firstLocationId,
      firstLocationName,
      merchantId,
    }),
  };
}

async function requestSquareJson(input: SquareRequestInput): Promise<unknown> {
  const url = buildSquareUrl(input.path, input.query);
  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method,
      headers: squareHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Square request failed: ${error instanceof Error ? error.message : "unknown transport error"}`,
    );
  }

  const payload = await readSquarePayload(response);
  if (!response.ok) {
    throw createSquareError(response.status, payload, input.phase);
  }
  return payload;
}

function buildSquareUrl(path: string, query?: Record<string, unknown>): string {
  const url = new URL(path, squareApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function squareHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "square-version": squareApiVersion,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readSquarePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "invalid Square response");
  }
}

function createSquareError(status: number, payload: unknown, phase: SquareRequestPhase): ProviderRequestError {
  const message = readSquareErrorMessage(payload) ?? `Square request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message);
  }
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function readSquareErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const errors = Array.isArray(record?.errors) ? record.errors : [];
  const firstError = optionalRecord(errors[0]);
  return (
    optionalString(firstError?.detail) ??
    optionalString(firstError?.code) ??
    optionalString(record?.message) ??
    optionalString(record?.error)
  );
}

function normalizeCustomerPage(payload: unknown): Record<string, unknown> {
  const record = asRecord(payload, "Square customers response");
  const cursor = optionalString(record.cursor) ?? null;
  return {
    customers: Array.isArray(record.customers) ? record.customers : [],
    cursor,
    nextCursor: cursor,
  };
}

function customerRequestBody(input: Record<string, unknown>): Record<string, unknown> {
  const customer = requiredRecord(input.customer, "customer", (message) => new ProviderRequestError(400, message));
  return compactObject({
    ...customer,
    idempotency_key: input.idempotency_key,
  });
}

function pickQuery(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.flatMap((key) => (input[key] === undefined ? [] : [[key, input[key]]])));
}

function requiredInputString(input: Record<string, unknown>, fieldName: string): string {
  return requiredString(input[fieldName], fieldName, (message) => new ProviderRequestError(400, message));
}

function requireResponseObject(payload: unknown, fieldName: string, label: string): Record<string, unknown> {
  const record = asRecord(payload, label);
  return asRecord(record[fieldName], label);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `invalid ${label}`);
  }
  return record;
}
