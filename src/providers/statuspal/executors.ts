import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { StatuspalActionName } from "./actions.ts";

import { objectArray, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "statuspal";
const statuspalApiOrigin = "https://statuspal.io";
const statuspalApiPrefix = "/api/v2";
const statuspalValidationPath = "/hello";

type StatuspalActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const statuspalActionHandlers: Record<StatuspalActionName, StatuspalActionHandler> = {
  get_status_page_status(input, context) {
    return normalizeStatusPageStatus(
      statuspalGetJson(`/status_pages/${readPathSegment(input.subdomain, "subdomain")}/status`, {
        ...context,
        apiKey: undefined,
      }),
    );
  },
  get_status_page_summary(input, context) {
    return normalizeStatusPageSummary(
      statuspalGetJson(`/status_pages/${readPathSegment(input.subdomain, "subdomain")}/summary`, {
        ...context,
        apiKey: undefined,
      }),
    );
  },
  list_services(input, context) {
    return normalizeListOutput(
      "services",
      statuspalGetJson(`/status_pages/${readPathSegment(input.subdomain, "subdomain")}/services`, context),
      normalizeService,
    );
  },
  get_service(input, context) {
    return normalizeSingleOutput(
      "service",
      statuspalGetJson(
        `/status_pages/${readPathSegment(input.subdomain, "subdomain")}/services/${readIntegerPathSegment(input.serviceId, "serviceId")}`,
        context,
      ),
      normalizeService,
    );
  },
  list_incidents(input, context) {
    return normalizeListOutput(
      "incidents",
      statuspalGetJson(
        `/status_pages/${readPathSegment(input.subdomain, "subdomain")}/incidents`,
        {
          ...context,
          apiKey: undefined,
        },
        {
          before: input.before,
          after: input.after,
          limit: input.limit,
          type: input.type,
        },
      ),
      normalizeIncident,
    );
  },
  get_incident(input, context) {
    return normalizeSingleOutput(
      "incident",
      statuspalGetJson(
        `/status_pages/${readPathSegment(input.subdomain, "subdomain")}/incidents/${readIntegerPathSegment(input.incidentId, "incidentId")}`,
        {
          ...context,
          apiKey: undefined,
        },
      ),
      normalizeIncident,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, statuspalActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: `${statuspalApiOrigin}${statuspalApiPrefix}`,
  auth: { type: "api_key_authorization", prefix: "" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await statuspalGetJson(statuspalValidationPath, {
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
    return {
      profile: {
        accountId: "statuspal:api-key",
        displayName: "StatusPal API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: `${statuspalApiOrigin}${statuspalApiPrefix}`,
        validationEndpoint: statuspalValidationPath,
      },
    };
  },
};

async function statuspalGetJson(
  path: string,
  context: { apiKey?: string; fetcher: typeof fetch; signal?: AbortSignal },
  query?: Record<string, unknown>,
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(buildStatuspalUrl(path, query), {
      method: "GET",
      headers: statuspalHeaders(context.apiKey),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `StatusPal request failed: ${error.message}` : "StatusPal request failed",
    );
  }
  const payload = await readStatuspalPayload(response);
  if (!response.ok) {
    throw createStatuspalError(response, payload);
  }
  return payload;
}

function buildStatuspalUrl(path: string, query?: Record<string, unknown>): string {
  const url = new URL(`${statuspalApiPrefix}${path}`, statuspalApiOrigin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function statuspalHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (apiKey) {
    headers.Authorization = apiKey;
  }
  return headers;
}

async function readStatuspalPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createStatuspalError(response: Response, payload: unknown): ProviderRequestError {
  return new ProviderRequestError(
    response.status,
    extractStatuspalErrorMessage(payload) ?? `StatusPal request failed with HTTP ${response.status}`,
    payload,
  );
}

function extractStatuspalErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload;
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  for (const key of ["error", "message", "detail"]) {
    const message = optionalString(object[key]);
    if (message) {
      return message;
    }
  }
  const errors = object.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    return errors.map(String).join(", ");
  }
  if (errors && typeof errors === "object") {
    return Object.entries(errors as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
      .join("; ");
  }
  return undefined;
}

function normalizeStatusPageStatus(payloadPromise: Promise<unknown>): Promise<unknown> {
  return payloadPromise.then((payload) => {
    const raw = readRequiredObject(payload, "status response");
    const statusPage = readRequiredObject(raw.status_page ?? raw.statusPage ?? raw, "status page");
    return {
      statusPage: normalizeStatusPage(statusPage),
      raw,
    };
  });
}

function normalizeStatusPageSummary(payloadPromise: Promise<unknown>): Promise<unknown> {
  return payloadPromise.then((payload) => {
    const raw = readRequiredObject(payload, "summary response");
    const statusPage = readRequiredObject(raw.status_page ?? raw.statusPage ?? raw, "status page");
    return {
      statusPage: normalizeStatusPage(statusPage),
      services: objectArray(raw.services, "services", providerError).map(normalizeService),
      incidents: objectArray(raw.incidents, "incidents", providerError).map(normalizeIncident),
      maintenances: objectArray(raw.maintenances, "maintenances", providerError).map(normalizeIncident),
      upcomingMaintenances: objectArray(
        raw.upcoming_maintenances ?? raw.upcomingMaintenances,
        "upcoming_maintenances",
        providerError,
      ).map(normalizeIncident),
      infoNotices: objectArray(raw.info_notices ?? raw.infoNotices, "info_notices", providerError),
      currentStatusType: optionalString(raw.current_status_type ?? raw.currentStatusType) ?? null,
      raw,
    };
  });
}

function normalizeListOutput(
  key: string,
  payloadPromise: Promise<unknown>,
  normalize: (item: Record<string, unknown>) => Record<string, unknown>,
): Promise<unknown> {
  return payloadPromise.then((payload) => {
    const raw = Array.isArray(payload)
      ? objectArray(payload, key, providerError)
      : objectArray(readRequiredObject(payload, `${key} response`)[key], key, providerError);
    return {
      [key]: raw.map(normalize),
      raw,
    };
  });
}

function normalizeSingleOutput(
  key: string,
  payloadPromise: Promise<unknown>,
  normalize: (item: Record<string, unknown>) => Record<string, unknown>,
): Promise<unknown> {
  return payloadPromise.then((payload) => {
    const raw = readRequiredObject(payload, `${key} response`);
    return {
      [key]: normalize(raw),
      raw,
    };
  });
}

function normalizeStatusPage(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    current_incident_type: raw.current_incident_type ?? null,
  };
}

function normalizeService(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    current_incident_type: raw.current_incident_type ?? null,
    children: Array.isArray(raw.children) ? raw.children : [],
  };
}

function normalizeIncident(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    ends_at: raw.ends_at ?? null,
    service_ids: Array.isArray(raw.service_ids) ? raw.service_ids : [],
  };
}

function readPathSegment(value: unknown, fieldName: string): string {
  return encodeURIComponent(requiredString(value, fieldName, invalidInputError));
}

function readIntegerPathSegment(value: unknown, fieldName: string): string {
  const integer = optionalInteger(value);
  if (integer === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return encodeURIComponent(String(integer));
}

function readRequiredObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `StatusPal response is missing ${label}`, value);
  }
  return object;
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
