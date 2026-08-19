import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const hotspotsystemApiBaseUrl = "https://api.hotspotsystem.com/v2.0";
export const hotspotsystemValidationPath = "/me";

const hotspotsystemRequestTimeoutMs = 15_000;

type HotspotsystemRequestPhase = "validate" | "execute";
type QueryValue = string | number | undefined;
type HotspotsystemActionContext = ApiKeyProviderContext;
type HotspotsystemActionHandler = (
  input: Record<string, unknown>,
  context: HotspotsystemActionContext,
) => Promise<unknown>;

interface HotspotsystemRequestInput {
  path: string;
  query?: Record<string, QueryValue>;
}

interface HotspotsystemResponse {
  payload: Record<string, unknown>;
  response: Response;
}

export const hotspotsystemActionHandlers: ProviderActionHandlers<"hotspotsystem", HotspotsystemActionHandler> = {
  async get_current_owner(_input, context) {
    const response = await hotspotsystemRequestJson(
      {
        path: hotspotsystemValidationPath,
      },
      context,
      "execute",
    );

    return {
      owner: normalizeOwner(response.payload),
    };
  },
  async list_locations(input, context) {
    const response = await hotspotsystemRequestJson(
      {
        path: "/locations",
        query: buildPaginationQuery(input),
      },
      context,
      "execute",
    );

    return {
      locations: readLocationArray(response.payload.items),
      pagination: parseHotspotsystemPagination(response.response.headers),
    };
  },
  async list_location_options(_input, context) {
    const response = await hotspotsystemRequestJson(
      {
        path: "/locations/options",
      },
      context,
      "execute",
    );

    return {
      locationOptions: readLocationOptionArray(response.payload.items),
    };
  },
  async list_customers(input, context) {
    const response = await hotspotsystemRequestJson(
      {
        path: "/customers",
        query: buildPaginationQuery(input),
      },
      context,
      "execute",
    );

    return {
      customers: readPersonArray(response.payload.items),
      pagination: parseHotspotsystemPagination(response.response.headers),
    };
  },
  async list_location_customers(input, context) {
    const locationId = readRequiredTrimmedString(input.locationId, "locationId");
    const response = await hotspotsystemRequestJson(
      {
        path: `/locations/${encodeURIComponent(locationId)}/customers`,
        query: buildPaginationQuery(input),
      },
      context,
      "execute",
    );

    return {
      customers: readPersonArray(response.payload.items),
      pagination: parseHotspotsystemPagination(response.response.headers),
    };
  },
  async list_subscribers(input, context) {
    const response = await hotspotsystemRequestJson(
      {
        path: "/subscribers",
        query: buildPaginationQuery(input),
      },
      context,
      "execute",
    );

    return {
      subscribers: readPersonArray(response.payload.items),
      pagination: parseHotspotsystemPagination(response.response.headers),
    };
  },
  async list_location_subscribers(input, context) {
    const locationId = readRequiredTrimmedString(input.locationId, "locationId");
    const response = await hotspotsystemRequestJson(
      {
        path: `/locations/${encodeURIComponent(locationId)}/subscribers`,
        query: buildPaginationQuery(input),
      },
      context,
      "execute",
    );

    return {
      subscribers: readPersonArray(response.payload.items),
      pagination: parseHotspotsystemPagination(response.response.headers),
    };
  },
};

export async function validateHotspotsystemCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const response = await hotspotsystemRequestJson(
    {
      path: hotspotsystemValidationPath,
    },
    {
      apiKey: input.apiKey,
      fetcher: options.fetcher,
      signal: options.signal,
    },
    "validate",
  );
  const owner = normalizeOwner(response.payload);

  return {
    profile: {
      accountId: String(owner.userId),
      displayName: owner.operator,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: hotspotsystemApiBaseUrl,
      validationEndpoint: hotspotsystemValidationPath,
      userId: owner.userId,
      operator: owner.operator,
    },
  };
}

async function hotspotsystemRequestJson(
  input: HotspotsystemRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: HotspotsystemRequestPhase,
): Promise<HotspotsystemResponse> {
  const response = await hotspotsystemRawRequest(input, context);
  const payload = await readHotspotsystemPayload(response);

  if (!response.ok) {
    throw createHotspotsystemError(response.status, payload, phase);
  }
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, "HotspotSystem returned an invalid JSON object", payload);
  }

  return {
    payload: object,
    response,
  };
}

