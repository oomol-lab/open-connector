import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BuildiumActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const buildiumApiBaseUrl: string = "https://api.buildium.com";
const rentalsPath = "/v1/rentals";
const buildiumDefaultRequestTimeoutMs = 30_000;

type RequestPhase = "validate" | "execute";
type BuildiumActionHandler = ProviderRuntimeHandler<BuildiumActionContext>;

export interface BuildiumActionContext {
  clientId: string;
  clientSecret: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const buildiumActionHandlers: Record<BuildiumActionName, BuildiumActionHandler> = {
  async list_properties(input, context) {
    const payload = await buildiumRequestJson({
      path: rentalsPath,
      context,
      phase: "execute",
      searchParams: buildSearchParams(input, {
        orderBy: "orderby",
        propertyIds: "propertyids",
      }),
    });
    return normalizeList(payload);
  },
  async get_property(input, context) {
    const propertyId = readPositiveInteger(input.propertyId, "propertyId");
    const payload = await buildiumRequestJson({
      path: `${rentalsPath}/${propertyId}`,
      context,
      phase: "execute",
    });
    return { property: normalizeResource(payload) };
  },
  async list_units(input, context) {
    const payload = await buildiumRequestJson({
      path: `${rentalsPath}/units`,
      context,
      phase: "execute",
      searchParams: buildSearchParams(input, {
        orderBy: "orderby",
        propertyIds: "propertyids",
        unitIds: "unitids",
      }),
    });
    return normalizeList(payload);
  },
  async get_unit(input, context) {
    const unitId = readPositiveInteger(input.unitId, "unitId");
    const payload = await buildiumRequestJson({
      path: `${rentalsPath}/units/${unitId}`,
      context,
      phase: "execute",
    });
    return { unit: normalizeResource(payload) };
  },
  async list_owners(input, context) {
    const payload = await buildiumRequestJson({
      path: `${rentalsPath}/owners`,
      context,
      phase: "execute",
      searchParams: buildSearchParams(input, {
        orderBy: "orderby",
        rentalOwnerIds: "rentalownerids",
      }),
    });
    return normalizeList(payload);
  },
  async get_owner(input, context) {
    const rentalOwnerId = readPositiveInteger(input.rentalOwnerId, "rentalOwnerId");
    const payload = await buildiumRequestJson({
      path: `${rentalsPath}/owners/${rentalOwnerId}`,
      context,
      phase: "execute",
    });
    return { owner: normalizeResource(payload) };
  },
  async list_property_notes(input, context) {
    const propertyId = readPositiveInteger(input.propertyId, "propertyId");
    const payload = await buildiumRequestJson({
      path: `${rentalsPath}/${propertyId}/notes`,
      context,
      phase: "execute",
      searchParams: buildSearchParams(input, {
        updatedDateTimeFrom: "updateddatetimefrom",
        updatedDateTimeTo: "updateddatetimeto",
        lastUpdatedByUserId: "lastupdatedbyuserid",
        orderBy: "orderby",
      }),
    });
    return normalizeList(payload);
  },
};

export async function validateBuildiumCredential(input: BuildiumActionContext): Promise<CredentialValidationResult> {
  await buildiumRequestJson({
    path: rentalsPath,
    context: input,
    phase: "validate",
    searchParams: new URLSearchParams([["limit", "1"]]),
  });

  return {
    profile: {
      accountId: input.clientId,
      displayName: "Buildium API Key",
    },
    grantedScopes: [],
    metadata: {
      clientId: input.clientId,
      apiBaseUrl: buildiumApiBaseUrl,
      validationEndpoint: rentalsPath,
    },
  };
}

async function buildiumRequestJson(input: {
  path: string;
  context: BuildiumActionContext;
  phase: RequestPhase;
  searchParams?: URLSearchParams;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, buildiumDefaultRequestTimeoutMs);
  const url = new URL(input.path, buildiumApiBaseUrl);
  for (const [key, value] of input.searchParams ?? []) {
    url.searchParams.set(key, value);
  }

  try {
    const response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-buildium-client-id": input.context.clientId,
        "x-buildium-client-secret": input.context.clientSecret,
      },
      signal: timeout.signal,
    });
    const payload = await readBuildiumPayload(response);
    if (!response.ok) {
      throw createBuildiumError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Buildium request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Buildium request failed: ${error.message}` : "Buildium request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readBuildiumPayload(response: Response): Promise<unknown> {
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

function createBuildiumError(status: number, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? "Buildium request failed";

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message, payload);
  }
  if ([400, 404, 415, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record =
    typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  return (
    optionalString(record.Message) ??
    optionalString(record.message) ??
    optionalString(record.Detail) ??
    optionalString(record.detail) ??
    optionalString(record.Error) ??
    optionalString(record.error)
  );
}

function buildSearchParams(input: Record<string, unknown>, fieldMap: Record<string, string>): URLSearchParams {
  const searchParams = new URLSearchParams();
  for (const [inputKey, queryKey] of Object.entries({
    limit: "limit",
    offset: "offset",
    ...fieldMap,
  })) {
    const value = input[inputKey];
    if (value == null) {
      continue;
    }

    if (Array.isArray(value)) {
      searchParams.set(queryKey, value.join(","));
      continue;
    }

    searchParams.set(queryKey, String(value));
  }
  return searchParams;
}

function normalizeList(payload: unknown): { count: number; items: Array<Record<string, unknown>> } {
  if (Array.isArray(payload)) {
    const items = payload.map((item) => normalizeResource(item));
    return {
      count: items.length,
      items,
    };
  }

  const record = requiredRecord(payload, "Buildium list response", providerOutputError);
  const rawItems = Array.isArray(record.Items) ? record.Items : Array.isArray(record.items) ? record.items : [];
  const items = rawItems.map((item) => normalizeResource(item));
  return {
    count: optionalInteger(record.Count) ?? optionalInteger(record.count) ?? items.length,
    items,
  };
}

function normalizeResource(payload: unknown): Record<string, unknown> {
  const record = requiredRecord(payload, "Buildium resource response", providerOutputError);
  return compactObject({ ...record }) as Record<string, unknown>;
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return value;
}

function providerOutputError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
