import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  nullableInteger,
  nullableString,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  parseProviderJsonBodyText,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

export const envoyApiBaseUrl = "https://api.envoy.com";

interface EnvoyRequestInput {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  query?: Record<string, unknown>;
  phase: "validate" | "execute";
}

interface EnvoyListPayload {
  data: Record<string, unknown>[];
  meta: Record<string, unknown>;
}

interface EnvoySinglePayload {
  data: Record<string, unknown>;
  meta: Record<string, unknown>;
}

export const envoyActionHandlers: ProviderActionHandlers<"envoy", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async list_locations(input, context) {
    const payload = await requestEnvoyList({
      path: "/rest/v1/locations",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      query: pickQuery(input, [
        "ids",
        "createdAtAfter",
        "createdAtBefore",
        "sort",
        "order",
        "enabled",
        "page",
        "perPage",
      ]),
    });
    return {
      locations: payload.data.map(normalizeLocation),
      meta: payload.meta,
    };
  },

  async get_location(input, context) {
    const payload = await requestEnvoySingle({
      path: `/rest/v1/locations/${encodeURIComponent(String(input.id))}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return {
      location: normalizeLocation(payload.data),
      meta: payload.meta,
    };
  },

  async list_employees(input, context) {
    const payload = await requestEnvoyList({
      path: "/v1/employees",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      query: pickQuery(input, ["ids", "name", "email", "page", "perPage", "sort", "order"]),
    });
    return {
      employees: payload.data.map(normalizeEmployee),
      meta: payload.meta,
    };
  },

  async get_employee(input, context) {
    const payload = await requestEnvoySingle({
      path: `/v1/employees/${encodeURIComponent(String(input.id))}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return {
      employee: normalizeEmployee(payload.data),
      meta: payload.meta,
    };
  },

  async list_flows(input, context) {
    const payload = await requestEnvoyList({
      path: "/v1/flows",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      query: pickQuery(input, ["ids", "enabled", "name", "locationIds", "type", "page", "perPage", "sort", "order"]),
    });
    return {
      flows: payload.data.map(normalizeFlow),
      meta: payload.meta,
    };
  },

  async get_flow(input, context) {
    const payload = await requestEnvoySingle({
      path: `/v1/flows/${encodeURIComponent(String(input.id))}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return {
      flow: normalizeFlow(payload.data),
      meta: payload.meta,
    };
  },

  async list_invites(input, context) {
    const payload = await requestEnvoyList({
      path: "/v1/invites",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      query: pickQuery(input, [
        "ids",
        "locationIds",
        "expectedArrivalAtBefore",
        "expectedArrivalAtAfter",
        "hostEmail",
        "inviteeEmail",
        "type",
        "approvalStatus",
        "page",
        "perPage",
        "sort",
        "order",
      ]),
    });
    return {
      invites: payload.data.map(normalizeInvite),
      meta: payload.meta,
    };
  },

  async get_invite(input, context) {
    const payload = await requestEnvoySingle({
      path: `/v1/invites/${encodeURIComponent(String(input.id))}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return {
      invite: normalizeInvite(payload.data),
      meta: payload.meta,
    };
  },
};

export async function validateEnvoyCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestEnvoyList({
    path: "/v1/employees",
    apiKey,
    fetcher,
    signal,
    phase: "validate",
    query: {
      page: 1,
      perPage: 1,
    },
  });
  return {
    profile: {
      displayName: "Envoy Client API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: envoyApiBaseUrl,
      validationEndpoint: "/v1/employees",
    }),
  };
}

async function requestEnvoyList(input: EnvoyRequestInput): Promise<EnvoyListPayload> {
  const payload = await requestEnvoy(input);
  const data = payload.data;
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, "Envoy response data was not an array");
  }
  return {
    data: data.map((item) => requiredRecord(item, "Envoy response data item", providerResponseError)),
    meta: optionalRecord(payload.meta) ?? {},
  };
}

async function requestEnvoySingle(input: EnvoyRequestInput): Promise<EnvoySinglePayload> {
  const payload = await requestEnvoy(input);
  return {
    data: requiredRecord(payload.data, "Envoy response data", providerResponseError),
    meta: optionalRecord(payload.meta) ?? {},
  };
}

