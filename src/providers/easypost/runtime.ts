import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { EasypostActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const easypostApiBaseUrl = "https://api.easypost.com/v2";

const easypostDefaultRequestTimeoutMs = 30_000;

type EasypostPhase = "validate" | "execute";
type EasypostContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type EasypostActionHandler = (input: Record<string, unknown>, context: EasypostContext) => Promise<unknown>;

interface EasypostRequest {
  method: "GET" | "POST";
  path: string;
  context: EasypostContext;
  search?: URLSearchParams;
  body?: Record<string, unknown>;
  phase: EasypostPhase;
}

export const easypostActionHandlers: Record<EasypostActionName, EasypostActionHandler> = {
  async create_address(input, context) {
    const payload = await requestEasypost({
      method: "POST",
      path: "/addresses",
      body: buildCreateAddressBody(input),
      context,
      phase: "execute",
    });
    return { address: readObject(payload, "address") };
  },
  async get_address(input, context) {
    const addressId = requiredString(input.address_id, "address_id");
    const payload = await requestEasypost({
      method: "GET",
      path: `/addresses/${encodeURIComponent(addressId)}`,
      context,
      phase: "execute",
    });
    return { address: readObject(payload, "address") };
  },
  async create_tracker(input, context) {
    const payload = await requestEasypost({
      method: "POST",
      path: "/trackers",
      body: { tracker: compactObject(input) },
      context,
      phase: "execute",
    });
    return { tracker: readObject(payload, "tracker") };
  },
  async get_tracker(input, context) {
    const trackerId = requiredString(input.tracker_id, "tracker_id");
    const payload = await requestEasypost({
      method: "GET",
      path: `/trackers/${encodeURIComponent(trackerId)}`,
      context,
      phase: "execute",
    });
    return { tracker: readObject(payload, "tracker") };
  },
  async list_trackers(input, context) {
    const payload = await requestEasypost({
      method: "GET",
      path: "/trackers",
      search: buildListTrackersSearch(input),
      context,
      phase: "execute",
    });
    const response = readObject(payload, "trackers response");
    return {
      trackers: readArray(response.trackers, "trackers"),
      hasMore: response.has_more === true,
      raw: response,
    };
  },
  async list_carrier_types(_input, context) {
    const payload = await requestEasypost({
      method: "GET",
      path: "/carrier_types",
      context,
      phase: "execute",
    });
    return { carrierTypes: readCarrierTypes(payload) };
  },
};

export async function validateEasypostCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestEasypost({
    method: "GET",
    path: "/carrier_types",
    context: { apiKey, fetcher, signal },
    phase: "validate",
  });
  const carrierTypes = readCarrierTypes(payload);
  const firstCarrierType = optionalRecord(carrierTypes[0]);

  return {
    profile: {
      accountId: "api_key",
      displayName: "EasyPost API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: easypostApiBaseUrl,
      validationEndpoint: "/carrier_types",
      carrierTypeCount: carrierTypes.length,
      firstCarrierType: optionalString(firstCarrierType?.type),
    }),
  };
}

async function requestEasypost(request: EasypostRequest): Promise<unknown> {
  const url = new URL(normalizePath(request.path), `${easypostApiBaseUrl}/`);
  if (request.search) {
    for (const [key, value] of request.search) {
      url.searchParams.append(key, value);
    }
  }

  const timeout = createProviderTimeout(request.context.signal, easypostDefaultRequestTimeoutMs);
  try {
    const response = await request.context.fetcher(url.toString(), {
      method: request.method,
      headers: easypostHeaders(request.context.apiKey, request.body !== undefined),
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readEasypostPayload(response);
    if (!response.ok) {
      throw createEasypostError(response, payload, request.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "EasyPost request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `EasyPost request failed: ${error.message}` : "EasyPost request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

function easypostHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readEasypostPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, `EasyPost returned non-JSON response (${response.status})`);
    }
    return text;
  }
}

function createEasypostError(response: Response, payload: unknown, phase: EasypostPhase): ProviderRequestError {
  const message = readEasypostErrorMessage(payload) ?? `EasyPost API request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }

  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status, message, payload);
  }

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function readEasypostErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const object = optionalRecord(payload);
  const error = optionalRecord(object?.error);
  const errors = Array.isArray(error?.errors) ? error.errors : undefined;
  const firstError = optionalRecord(errors?.[0]);
  return (
    optionalString(error?.message) ??
    optionalString(error?.code) ??
    optionalString(firstError?.message) ??
    optionalString(object?.message) ??
    optionalString(object?.error)
  );
}

function buildCreateAddressBody(input: Record<string, unknown>): Record<string, unknown> {
  const { verify, verify_strict, verify_carrier, ...addressInput } = input;
  return compactObject({
    address: compactObject(addressInput),
    verify: verify === true ? true : undefined,
    verify_strict: verify_strict === true ? true : undefined,
    verify_carrier,
  });
}

function buildListTrackersSearch(input: Record<string, unknown>): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (key === "tracking_codes" && Array.isArray(value)) {
      for (const trackingCode of value) {
        search.append("tracking_codes[]", String(trackingCode));
      }
      continue;
    }

    search.set(key, String(value));
  }
  return search;
}

function readCarrierTypes(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => readObject(item, "carrier type"));
  }

  const object = readObject(payload, "carrier types response");
  return readArray(object.carrier_types, "carrier_types");
}

function readArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `EasyPost response field ${fieldName} is not an array`, value);
  }

  return value.map((item) => readObject(item, `${fieldName} item`));
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `EasyPost response field ${fieldName} is not an object`, value);
  }

  return object;
}
