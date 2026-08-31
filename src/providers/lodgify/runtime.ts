import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  setSearchParams,
} from "../provider-runtime.ts";

export const lodgifyApiBaseUrl = "https://api.lodgify.com";

const lodgifyValidationPath = "/v2/properties";

type LodgifyPhase = "validate" | "execute";
type LodgifyActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

interface LodgifyRequestInput {
  path: string;
  context: LodgifyActionContext;
  phase: LodgifyPhase;
  query?: Record<string, string | undefined>;
}

export const lodgifyActionHandlers: ProviderActionHandlers<"lodgify", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  list_properties(input, context) {
    return listProperties(input, context);
  },
  get_property(input, context) {
    return getProperty(input, context);
  },
  list_property_rooms(input, context) {
    return listPropertyRooms(input, context);
  },
  get_property_availability(input, context) {
    return getPropertyAvailability(input, context);
  },
  get_quote(input, context) {
    return getQuote(input, context);
  },
  list_bookings(input, context) {
    return listBookings(input, context);
  },
  get_booking(input, context) {
    return getBooking(input, context);
  },
};

export async function validateLodgifyCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestLodgifyJson({
    path: lodgifyValidationPath,
    context: { apiKey, fetcher, signal },
    phase: "validate",
    query: {
      page: "1",
      size: "1",
      includeCount: "true",
    },
  });
  const body = requireObjectPayload(payload);
  const properties = normalizePropertyList(body.items);
  const firstProperty = properties[0];

  return {
    profile: {
      accountId: "lodgify-api-key",
      displayName: "Lodgify API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: lodgifyApiBaseUrl,
      validationEndpoint: lodgifyValidationPath,
      propertyCount: optionalNumber(body.count),
      firstPropertyId: firstProperty?.id ?? undefined,
      firstPropertyName: firstProperty?.name ?? undefined,
    }),
  };
}

async function listProperties(input: Record<string, unknown>, context: LodgifyActionContext): Promise<unknown> {
  const payload = await requestLodgifyJson({
    path: "/v2/properties",
    context,
    phase: "execute",
    query: compactObject({
      page: stringifyOptionalInteger(input.page, "page"),
      size: stringifyOptionalInteger(input.size, "size"),
      includeCount: stringifyOptionalBoolean(input.includeCount),
    }),
  });
  const body = requireObjectPayload(payload);

  return {
    count: readNullableInteger(body.count),
    properties: normalizePropertyList(body.items),
    raw: body,
  };
}

async function getProperty(input: Record<string, unknown>, context: LodgifyActionContext): Promise<unknown> {
  const propertyId = readPositiveInteger(input.propertyId, "propertyId");
  const payload = await requestLodgifyJson({
    path: `/v2/properties/${propertyId}`,
    context,
    phase: "execute",
  });
  const body = requireObjectPayload(payload);

  return {
    property: normalizeProperty(body),
    raw: body,
  };
}

async function listPropertyRooms(input: Record<string, unknown>, context: LodgifyActionContext): Promise<unknown> {
  const propertyId = readPositiveInteger(input.propertyId, "propertyId");
  const payload = await requestLodgifyJson({
    path: `/v2/properties/${propertyId}/rooms`,
    context,
    phase: "execute",
  });
  const rooms = requireObjectArrayPayload(payload);

  return {
    rooms: rooms.map(normalizeRoom),
    raw: rooms,
  };
}

async function getPropertyAvailability(
  input: Record<string, unknown>,
  context: LodgifyActionContext,
): Promise<unknown> {
  const propertyId = readPositiveInteger(input.propertyId, "propertyId");
  const payload = await requestLodgifyJson({
    path: `/v2/availability/${propertyId}`,
    context,
    phase: "execute",
    query: {
      from: requireDateString(input.from, "from"),
      to: requireDateString(input.to, "to"),
    },
  });
  const periods = requireObjectArrayPayload(payload);

  return {
    availability: periods.map(normalizeAvailabilityPeriod),
    raw: periods,
  };
}

async function getQuote(input: Record<string, unknown>, context: LodgifyActionContext): Promise<unknown> {
  const propertyId = readPositiveInteger(input.propertyId, "propertyId");
  const payload = await requestLodgifyJson({
    path: `/v2/quote/${propertyId}`,
    context,
    phase: "execute",
    query: {
      from: requireDateString(input.from, "from"),
      to: requireDateString(input.to, "to"),
      "roomTypes[0].Id": String(readPositiveInteger(input.roomTypeId, "roomTypeId")),
      "guest_breakdown[adults]": String(readPositiveInteger(input.adults, "adults")),
    },
  });
  const body = requireObjectPayload(payload);

  return {
    quote: normalizeQuote(body),
    raw: body,
  };
}