async function hotspotsystemRawRequest(
  input: HotspotsystemRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Response> {
  const normalizedPath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(normalizedPath, `${hotspotsystemApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(context.signal, hotspotsystemRequestTimeoutMs);
  try {
    return await context.fetcher(url, {
      method: "GET",
      signal: timeout.signal,
      headers: {
        accept: "application/json",
        "sn-apikey": context.apiKey,
        "user-agent": providerUserAgent,
      },
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "HotspotSystem request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `HotspotSystem request failed: ${error.message}` : "HotspotSystem request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readHotspotsystemPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "HotspotSystem returned invalid JSON");
  }
}

function createHotspotsystemError(
  status: number,
  payload: unknown,
  phase: HotspotsystemRequestPhase,
): ProviderRequestError {
  const message = readHotspotsystemErrorMessage(payload) ?? `HotspotSystem request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function readHotspotsystemErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.error) ?? optionalString(record.message);
}

function normalizeOwner(payload: Record<string, unknown>): { userId: number; operator: string } {
  const userId = optionalNumber(payload.userId);
  if (userId === undefined) {
    throw new ProviderRequestError(502, "HotspotSystem owner.userId is missing", payload);
  }
  return {
    userId,
    operator: readRequiredTrimmedString(payload.operator, "operator"),
  };
}

function readLocationArray(value: unknown): Array<{ id: string; name: string }> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "HotspotSystem locations.items must be an array", value);
  }
  return value.map((item, index) => readLocation(item, `locations.items[${index}]`));
}

function readLocationOptionArray(value: unknown): Array<{ id: string; name: string }> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "HotspotSystem location options.items must be an array", value);
  }
  return value.map((item, index) => readLocation(item, `locationOptions.items[${index}]`));
}

function readLocation(value: unknown, fieldName: string): { id: string; name: string } {
  const record = readRequiredObject(value, fieldName);
  return {
    id: readRequiredTrimmedString(record.id, `${fieldName}.id`),
    name: readRequiredTrimmedString(record.name, `${fieldName}.name`),
  };
}

function readPersonArray(value: unknown): Array<Record<string, string | null>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "HotspotSystem items must be an array", value);
  }
  return value.map((item, index) => normalizePersonRecord(item, `items[${index}]`));
}

function normalizePersonRecord(value: unknown, fieldName: string): Record<string, string | null> {
  const record = readRequiredObject(value, fieldName);
  return {
    id: readOptionalNullableString(record.id),
    userName: readOptionalNullableString(record.user_name),
    name: readOptionalNullableString(record.name),
    email: readOptionalNullableString(record.email),
    companyName: readOptionalNullableString(record.company_name),
    address: readOptionalNullableString(record.address),
    city: readOptionalNullableString(record.city),
    state: readOptionalNullableString(record.state),
    zip: readOptionalNullableString(record.zip),
    countryCode: readOptionalNullableString(record.country_code),
    phone: readOptionalNullableString(record.phone),
    socialNetwork: readOptionalNullableString(record.social_network),
    socialId: readOptionalNullableString(record.social_id),
    socialUsername: readOptionalNullableString(record.social_username),
    socialLink: readOptionalNullableString(record.social_link),
    socialGender: readOptionalNullableString(record.social_gender),
    socialAgeRange: readOptionalNullableString(record.social_age_range),
    socialFollowersCount: readOptionalNullableString(record.social_followers_count),
    registeredAt: readOptionalNullableString(record.registered_at),
  };
}

function readOptionalNullableString(value: unknown): string | null {
  return value == null ? null : (optionalString(value) ?? null);
}

function parseHotspotsystemPagination(headers: Headers): Record<string, string | number | null> {
  const links = parseLinkHeader(headers.get("link"));
  const self = links.self ?? null;
  const next = links.next ?? null;
  const prev = links.prev ?? null;
  const selfUrl = parseAbsoluteUrl(self);
  const nextUrl = parseAbsoluteUrl(next);
  const prevUrl = parseAbsoluteUrl(prev);

  return {
    self,
    next,
    prev,
    limit: readOffsetInteger(selfUrl, "limit"),
    offset: readOffsetInteger(selfUrl, "offset"),
    nextOffset: readOffsetInteger(nextUrl, "offset"),
    prevOffset: readOffsetInteger(prevUrl, "offset"),
  };
}

function parseLinkHeader(value: string | null): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  if (!value) {
    return result;
  }
  for (const segment of value.split(",")) {
    const trimmed = segment.trim();
    const start = trimmed.indexOf("<");
    const end = trimmed.indexOf(">");
    if (start === -1 || end === -1 || end <= start + 1) {
      continue;
    }
    const url = trimmed.slice(start + 1, end);
    const relMatch = trimmed.match(/rel="?([^";,\s]+)"?/i);
    const rel = relMatch?.[1]?.trim();
    if (rel) {
      result[rel] = url;
    }
  }
  return result;
}

function parseAbsoluteUrl(value: string | null): URL | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function readOffsetInteger(url: URL | null, key: string): number | null {
  if (!url) {
    return null;
  }
  const raw = url.searchParams.get(key);
  if (raw == null || raw.trim() === "") {
    return null;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    fields: optionalString(input.fields),
    sort: optionalString(input.sort),
    limit: optionalInteger(input.limit),
    offset: optionalInteger(input.offset),
  });
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`, value);
  }
  return record;
}

function readRequiredTrimmedString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `${fieldName} is required`);
  }
  return text;
}
