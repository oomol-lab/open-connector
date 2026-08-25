import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "yelp";
const yelpApiBaseUrl = "https://api.yelp.com";
const yelpValidationPath = "/v3/businesses/search";

type YelpQueryValue = string | number | boolean | undefined;
type YelpActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const yelpActionHandlers: ProviderActionHandlers<"yelp", YelpActionHandler> = {
  async search_businesses(input, context) {
    validateSearchInput(input);
    const payload = await requestYelpJson({
      path: yelpValidationPath,
      query: compactObject({
        term: optionalString(input.term),
        location: optionalString(input.location),
        latitude: optionalNumber(input.latitude),
        longitude: optionalNumber(input.longitude),
        limit: optionalNumber(input.limit),
        offset: optionalNumber(input.offset),
        radius: optionalNumber(input.radius),
        sort_by: optionalString(input.sortBy),
        open_now: optionalBoolean(input.openNow),
        categories: joinStringArray(input.categories),
        open_at: optionalNumber(input.openAt),
        locale: optionalString(input.locale),
        attributes: joinStringArray(input.attributes),
        price: joinStringArray(input.priceTiers),
      }),
      context,
      phase: "execute",
    });
    const record = requireObject(payload, "Yelp search response");
    return {
      businesses: normalizeBusinessArray(record.businesses),
      total: requireInteger(record.total, "Yelp search total"),
      region: normalizeRegion(record.region),
    };
  },
  async search_businesses_by_phone(input, context) {
    const payload = await requestYelpJson({
      path: "/v3/businesses/search/phone",
      query: {
        phone: requireInputString(input.phone, "phone"),
      },
      context,
      phase: "execute",
    });
    const record = requireObject(payload, "Yelp phone search response");
    return {
      businesses: normalizeBusinessArray(record.businesses),
      total: requireInteger(record.total, "Yelp phone search total"),
    };
  },
  async get_business_details(input, context) {
    const businessId = requireInputString(input.businessId, "businessId");
    const payload = await requestYelpJson({
      path: `/v3/businesses/${encodeURIComponent(businessId)}`,
      query: compactObject({
        locale: optionalString(input.locale),
      }),
      context,
      phase: "execute",
    });
    return {
      business: normalizeBusiness(payload),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, yelpActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestYelpJson({
      path: yelpValidationPath,
      query: {
        location: "San Francisco, CA",
        limit: 1,
      },
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const record = requireObject(payload, "Yelp validation response");
    const businesses = Array.isArray(record.businesses) ? record.businesses : [];
    return {
      profile: {
        accountId: "yelp-api-key",
        displayName: "Yelp API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: yelpApiBaseUrl,
        validationEndpoint: yelpValidationPath,
        resultCount: businesses.length,
      },
    };
  },
};

async function requestYelpJson(input: {
  path: string;
  query: Record<string, YelpQueryValue>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: "validate" | "execute";
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(buildYelpUrl(input.path, input.query), {
      method: "GET",
      headers: yelpHeaders(input.context.apiKey),
      signal: input.context.signal,
    });
    payload = await readYelpPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Yelp request failed: ${error.message}` : "Yelp request failed",
    );
  }
  if (!response.ok) {
    throw createYelpError(response, payload, input.phase);
  }
  return payload;
}

function buildYelpUrl(path: string, query: Record<string, YelpQueryValue>): string {
  const url = new URL(path, yelpApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function yelpHeaders(apiKey: string): Headers {
  return new Headers({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });
}

async function readYelpPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<unknown>;
  }
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: { description: text } };
  }
}

function createYelpError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readYelpMessage(payload) ?? `Yelp request failed with ${response.status}`;
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status, message, payload);
}

function readYelpMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const errorRecord = optionalRecord(record?.error);
  return (
    optionalString(errorRecord?.description) ?? optionalString(errorRecord?.text) ?? optionalString(record?.message)
  );
}

function normalizeBusinessArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeBusiness(item));
}

function normalizeBusiness(value: unknown): Record<string, unknown> {
  const record = requireObject(value, "Yelp business response");
  return compactObject({
    id: requireString(record.id, "id"),
    alias: requireString(record.alias, "alias"),
    name: requireString(record.name, "name"),
    imageUrl: optionalString(record.image_url),
    isClosed: requireBoolean(record.is_closed, "is_closed"),
    url: requireString(record.url, "url"),
    reviewCount: optionalInteger(record.review_count),
    categories: normalizeCategoryArray(record.categories),
    rating: optionalNumber(record.rating),
    coordinates: normalizeCoordinates(record.coordinates),
    transactions: readStringArray(record.transactions),
    price: optionalString(record.price),
    location: normalizeLocation(record.location),
    phone: optionalString(record.phone),
    displayPhone: optionalString(record.display_phone),
    distance: optionalNumber(record.distance),
    photos: readStringArray(record.photos),
    hours: normalizeHours(record.hours),
  });
}

function normalizeCategoryArray(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => {
    const record = requireObject(item, "Yelp category response");
    return compactObject({
      alias: requireString(record.alias, "category.alias"),
      title: requireString(record.title, "category.title"),
    });
  });
}

function normalizeCoordinates(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  return compactObject({
    latitude: optionalNumber(record.latitude),
    longitude: optionalNumber(record.longitude),
  });
}

function normalizeLocation(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  return compactObject({
    address1: optionalString(record.address1),
    address2: optionalString(record.address2),
    address3: optionalString(record.address3),
    city: optionalString(record.city),
    state: optionalString(record.state),
    zipCode: optionalString(record.zip_code),
    country: optionalString(record.country),
    displayAddress: readStringArray(record.display_address),
  });
}

function normalizeRegion(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  const center = normalizeCoordinates(record?.center);
  return center ? { center } : undefined;
}

function normalizeHours(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => {
    const record = requireObject(item, "Yelp hours response");
    return compactObject({
      open: normalizeHourEntries(record.open) ?? [],
      hoursType: requireString(record.hours_type, "hours_type"),
      isOpenNow: requireBoolean(record.is_open_now, "is_open_now"),
    });
  });
}

function normalizeHourEntries(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => {
    const record = requireObject(item, "Yelp hour entry response");
    return {
      isOvernight: requireBoolean(record.is_overnight, "is_overnight"),
      start: requireString(record.start, "start"),
      end: requireString(record.end, "end"),
      day: requireInteger(record.day, "day"),
    };
  });
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
}

function joinStringArray(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return items.length > 0 ? items.join(",") : undefined;
}

function validateSearchInput(input: Record<string, unknown>): void {
  const hasLocation = Boolean(optionalString(input.location));
  const hasLatitude = typeof input.latitude === "number";
  const hasLongitude = typeof input.longitude === "number";
  const hasCoordinatePair = hasLatitude && hasLongitude;
  if (!hasLocation && !hasCoordinatePair) {
    throw new ProviderRequestError(400, "Provide location or both latitude and longitude");
  }
  if ((hasLatitude || hasLongitude) && !hasCoordinatePair) {
    throw new ProviderRequestError(400, "latitude and longitude must be provided together");
  }
  if (hasLocation && hasCoordinatePair) {
    throw new ProviderRequestError(400, "Provide location or latitude/longitude, not both");
  }
}

function requireInputString(value: unknown, fieldName: string): string {
  const result = optionalString(value);
  if (!result) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return result;
}

function requireString(value: unknown, fieldName: string): string {
  const result = optionalString(value);
  if (!result) {
    throw new ProviderRequestError(502, `Yelp ${fieldName} response is invalid`);
  }
  return result;
}

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `Yelp ${fieldName} response is invalid`);
  }
  return value;
}

function optionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function requireInteger(value: unknown, fieldName: string): number {
  const result = optionalInteger(value);
  if (result === undefined) {
    throw new ProviderRequestError(502, `${fieldName} response is invalid`);
  }
  return result;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
