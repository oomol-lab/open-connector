import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import { objectArray, optionalInteger, optionalRecord, optionalString, recordOrEmpty } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const streamEstateApiBaseUrl = "https://api.stream.estate";

type StreamEstateRequestPhase = "validate" | "execute";

interface StreamEstateRequestOptions {
  query?: Record<string, unknown>;
}

type StreamEstateActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const streamEstateActionHandlers: ProviderActionHandlers<"stream_estate", StreamEstateActionHandler> = {
  async list_properties(input, context) {
    const payload = await getStreamEstateJson(
      "/documents/properties",
      {
        query: {
          ...readAdditionalQuery(input.additionalQuery),
          "propertyTypes[]": input.propertyTypes,
          transactionType: input.transactionType,
          "includedCities[]": input.includedCities,
          "includedDepartments[]": input.includedDepartments,
          budgetMin: input.budgetMin,
          budgetMax: input.budgetMax,
          surfaceMin: input.surfaceMin,
          surfaceMax: input.surfaceMax,
          fromDate: input.fromDate,
          withCoherentPrice: input.withCoherentPrice,
          itemsPerPage: input.itemsPerPage,
          page: input.page,
          "order[createdAt]": input.orderCreatedAt,
          "order[updatedAt]": input.orderUpdatedAt,
          "order[price]": input.orderPrice,
        },
      },
      context,
      "execute",
    );
    return normalizeCollection(payload, "property collection");
  },
  async get_property(input, context) {
    const propertyId = encodePathSegment(input.propertyId, "propertyId");
    const payload = await getStreamEstateJson(`/documents/properties/${propertyId}`, {}, context, "execute");
    return {
      property: requiredResponseRecord(payload, "Stream Estate property response"),
    };
  },
  async list_similar_properties(input, context) {
    const propertyId = encodePathSegment(input.propertyId, "propertyId");
    const payload = await getStreamEstateJson(
      `/documents/properties/${propertyId}/similar-properties`,
      {
        query: {
          fromDate: input.fromDate,
          itemsPerPage: input.itemsPerPage,
          page: input.page,
          "order[createdAt]": input.orderCreatedAt,
          "order[updatedAt]": input.orderUpdatedAt,
          "order[pricePerMeter]": input.orderPricePerMeter,
          "order[price]": input.orderPrice,
          "order[surface]": input.orderSurface,
        },
      },
      context,
      "execute",
    );
    return normalizeCollection(payload, "similar property collection");
  },
  async search_locations(input, context) {
    const payload = await getStreamEstateJson(
      "/public/location-autocomplete",
      {
        query: {
          query: input.query,
          "excludedCitiesIds[]": input.excludedCityIds,
          "excludedDepartmentsIds[]": input.excludedDepartmentIds,
        },
      },
      context,
      "execute",
    );
    return normalizeCollection(payload, "location collection");
  },
  async list_cities(input, context) {
    const payload = await getStreamEstateJson(
      "/cities",
      {
        query: {
          ...readAdditionalQuery(input.additionalQuery),
          excludeGroupedCities: input.excludeGroupedCities,
          "insee[]": input.insee,
          libelle: input.libelle,
          name: input.name,
          "order[name]": input.orderName,
          page: input.page,
          slug: input.slug,
          "zipcode[]": input.zipcode,
        },
      },
      context,
      "execute",
    );
    return normalizeCollection(payload, "city collection");
  },
};

export async function validateStreamEstateCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await getStreamEstateJson("/cities", { query: { page: 1 } }, { apiKey, fetcher, signal }, "validate");
  normalizeCollection(payload, "city collection");

  return {
    profile: { displayName: "Stream Estate API Key" },
    metadata: {
      apiBaseUrl: streamEstateApiBaseUrl,
      validationEndpoint: "/cities",
    },
  };
}

async function getStreamEstateJson(
  path: string,
  options: StreamEstateRequestOptions,
  context: ApiKeyProviderContext,
  phase: StreamEstateRequestPhase,
) {
  const url = new URL(path, streamEstateApiBaseUrl);
  appendQuery(url.searchParams, options.query ?? {});

  return runProviderRequest({ label: "Stream Estate", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
      },
      signal,
    });
    const payload = await readStreamEstatePayload(response);
    if (!response.ok) {
      throw createStreamEstateError(response.status, payload, phase, context.apiKey);
    }
    return payload;
  });
}

function appendQuery(searchParams: URLSearchParams, query: Record<string, unknown>) {
  for (const [key, value] of Object.entries(query)) {
    if (value == null) {
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

function readAdditionalQuery(value: unknown) {
  return optionalRecord(value) ?? {};
}

async function readStreamEstatePayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Stream Estate returned invalid JSON");
    }
    return { message: text };
  }
}

function createStreamEstateError(status: number, payload: unknown, phase: StreamEstateRequestPhase, apiKey: string) {
  const upstreamMessage = extractErrorMessage(payload) ?? `request failed with status ${status}`;
  const message = `Stream Estate API error: ${upstreamMessage.replaceAll(apiKey, "[REDACTED]")}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 401) {
    return phase === "validate" ? new ProviderRequestError(400, message) : new ProviderRequestError(401, message);
  }
  if (status === 400 || status === 404 || status === 405) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function extractErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return (
    optionalString(record?.["hydra:description"]) ??
    optionalString(record?.detail) ??
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.title)
  );
}

function normalizeCollection(payload: unknown, label: string) {
  const collection = requiredResponseRecord(payload, `Stream Estate ${label} response`);
  return {
    items: objectArray(
      collection["hydra:member"],
      `Stream Estate ${label} response hydra:member`,
      providerResponseError,
    ),
    totalItems: optionalInteger(collection["hydra:totalItems"]) ?? null,
    pagination: recordOrEmpty(collection["hydra:view"]),
  };
}

function encodePathSegment(value: unknown, fieldName: string) {
  return encodeURIComponent(requiredInputString(value, fieldName));
}
