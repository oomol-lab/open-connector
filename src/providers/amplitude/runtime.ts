import type { CredentialValidationResult } from "../../core/types.ts";
import type { AmplitudeActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalInteger, optionalRecord, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerFetch,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const amplitudeApiBaseUrl = "https://amplitude.com";
export const amplitudeEuApiBaseUrl = "https://analytics.eu.amplitude.com";

const amplitudeValidationPath = "/api/2/events/list";
const amplitudeDefaultTimeoutMs = 30_000;

export interface AmplitudeActionContext {
  apiKeyId: string;
  secretKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface AmplitudeRequestInput extends AmplitudeActionContext {
  path: string;
  query?: AmplitudeQuery;
  phase: "validate" | "execute";
}

interface AmplitudeActionHandler {
  (input: Record<string, unknown>, context: AmplitudeActionContext): Promise<unknown>;
}

interface AmplitudeQuery {
  [key: string]: string | number | undefined;
}

export const amplitudeActionHandlers: Record<AmplitudeActionName, AmplitudeActionHandler> = {
  async list_events(_input, context) {
    const payload = await requestAmplitudeJson({
      ...resolveAmplitudeActionContext(_input, context),
      phase: "execute",
      path: amplitudeValidationPath,
    });
    return normalizeListEventsResponse(payload);
  },
  async get_event_segmentation(input, context) {
    const payload = await requestAmplitudeJson({
      ...resolveAmplitudeActionContext(input, context),
      phase: "execute",
      path: "/api/2/events/segmentation",
      query: buildEventSegmentationQuery(input),
    });
    const record = requireRecord(payload, "Amplitude event segmentation response");
    return {
      result: optionalRecord(record.data) ?? {},
      raw: payload,
    };
  },
  async search_user(input, context) {
    const payload = await requestAmplitudeJson({
      ...resolveAmplitudeActionContext(input, context),
      phase: "execute",
      path: "/api/2/usersearch",
      query: {
        user: requireNonEmptyString(input.user, "user"),
      },
    });
    const record = requireRecord(payload, "Amplitude user search response");
    return {
      matches: requireArray(record.matches, "Amplitude user search matches"),
      type: readOptionalString(record.type),
      raw: payload,
    };
  },
  async get_user_activity(input, context) {
    const payload = await requestAmplitudeJson({
      ...resolveAmplitudeActionContext(input, context),
      phase: "execute",
      path: "/api/2/useractivity",
      query: buildUserActivityQuery(input),
    });
    const record = requireRecord(payload, "Amplitude user activity response");
    return {
      userData: optionalRecord(record.userData) ?? {},
      events: Array.isArray(record.events) ? record.events : [],
      raw: payload,
    };
  },
};

export async function validateAmplitudeCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch = providerFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const secretKey = requireAmplitudeSecretKey(input.apiKey);
  const apiKeyId = requireAmplitudeApiKeyId(input.values);
  const dataResidency = normalizeDataResidency(input.values.dataResidency);
  const apiBaseUrl = resolveAmplitudeApiBaseUrl(dataResidency);
  const payload = await requestAmplitudeJson({
    apiKeyId,
    secretKey,
    baseUrl: apiBaseUrl,
    fetcher,
    signal,
    path: amplitudeValidationPath,
    phase: "validate",
  });
  const record = requireRecord(payload, "Amplitude events list response");
  const events = Array.isArray(record.data) ? record.data : [];

  return {
    profile: {
      accountId: apiKeyId,
      displayName: `Amplitude Project ${apiKeyId}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl,
      dataResidency,
      validationEndpoint: amplitudeValidationPath,
      apiKeyId,
      visibleEventCount: events.length,
    }),
  };
}

function buildEventSegmentationQuery(input: Record<string, unknown>): AmplitudeQuery {
  return compactObject({
    e: JSON.stringify(input.event),
    e2: input.secondEvent ? JSON.stringify(input.secondEvent) : undefined,
    start: requireNonEmptyString(input.start, "start"),
    end: requireNonEmptyString(input.end, "end"),
    m: readOptionalString(input.metric),
    n: readOptionalString(input.userType),
    i: readOptionalInteger(input.interval),
    s: input.segments ? JSON.stringify(input.segments) : undefined,
    g: readOptionalString(input.groupBy),
    g2: readOptionalString(input.secondGroupBy),
    limit: readOptionalInteger(input.limit),
    formula: readOptionalString(input.formula),
    rollingWindow: readOptionalInteger(input.rollingWindow),
    rollingAverage: readOptionalInteger(input.rollingAverage),
  });
}

function buildUserActivityQuery(input: Record<string, unknown>): AmplitudeQuery {
  return compactObject({
    user: requireNonEmptyString(input.user, "user"),
    offset: readOptionalInteger(input.offset),
    limit: readOptionalInteger(input.limit),
    direction: readOptionalString(input.direction),
  });
}

async function requestAmplitudeJson(input: AmplitudeRequestInput) {
  const url = new URL(input.path, `${input.baseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(input.signal, amplitudeDefaultTimeoutMs);
  let response: Response;
  try {
    response = await input.fetcher(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: buildAmplitudeBasicAuthorizationHeader(input.apiKeyId, input.secretKey),
        "User-Agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Amplitude request timed out");
    }
    throw error;
  } finally {
    timeout.cleanup();
  }

  let text = await response.text();
  let payload = parseJsonResponse(text);
  if (!response.ok) {
    throw mapAmplitudeError(response.status, payload, input.phase);
  }
  return payload;
}

function normalizeListEventsResponse(payload: unknown) {
  const record = requireRecord(payload, "Amplitude events list response");
  return {
    events: requireArray(record.data, "Amplitude events list data"),
    raw: payload,
  };
}

function requireAmplitudeApiKeyId(input: Record<string, string>) {
  let apiKeyId = input.apiKeyId;
  if (!apiKeyId) {
    throw new ProviderRequestError(400, "apiKeyId is required");
  }
  return apiKeyId;
}

function requireNonEmptyString(value: unknown, fieldName: string) {
  let text = readOptionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function requireAmplitudeSecretKey(value: unknown): string {
  return requiredString(value, "apiKey", (message) => new ProviderRequestError(400, message));
}

function normalizeDataResidency(value: unknown) {
  return readDataResidency(value) ?? "default";
}

function readDataResidency(value: unknown) {
  if (value === "eu") {
    return "eu";
  }
  if (value === "default") {
    return "default";
  }
  if (value == null || value === "") {
    return undefined;
  }
  throw new ProviderRequestError(400, "dataResidency must be default or eu");
}

export function resolveAmplitudeApiBaseUrl(dataResidency: string | undefined): string {
  return dataResidency === "eu" ? amplitudeEuApiBaseUrl : amplitudeApiBaseUrl;
}

export function resolveAmplitudeCredentialBaseUrl(dataResidency: unknown): string {
  return resolveAmplitudeApiBaseUrl(readDataResidency(readOptionalString(dataResidency)) ?? "default");
}

function parseJsonResponse(text: string) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Amplitude returned invalid JSON");
  }
}

function mapAmplitudeError(status: number, payload: unknown, phase: "validate" | "execute") {
  let message = readAmplitudeErrorMessage(payload) ?? `Amplitude request failed with ${status}`;
  if (status === 401 || status === 403) {
    if (phase === "validate") {
      return new ProviderRequestError(400, message);
    }
    return new ProviderRequestError(401, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }
  return new ProviderRequestError(status, message);
}

function readAmplitudeErrorMessage(payload: unknown) {
  let record = optionalRecord(payload);
  return (
    readOptionalString(record?.error) ?? readOptionalString(record?.message) ?? readOptionalString(record?.details)
  );
}

function requireRecord(value: unknown, label: string) {
  let record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return record;
}

function requireArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }
  return value;
}

function readOptionalString(value: unknown) {
  if (value == null) {
    return undefined;
  }
  let text = String(value).trim();
  return text || undefined;
}

function readOptionalInteger(value: unknown) {
  return optionalInteger(value);
}

export function buildAmplitudeBasicAuthorizationHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function resolveAmplitudeActionContext(
  input: Record<string, unknown>,
  context: AmplitudeActionContext,
): AmplitudeActionContext {
  const dataResidency = readDataResidency(readOptionalString(input.dataResidency));
  return {
    ...context,
    baseUrl: dataResidency ? resolveAmplitudeApiBaseUrl(dataResidency) : context.baseUrl,
  };
}