async function requestEnvoy(input: EnvoyRequestInput): Promise<Record<string, unknown>> {
  const url = new URL(`${envoyApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryValue(url, key, value);
  }

  let response: Response;
  let rawBody: string;
  input.signal?.throwIfAborted();
  const timeout = createProviderTimeout(input.signal);
  try {
    response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.apiKey,
      },
      signal: timeout.signal,
    });
    rawBody = await readProviderTextBody(response, "Envoy response");
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Envoy request timed out", error);
    }
    if (isAbortSignalError(input.signal, error)) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Envoy request failed: ${error.message}` : "Envoy request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = parseJsonBody(rawBody, response.status);
  if (!response.ok) {
    throw mapEnvoyHttpError(response.status, payload, rawBody, input.phase);
  }
  return requiredRecord(payload, "Envoy response object", providerResponseError);
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value == null || value === "") {
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 0) {
      url.searchParams.set(key, value.map((item) => String(item)).join(","));
    }
    return;
  }
  url.searchParams.set(key, String(value));
}

function pickQuery(input: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  for (const key of keys) {
    query[key] = input[key];
  }
  return query;
}

function normalizeLocation(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredString(input.id, "Envoy location id", providerResponseError),
    name: requiredString(input.name, "Envoy location name", providerResponseError),
    enabled: typeof input.enabled === "boolean" ? input.enabled : undefined,
    companyId: optionalString(input.companyId),
    locale: optionalString(input.locale),
    timezone: nullableString(input.timezone),
    logoUrl: nullableString(input.logoUrl),
    capacityLimit: nullableInteger(input.capacityLimit),
    address: optionalRecord(input.address),
    createdAt: optionalString(input.createdAt),
    updatedAt: optionalString(input.updatedAt),
  };
}

function normalizeEmployee(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredString(input.id, "Envoy employee id", providerResponseError),
    name: requiredString(input.name, "Envoy employee name", providerResponseError),
    email: requiredString(input.email, "Envoy employee email", providerResponseError),
    createdAt: optionalString(input.createdAt),
    updatedAt: optionalString(input.updatedAt),
  };
}

function normalizeFlow(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredString(input.id, "Envoy flow id", providerResponseError),
    name: requiredString(input.name, "Envoy flow name", providerResponseError),
    type: optionalString(input.type),
    enabled: typeof input.enabled === "boolean" ? input.enabled : undefined,
    locationId: nullableString(input.locationId),
    createdAt: optionalString(input.createdAt),
    updatedAt: optionalString(input.updatedAt),
  };
}

function normalizeInvite(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredString(input.id, "Envoy invite id", providerResponseError),
    expectedArrivalAt: optionalString(input.expectedArrivalAt),
    expectedDepartureAt: nullableString(input.expectedDepartureAt),
    type: optionalString(input.type),
    approvalStatus: nullableString(input.approvalStatus),
    flowId: nullableString(input.flowId),
    locationId: nullableString(input.locationId),
    notes: nullableString(input.notes),
    invitee: optionalRecord(input.invitee),
    host: optionalRecord(input.host),
    photoUrl: nullableString(input.photoUrl),
    createdAt: optionalString(input.createdAt),
    updatedAt: optionalString(input.updatedAt),
  };
}

function parseJsonBody(rawBody: string, status: number): unknown {
  return parseProviderJsonBodyText(rawBody, {
    emptyBody: {},
    invalidJsonMessage: "Envoy request failed with invalid JSON response",
    invalidJsonFallback:
      status >= 400
        ? (text) => text
        : (_text, error) => {
            throw new ProviderRequestError(
              502,
              `Envoy request failed with invalid JSON response: ${error instanceof Error ? error.message : String(error)}`,
            );
          },
    trimEmptyBody: false,
  });
}

function mapEnvoyHttpError(
  status: number,
  payload: unknown,
  rawBody: string,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = readEnvoyErrorMessage(payload) ?? `Envoy request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  const bodySnippet = rawBody.trim().slice(0, 200);
  return new ProviderRequestError(502, bodySnippet ? `${message}; body: ${bodySnippet}` : message, payload);
}

function readEnvoyErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  for (const key of ["message", "error", "detail", "title"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}
