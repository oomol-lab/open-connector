import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, positiveInteger } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const loopReturnsApiBaseUrl = "https://api.loopreturns.com/api/v1";

type LoopReturnsRequestPhase = "validate" | "execute";
type QueryValue = string | number | boolean | undefined;
type LoopReturnsContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type LoopReturnsActionHandler = (input: Record<string, unknown>, context: LoopReturnsContext) => Promise<unknown>;

interface LoopReturnsRequestOptions {
  apiKey: string;
  path: string;
  fetcher: ProviderFetch;
  phase: LoopReturnsRequestPhase;
  signal?: AbortSignal;
  query?: Record<string, QueryValue>;
  notFoundAsInvalidInput?: boolean;
}

export const loopReturnsActionHandlers: ProviderActionHandlers<"loop_returns", LoopReturnsActionHandler> = {
  async list_returns(input, context) {
    const payload = await requestLoopReturnsJson({
      apiKey: context.apiKey,
      path: "/warehouse/return/list",
      query: compactObject({
        from: optionalQueryString(input.from),
        to: optionalQueryString(input.to),
        filter: optionalQueryString(input.filter),
        state: optionalQueryString(input.state),
        paginate: true,
        pageSize: optionalQueryNumber(input.pageSize),
        cursor: optionalQueryString(input.cursor),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return normalizeReturnsList(payload);
  },

  async get_return_details(input, context) {
    const query = compactObject({
      return_id: optionalQueryNumber(input.returnId),
      order_id: optionalQueryNumber(input.orderId),
      order_name: optionalQueryString(input.orderName),
      currency_type: optionalQueryString(input.currencyType),
    });
    const identifierCount = [query.return_id, query.order_id, query.order_name].filter(
      (value) => value !== undefined,
    ).length;
    if (identifierCount !== 1) {
      throw new ProviderRequestError(400, "exactly one of returnId, orderId, or orderName is required");
    }

    const payload = await requestLoopReturnsJson({
      apiKey: context.apiKey,
      path: "/warehouse/return/details",
      query,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    const message = readLoopReturnsErrorMessage(payload);
    if (message) {
      return {
        return: null,
        message,
        raw: payload,
      };
    }

    return {
      return: normalizeReturnDetails(requireObject(payload, "Loop Returns return details")),
      message: null,
      raw: payload,
    };
  },

  async list_destinations(_input, context) {
    const payload = await requestLoopReturnsJson({
      apiKey: context.apiKey,
      path: "/destinations",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    const record = requireObject(payload, "Loop Returns destinations response");
    const destinations = Array.isArray(record.destinations) ? record.destinations : [];

    return {
      destinations: destinations.map((destination) =>
        normalizeDestination(requireObject(destination, "Loop Returns destination")),
      ),
    };
  },

  async get_destination(input, context) {
    const destinationId = positiveInteger(
      input.destinationId,
      "destinationId",
      (message) => new ProviderRequestError(400, message),
    );
    const payload = await requestLoopReturnsJson({
      apiKey: context.apiKey,
      path: `/destinations/${encodeURIComponent(String(destinationId))}`,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      destination: normalizeDestination(requireObject(payload, "Loop Returns destination")),
    };
  },
};

export async function validateLoopReturnsCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const providerScopes: string[] = [];
  const providerMetadata: Record<string, unknown> = {
    apiBaseUrl: loopReturnsApiBaseUrl,
  };
  const validationErrors: ProviderRequestError[] = [];

  try {
    const payload = await requestLoopReturnsJson({
      apiKey,
      path: "/destinations",
      fetcher,
      signal,
      phase: "validate",
    });
    const destinationsPayload = requireObject(payload, "Loop Returns destinations response");
    const destinations = Array.isArray(destinationsPayload.destinations) ? destinationsPayload.destinations : [];
    providerScopes.push("destinations:read");
    providerMetadata.destinationCount = destinations.length;
  } catch (error) {
    if (!isValidationAuthError(error)) {
      throw error;
    }
    validationErrors.push(error);
  }

  try {
    const payload = await requestLoopReturnsJson({
      apiKey,
      path: "/warehouse/return/list",
      query: {
        paginate: true,
        pageSize: 1,
      },
      fetcher,
      signal,
      phase: "validate",
    });
    const returnsPayload = normalizeReturnsList(payload);
    providerScopes.push("returns");
    providerMetadata.sampleReturnCount = returnsPayload.returns.length;
  } catch (error) {
    if (!isValidationAuthError(error)) {
      throw error;
    }
    validationErrors.push(error);
  }

  if (providerScopes.length === 0) {
    throw validationErrors[0] ?? new ProviderRequestError(400, "Loop Returns API key could not be validated");
  }

  return {
    profile: {
      accountId: "loop_returns:api_key",
      displayName: "Loop Returns API Key",
    },
    grantedScopes: providerScopes,
    metadata: compactObject({
      ...providerMetadata,
      validationScopes: providerScopes,
    }),
  };
}

async function requestLoopReturnsJson(options: LoopReturnsRequestOptions): Promise<unknown> {
  const timeout = createProviderTimeout(options.signal);
  const url = new URL(`${loopReturnsApiBaseUrl}${options.path}`);
  appendQuery(url, options.query);

  try {
    const response = await options.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-authorization": options.apiKey,
      },
      signal: timeout.signal,
    });
    const payload = await readLoopReturnsPayload(response);

    if (!response.ok) {
      throw mapLoopReturnsError(response, payload, options.phase, options.notFoundAsInvalidInput);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Loop Returns request timed out");
    }

    throw new ProviderRequestError(502, error instanceof Error ? error.message : "Loop Returns request failed");
  } finally {
    timeout.cleanup();
  }
}

function appendQuery(url: URL, query?: Record<string, QueryValue>): void {
  if (!query) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
}

async function readLoopReturnsPayload(response: Response): Promise<unknown> {
  const rawBody = await response.text();
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : 502,
      `Loop Returns returned invalid JSON: ${error instanceof Error ? error.message : rawBody}`,
    );
  }
}

function mapLoopReturnsError(
  response: Response,
  payload: unknown,
  phase: LoopReturnsRequestPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message = readLoopReturnsErrorMessage(payload) ?? `Loop Returns request failed with ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }

  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function readLoopReturnsErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const nestedError = optionalRecord(record.error);
  const nestedMessage = optionalString(nestedError?.message);
  if (nestedMessage) {
    return nestedMessage;
  }

  for (const key of ["message", "detail", "title", "error"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function normalizeReturnsList(payload: unknown): {
  nextPageUrl: string | null;
  previousPageUrl: string | null;
  returns: Array<Record<string, unknown>>;
} {
  if (Array.isArray(payload)) {
    return {
      nextPageUrl: null,
      previousPageUrl: null,
      returns: payload.map((item) => normalizeReturnSummary(requireObject(item, "Loop return"))),
    };
  }

  const record = requireObject(payload, "Loop Returns list response");
  const returns = Array.isArray(record.returns) ? record.returns : [];
  return {
    nextPageUrl: nullableString(record.nextPageUrl),
    previousPageUrl: nullableString(record.previousPageUrl),
    returns: returns.map((item) => normalizeReturnSummary(requireObject(item, "Loop return"))),
  };
}

function normalizeReturnSummary(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredProviderString(record.id, "return id"),
    state: nullableString(record.state),
    createdAt: nullableString(record.created_at),
    updatedAt: nullableString(record.updated_at),
    orderId: nullableStringFromValue(record.order_id),
    orderName: nullableStringFromValue(record.order_name),
    providerOrderId: nullableStringFromValue(record.provider_order_id),
    customer: nullableString(record.customer),
    currency: nullableString(record.currency),
    total: nullableStringFromValue(record.total),
    outcome: nullableString(record.outcome),
    destinationId: nullableStringFromValue(record.destination_id),
    statusPageUrl: nullableString(record.status_page_url),
    raw: record,
  };
}

function normalizeReturnDetails(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: nullableStringFromValue(record.id),
    state: nullableString(record.state),
    createdAt: nullableString(record.created_at),
    updatedAt: nullableString(record.updated_at),
    orderId: nullableStringFromValue(record.order_id),
    orderName: nullableStringFromValue(record.order_name),
    providerOrderId: nullableStringFromValue(record.provider_order_id),
    customerEmail: nullableString(record.customer_email) ?? nullableString(record.customer),
    currency: nullableString(record.currency),
    total: nullableStringFromValue(record.total),
    refund: nullableStringFromValue(record.refund),
    outcome: nullableString(record.outcome),
    carrier: nullableString(record.carrier),
    trackingNumber: nullableString(record.tracking_number),
    destinationId: nullableStringFromValue(record.destination_id),
    statusPageUrl: nullableString(record.status_page_url),
    lineItems: Array.isArray(record.line_items)
      ? record.line_items.filter(
          (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item),
        )
      : [],
    raw: record,
  };
}

function normalizeDestination(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readProviderInteger(record.id, "destination id"),
    type: nullableString(record.type),
    name: nullableString(record.name),
    enabled: nullableBoolean(record.enabled),
    providerLocationId: nullableInteger(record.provider_location_id),
    address: normalizeAddress(record.address),
    raw: record,
  };
}

function normalizeAddress(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }

  return {
    address1: nullableString(record.address1),
    address2: nullableString(record.address2),
    city: nullableString(record.city),
    state: nullableString(record.state),
    zip: nullableString(record.zip),
    country: nullableString(record.country),
    countryCode: nullableString(record.country_code),
  };
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `invalid ${message}`);
  }

  return record;
}

function requiredProviderString(value: unknown, fieldName: string): string {
  const stringValue = nullableStringFromValue(value);
  if (!stringValue) {
    throw new ProviderRequestError(502, `invalid Loop Returns ${fieldName}`);
  }
  return stringValue;
}

function readProviderInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(502, `invalid Loop Returns ${fieldName}`);
  }
  return parsed;
}

function nullableInteger(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableStringFromValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function isValidationAuthError(error: unknown): error is ProviderRequestError {
  return error instanceof ProviderRequestError && error.status === 400;
}

function optionalQueryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalQueryNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