async function listBookings(input: Record<string, unknown>, context: LodgifyActionContext): Promise<unknown> {
  const payload = await requestLodgifyJson({
    path: "/v2/reservations/bookings",
    context,
    phase: "execute",
    query: compactObject({
      page: stringifyOptionalInteger(input.page, "page"),
      size: stringifyOptionalInteger(input.size, "size"),
      stayFilter: readOptionalStayFilter(input.stayFilter),
    }),
  });
  const body = requireObjectPayload(payload);

  return {
    count: readNullableInteger(body.count),
    bookings: normalizeBookingList(body.items),
    raw: body,
  };
}

async function getBooking(input: Record<string, unknown>, context: LodgifyActionContext): Promise<unknown> {
  const bookingId = readPositiveInteger(input.bookingId, "bookingId");
  const payload = await requestLodgifyJson({
    path: `/v2/reservations/bookings/${bookingId}`,
    context,
    phase: "execute",
  });
  const body = requireObjectPayload(payload);

  return {
    booking: normalizeBooking(body),
    raw: body,
  };
}

async function requestLodgifyJson(input: LodgifyRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal);

  try {
    const response = await input.context.fetcher(buildLodgifyUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-ApiKey": input.context.apiKey,
      },
      signal: timeout.signal,
    });
    const payload = await readResponsePayload(response);

    if (!response.ok) {
      throw mapLodgifyError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Lodgify request timed out", error);
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Lodgify request failed: ${error.message}` : "Lodgify request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildLodgifyUrl(path: string, query?: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${lodgifyApiBaseUrl}/`);
  setSearchParams(url, query ?? {});
  return url;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Lodgify returned invalid JSON");
  }
}

function mapLodgifyError(status: number, payload: unknown, phase: LodgifyPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Lodgify API request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  const directMessage =
    optionalString(body.message) ??
    optionalString(body.error) ??
    optionalString(body.title) ??
    optionalString(body.detail);
  if (directMessage?.trim()) {
    return directMessage.trim();
  }

  const nestedError = optionalRecord(body.error);
  return optionalString(nestedError?.message)?.trim();
}

function requireObjectPayload(payload: unknown): Record<string, unknown> {
  const body = optionalRecord(payload);
  if (!body) {
    throw new ProviderRequestError(502, "Lodgify returned an invalid object payload", payload);
  }
  return body;
}

function requireObjectArrayPayload(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Lodgify returned an invalid array payload", payload);
  }

  return payload.map((item) => {
    const body = optionalRecord(item);
    if (!body) {
      throw new ProviderRequestError(502, "Lodgify returned an invalid array item", item);
    }
    return body;
  });
}

function normalizePropertyList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item) => item !== undefined)
    .map(normalizeProperty);
}

function normalizeBookingList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item) => item !== undefined)
    .map(normalizeBooking);
}

function normalizeProperty(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readNullableInteger(item.id),
    name: optionalString(item.name) ?? null,
    raw: item,
  };
}

function normalizeRoom(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readNullableInteger(item.id),
    name: optionalString(item.name) ?? null,
    raw: item,
  };
}

function normalizeAvailabilityPeriod(item: Record<string, unknown>): Record<string, unknown> {
  return {
    roomTypeId: readNullableInteger(item.room_type_id ?? item.roomTypeId),
    start: optionalString(item.start) ?? null,
    end: optionalString(item.end) ?? null,
    available: readNullableNumber(item.available),
    raw: item,
  };
}

function normalizeQuote(item: Record<string, unknown>): Record<string, unknown> {
  return {
    totalIncludingVat: readNullableNumber(item.total_including_vat ?? item.totalIncludingVat),
    currencyCode: optionalString(item.currency_code ?? item.currencyCode) ?? null,
    raw: item,
  };
}

function normalizeBooking(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readNullableInteger(item.id),
    status: optionalString(item.status) ?? null,
    raw: item,
  };
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed == null || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`, value);
  }
  return parsed;
}

function stringifyOptionalInteger(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return String(readPositiveInteger(value, fieldName));
}

function stringifyOptionalBoolean(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(400, "includeCount must be a boolean", value);
  }
  return String(value);
}

function requireDateString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} must be a date string`, value);
  }
  return value.trim();
}

function readOptionalStayFilter(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "Upcoming" || value === "Current" || value === "Historic" || value === "All") {
    return value;
  }
  throw new ProviderRequestError(400, "stayFilter must be Upcoming, Current, Historic, or All", value);
}

function readNullableInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}
