import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { compactJson } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const placekeyApiBaseUrl = "https://api.placekey.io";
const placekeyLookupPath = "/v1/placekey";
const placekeyBulkLookupPath = "/v1/placekeys";
const validationQuery = { latitude: 37.7371, longitude: -122.44283 };

type PlacekeyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const placekeyActionHandlers: ProviderActionHandlers<"placekey", PlacekeyActionHandler> = {
  async get_placekey(input, context) {
    const payload = await requestPlacekey(context, placekeyLookupPath, {
      query: buildSingleLookupQuery(input, true),
      options: buildOptions(input, true),
    });
    return parseLookupResult(payload, "single lookup");
  },
  async get_placekeys_bulk(input, context) {
    const queries = Array.isArray(input.queries)
      ? input.queries.map((query) => buildSingleLookupQuery(requiredRecord(query, "Placekey bulk query"), false))
      : [];
    const payload = await requestPlacekey(context, placekeyBulkLookupPath, {
      queries,
      options: buildOptions(input, false),
    });
    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Placekey bulk lookup response is invalid");
    }
    return payload.map((item, index) => parseLookupResult(item, `bulk lookup item ${index + 1}`));
  },
  async get_placekey_from_address(input, context) {
    const lookup = parseLookupResult(
      await requestPlacekey(context, placekeyLookupPath, { query: buildAddressLookupQuery(input, true) }),
      "address lookup",
    );
    return compactObject({
      query_id: lookup.query_id,
      placekey: lookup.placekey,
      error: lookup.error,
    });
  },
  async get_geocode_from_address(input, context) {
    const lookup = parseLookupResult(
      await requestPlacekey(context, placekeyLookupPath, {
        query: buildAddressLookupQuery(input, false),
        options: { fields: ["geocode"] },
      }),
      "geocode lookup",
    );
    if (!lookup.placekey) {
      throw new ProviderRequestError(502, "Placekey geocode lookup response is missing placekey");
    }
    if (!lookup.geocode) {
      throw new ProviderRequestError(502, "Placekey geocode lookup response is missing geocode");
    }
    return {
      query_id: lookup.query_id,
      placekey: lookup.placekey,
      geocode: lookup.geocode,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("placekey", placekeyActionHandlers);

export async function validatePlacekeyCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const lookup = parseLookupResult(
    await requestPlacekey({ apiKey, fetcher }, placekeyLookupPath, { query: validationQuery }, "validate"),
    "validation",
  );
  if (!lookup.placekey) {
    throw new ProviderRequestError(502, "Placekey validation response did not include a placekey");
  }
  return {
    profile: {
      accountId: "placekey-api-key",
      displayName: "Placekey API key",
      grantedScopes: [],
    },
    metadata: {
      apiBaseUrl: placekeyApiBaseUrl,
      validationEndpoint: placekeyLookupPath,
      validationMode: "coordinate_lookup",
    },
  };
}

async function requestPlacekey(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  path: string,
  body: Record<string, unknown>,
  phase: "validate" | "execute" = "execute",
) {
  const url = new URL(path, placekeyApiBaseUrl);
  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        apikey: context.apiKey,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(compactJson(body)),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Placekey request failed: ${error.message}` : "Placekey request failed",
    );
  }
  const payload = await readPlacekeyPayload(response);
  if (!response.ok) {
    throw createPlacekeyError(response, payload, phase);
  }
  return payload;
}

function buildSingleLookupQuery(input: Record<string, unknown>, includePlaceMetadata: boolean) {
  return compactObject({
    query_id: optionalString(input.query_id),
    street_address: optionalString(input.street_address),
    city: optionalString(input.city),
    region: optionalString(input.region),
    postal_code: optionalString(input.postal_code),
    iso_country_code: optionalString(input.iso_country_code),
    latitude: optionalNumber(input.latitude),
    longitude: optionalNumber(input.longitude),
    location_name: optionalString(input.location_name),
    place_metadata: includePlaceMetadata ? optionalRecord(input.place_metadata) : undefined,
  });
}

function buildAddressLookupQuery(input: Record<string, unknown>, includeLocationName: boolean) {
  return compactObject({
    street_address: optionalString(input.street_address),
    city: optionalString(input.city),
    region: optionalString(input.region),
    postal_code: optionalString(input.postal_code),
    iso_country_code: optionalString(input.iso_country_code),
    location_name: includeLocationName ? optionalString(input.location_name) : undefined,
  });
}

function buildOptions(input: Record<string, unknown>, includeFields: boolean) {
  const options = optionalRecord(input.options);
  if (!options) {
    return undefined;
  }
  return compactObject({
    fields:
      includeFields && Array.isArray(options.fields)
        ? options.fields.filter((field): field is string => typeof field === "string")
        : undefined,
    strict_name_match: typeof options.strict_name_match === "boolean" ? options.strict_name_match : undefined,
    strict_address_match: typeof options.strict_address_match === "boolean" ? options.strict_address_match : undefined,
  });
}

async function readPlacekeyPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createPlacekeyError(response: Response, payload: unknown, phase: "validate" | "execute") {
  const message = extractPlacekeyMessage(payload, `Placekey request failed with status ${response.status}`);
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404) return new ProviderRequestError(400, message, payload);
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

function extractPlacekeyMessage(payload: unknown, fallback: string) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return fallback;
  }
  const errors = record.errors;
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    (Array.isArray(errors) ? optionalString(errors[0]) : undefined) ??
    fallback
  );
}

function parseLookupResult(payload: unknown, label: string) {
  const record = requiredRecord(payload, `Placekey ${label} response`);
  return compactObject({
    query_id: requiredString(
      record.query_id,
      "query_id",
      (message) => new ProviderRequestError(502, `Placekey ${label} response ${message}`),
    ),
    placekey: optionalString(record.placekey),
    error: optionalString(record.error),
    address_placekey: optionalString(record.address_placekey),
    building_placekey: optionalString(record.building_placekey),
    confidence_score: optionalString(record.confidence_score),
    normalized_address: optionalRecord(record.normalized_address),
    geocode: parseGeocode(record.geocode, label),
    upi: optionalString(record.upi),
    parcel: optionalString(record.parcel),
    geoid: optionalString(record.geoid),
    gers: optionalString(record.gers),
  });
}

function parseGeocode(payload: unknown, label: string) {
  if (payload == null) {
    return undefined;
  }
  const record = requiredRecord(payload, `Placekey ${label} geocode`);
  const location = requiredRecord(record.location, `Placekey ${label} geocode.location`);
  return {
    location: {
      lat: requiredNumber(location.lat, `${label} geocode.location.lat`),
      lng: requiredNumber(location.lng, `${label} geocode.location.lng`),
    },
    location_type: requiredString(
      record.location_type,
      "location_type",
      (message) => new ProviderRequestError(502, `Placekey ${label} geocode ${message}`),
    ),
  };
}

function requiredNumber(value: unknown, label: string) {
  if (typeof value !== "number") {
    throw new ProviderRequestError(502, `Placekey response is missing ${label}`);
  }
  return value;
}
