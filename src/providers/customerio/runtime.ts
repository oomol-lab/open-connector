import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const customerioTrackApiBaseUrl = "https://track.customer.io";
export const customerioTrackEuApiBaseUrl = "https://track-eu.customer.io";

const customerioDefaultRequestTimeoutMs = 30_000;

type CustomerioPhase = "validate" | "execute";

export interface CustomerioCredentialContext {
  siteId: string;
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type CustomerioActionHandler = (
  input: Record<string, unknown>,
  context: CustomerioCredentialContext,
) => Promise<unknown>;

export const customerioActionHandlers: ProviderActionHandlers<"customerio", CustomerioActionHandler> = {
  identify_customer(input, context) {
    return customerioRequest({
      context,
      method: "PUT",
      path: `/api/v1/customers/${encodeURIComponent(requireNonEmptyString(input.identifier, "identifier"))}`,
      body: requiredRecord(input.attributes, "attributes", providerInputError),
      phase: "execute",
    });
  },
  track_customer_event(input, context) {
    const type = optionalString(input.type);
    const anonymousId = optionalString(input.anonymousId);
    if (type === "screen" && !anonymousId) {
      throw new ProviderRequestError(400, "anonymousId is required when type is screen.");
    }
    return customerioRequest({
      context,
      method: "POST",
      path: `/api/v1/customers/${encodeURIComponent(requireNonEmptyString(input.identifier, "identifier"))}/events`,
      body: compactObject({
        anonymous_id: anonymousId,
        name: requireNonEmptyString(input.name, "name"),
        type,
        id: optionalString(input.eventId),
        timestamp: optionalInteger(input.timestamp),
        data: optionalRecord(input.data),
      }),
      phase: "execute",
    });
  },
  track_anonymous_event(input, context) {
    return customerioRequest({
      context,
      method: "POST",
      path: "/api/v1/events",
      body: compactObject({
        anonymous_id: requireNonEmptyString(input.anonymousId, "anonymousId"),
        name: requireNonEmptyString(input.name, "name"),
        type: optionalString(input.type),
        id: optionalString(input.eventId),
        timestamp: optionalInteger(input.timestamp),
        data: optionalRecord(input.data),
      }),
      phase: "execute",
    });
  },
  delete_customer(input, context) {
    return customerioRequest({
      context,
      method: "DELETE",
      path: `/api/v1/customers/${encodeURIComponent(requireNonEmptyString(input.identifier, "identifier"))}`,
      phase: "execute",
    });
  },
  suppress_customer(input, context) {
    return customerioRequest({
      context,
      method: "POST",
      path: `/api/v1/customers/${encodeURIComponent(requireNonEmptyString(input.identifier, "identifier"))}/suppress`,
      phase: "execute",
    });
  },
  unsuppress_customer(input, context) {
    return customerioRequest({
      context,
      method: "POST",
      path: `/api/v1/customers/${encodeURIComponent(requireNonEmptyString(input.identifier, "identifier"))}/unsuppress`,
      phase: "execute",
    });
  },
  merge_customers(input, context) {
    return customerioRequest({
      context,
      method: "POST",
      path: "/api/v1/merge_customers",
      body: {
        primary: readPersonReference(input.primary, "primary"),
        secondary: readPersonReference(input.secondary, "secondary"),
      },
      phase: "execute",
    });
  },
};

export async function validateCustomerioCredential(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = resolveCustomerioCredentialContext(values, fetcher, signal);
  const payload = await customerioRequest({
    context,
    method: "GET",
    path: "/api/v1/accounts/region",
    baseUrl: customerioTrackApiBaseUrl,
    phase: "validate",
    parseResponse: true,
  });
  const record = requiredRecord(payload, "region response", providerResponseError);
  const region = normalizeRegion(optionalString(record.region), optionalString(record.url));
  const apiBaseUrl = normalizeApiBaseUrl(optionalString(record.url), region);
  const environmentId = optionalInteger(record.environment_id);

  return {
    profile: {
      accountId: environmentId === undefined ? `${region}:${context.siteId}` : String(environmentId),
      displayName:
        environmentId === undefined
          ? `Customer.io Track API (${region})`
          : `Customer.io environment ${environmentId} (${region})`,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl,
      region,
      environmentId,
    }),
  };
}

export function resolveCustomerioCredentialContext(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
  metadata: Record<string, unknown> = {},
): CustomerioCredentialContext {
  return {
    siteId: requiredString(values.siteId, "siteId", providerInputError),
    apiKey: requiredString(values.apiKey, "apiKey", providerInputError),
    apiBaseUrl: normalizeApiBaseUrl(optionalString(metadata.apiBaseUrl), optionalString(metadata.region)),
    fetcher,
    signal,
  };
}

async function customerioRequest(input: {
  context: CustomerioCredentialContext;
  method: string;
  path: string;
  body?: Record<string, unknown>;
  baseUrl?: string;
  phase: CustomerioPhase;
  parseResponse?: boolean;
}): Promise<unknown> {
  const timeoutHandle = createProviderTimeout(input.context.signal, customerioDefaultRequestTimeoutMs);
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: buildCustomerioAuthorization(input.context.siteId, input.context.apiKey),
    "user-agent": providerUserAgent,
  };
  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  try {
    const response = await input.context.fetcher(new URL(input.path, input.baseUrl ?? input.context.apiBaseUrl), {
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeoutHandle.signal,
    });
    const payload = await readCustomerioPayload(response);

    if (!response.ok) {
      throw createCustomerioError(response.status, payload, input.phase);
    }

    if (input.parseResponse) {
      return payload;
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Customer.io request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Customer.io request failed: ${error.message}` : "Customer.io request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

async function readCustomerioPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Customer.io returned invalid JSON");
  }
}

function createCustomerioError(status: number, payload: unknown, phase: CustomerioPhase): ProviderRequestError {
  const message = extractCustomerioErrorMessage(payload) ?? `Customer.io request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractCustomerioErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const error = optionalString(record.error) ?? optionalString(record.message);
  if (error) {
    return error;
  }
  const meta = optionalRecord(record.meta);
  return optionalString(meta?.error);
}

function normalizeApiBaseUrl(value: string | undefined, region: string | undefined): string {
  if (value === customerioTrackEuApiBaseUrl) {
    return customerioTrackEuApiBaseUrl;
  }
  if (region === "eu") {
    return customerioTrackEuApiBaseUrl;
  }
  return customerioTrackApiBaseUrl;
}

function normalizeRegion(value: string | undefined, apiBaseUrl: string | undefined): string {
  if (value === "eu" || apiBaseUrl === customerioTrackEuApiBaseUrl) {
    return "eu";
  }
  return "us";
}

function buildCustomerioAuthorization(siteId: string, apiKey: string): string {
  return `Basic ${Buffer.from(`${siteId}:${apiKey}`).toString("base64")}`;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, providerInputError);
}

function readPersonReference(value: unknown, fieldName: string): Record<string, unknown> {
  const record = requiredRecord(value, fieldName, providerInputError);
  const presentCount = ["id", "email", "cio_id"].filter((key) => optionalString(record[key]) !== undefined).length;
  if (presentCount !== 1) {
    throw new ProviderRequestError(400, "Exactly one of id, email, or cio_id is required.");
  }
  return record;
}
