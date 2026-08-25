import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  integer,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const globalpingApiBaseUrl = "https://api.globalping.io";

type GlobalpingRequestPhase = "validate" | "execute";
type GlobalpingActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type GlobalpingMeasurementType = "ping" | "traceroute" | "dns" | "mtr" | "http";

const reservedHttpRequestHeaders = new Set(["host", "user-agent"]);
const measurementOptionsValidators: Record<GlobalpingMeasurementType, (options: Record<string, unknown>) => void> = {
  ping(options) {
    assertKnownKeys(options, ["packets", "protocol", "port", "ip_version"], "measurement_options");
  },
  traceroute(options) {
    assertKnownKeys(options, ["protocol", "port", "ip_version"], "measurement_options");
  },
  dns(options) {
    assertKnownKeys(options, ["query", "resolver", "protocol", "port", "ip_version", "trace"], "measurement_options");
  },
  mtr(options) {
    assertKnownKeys(options, ["packets", "protocol", "port", "ip_version"], "measurement_options");
  },
  http(options) {
    assertKnownKeys(options, ["request", "resolver", "protocol", "port", "ip_version"], "measurement_options");
  },
};

export const globalpingActionHandlers: ProviderActionHandlers<"globalping", GlobalpingActionHandler> = {
  get_limits(_input, context) {
    return getLimits(context);
  },
  list_probes(_input, context) {
    return listProbes(context);
  },
  create_measurement(input, context) {
    return createMeasurement(input, context);
  },
  get_measurement(input, context) {
    return getMeasurement(input, context);
  },
};

export async function validateGlobalpingCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const { payload } = await requestGlobalpingJson({
    apiKey: input.apiKey,
    path: "/v1/limits",
    method: "GET",
    fetcher,
    signal,
    phase: "validate",
  });
  const limits = requireObjectPayload(payload, "globalping limits response");
  const createLimit = readMeasurementCreateLimit(limits);
  if (createLimit.type !== "user") {
    throw new ProviderRequestError(400, "Globalping token did not return authenticated user limits.");
  }

  return {
    profile: {
      accountId: `globalping:${input.apiKey.slice(-4) || input.apiKey}`,
      displayName: "Globalping Dashboard Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: globalpingApiBaseUrl,
      validationEndpoint: "/v1/limits",
      rateLimitType: createLimit.type,
      rateLimitLimit: createLimit.limit,
      rateLimitRemaining: createLimit.remaining,
      rateLimitReset: createLimit.reset,
      creditsRemaining: optionalInteger(optionalRecord(limits.credits)?.remaining),
    }),
  };
}

async function getLimits(context: ApiKeyProviderContext): Promise<unknown> {
  const { payload } = await requestGlobalpingJson({
    apiKey: context.apiKey,
    path: "/v1/limits",
    method: "GET",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    limits: requireObjectPayload(payload, "globalping limits response"),
  };
}

async function listProbes(context: ApiKeyProviderContext): Promise<unknown> {
  const { payload } = await requestGlobalpingJson({
    apiKey: context.apiKey,
    path: "/v1/probes",
    method: "GET",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    probes: requireArrayPayload(payload, "globalping probes response"),
  };
}

async function createMeasurement(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { payload, response } = await requestGlobalpingJson({
    apiKey: context.apiKey,
    path: "/v1/measurements",
    method: "POST",
    body: buildCreateMeasurementBody(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const measurement = requireObjectPayload(payload, "globalping create measurement response");
  const location = response.headers.get("Location");
  if (!location) {
    throw new ProviderRequestError(502, "globalping create measurement response missing Location header");
  }

  return compactObject({
    measurement: {
      id: requireProviderString(measurement.id, "globalping measurement id"),
      probesCount: requireProviderInteger(measurement.probesCount, "globalping measurement probesCount"),
    },
    location,
    rate_limit: readRateLimitHeaders(response.headers),
    credits: readCreditsHeaders(response.headers),
    request_cost: readOptionalHeaderInteger(response.headers, "X-Request-Cost"),
  });
}

async function getMeasurement(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const measurementId = requireInputString(input.measurement_id, "measurement_id");
  const { payload } = await requestGlobalpingJson({
    apiKey: context.apiKey,
    path: `/v1/measurements/${encodeURIComponent(measurementId)}`,
    method: "GET",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    measurement: requireObjectPayload(payload, "globalping measurement response"),
  };
}

interface GlobalpingRequestInput {
  apiKey: string;
  path: string;
  method: "GET" | "POST";
  fetcher: typeof fetch;
  phase: GlobalpingRequestPhase;
  signal?: AbortSignal;
  body?: Record<string, unknown>;
}

async function requestGlobalpingJson(input: GlobalpingRequestInput): Promise<{ response: Response; payload: unknown }> {
  try {
    const response = await input.fetcher(new URL(input.path, globalpingApiBaseUrl), {
      method: input.method,
      headers: buildGlobalpingHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
    const payload = await readJsonPayload(response);
    if (!response.ok) {
      throw createGlobalpingError(response, payload, input.phase);
    }

    return { response, payload };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `globalping request failed: ${error.message}` : "globalping request failed",
    );
  }
}

function buildGlobalpingHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "globalping returned invalid JSON");
  }
}

function createGlobalpingError(
  response: Response,
  payload: unknown,
  phase: GlobalpingRequestPhase,
): ProviderRequestError {
  const retryAfter = response.headers.get("Retry-After");
  const message =
    readErrorMessage(payload) ??
    (response.status === 429 && retryAfter
      ? `Too many requests. Retry after ${retryAfter} seconds.`
      : `globalping request failed with status ${response.status}`);

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if ((response.status === 401 || response.status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  return optionalString(optionalRecord(optionalRecord(payload)?.error)?.message);
}

function readMeasurementCreateLimit(limits: Record<string, unknown>): Record<string, string | number> {
  const create = optionalRecord(optionalRecord(optionalRecord(limits.rateLimit)?.measurements)?.create);
  if (!create) {
    throw new ProviderRequestError(502, "globalping limits response missing measurements.create");
  }

  return {
    type: requireProviderString(create.type, "globalping rate limit type"),
    limit: requireProviderInteger(create.limit, "globalping rate limit limit"),
    remaining: requireProviderInteger(create.remaining, "globalping rate limit remaining"),
    reset: requireProviderInteger(create.reset, "globalping rate limit reset"),
  };
}

function readRateLimitHeaders(headers: Headers): Record<string, number> | undefined {
  const limit = readOptionalHeaderInteger(headers, "X-RateLimit-Limit");
  const consumed = readOptionalHeaderInteger(headers, "X-RateLimit-Consumed");
  const remaining = readOptionalHeaderInteger(headers, "X-RateLimit-Remaining");
  const reset = readOptionalHeaderInteger(headers, "X-RateLimit-Reset");
  if (limit === undefined && consumed === undefined && remaining === undefined && reset === undefined) {
    return undefined;
  }
  if (limit === undefined || consumed === undefined || remaining === undefined || reset === undefined) {
    throw new ProviderRequestError(502, "globalping returned incomplete rate limit headers");
  }

  return { limit, consumed, remaining, reset };
}

function readCreditsHeaders(headers: Headers): Record<string, number> | undefined {
  const consumed = readOptionalHeaderInteger(headers, "X-Credits-Consumed");
  const remaining = readOptionalHeaderInteger(headers, "X-Credits-Remaining");
  if (consumed === undefined && remaining === undefined) {
    return undefined;
  }
  return compactObject({ consumed, remaining }) as Record<string, number>;
}

function buildCreateMeasurementBody(input: Record<string, unknown>): Record<string, unknown> {
  const type = requireMeasurementType(input.type);
  const measurementOptions = optionalRecord(input.measurement_options);
  assertCreateMeasurementInput(input, type, measurementOptions);

  return compactObject({
    type,
    target: requireInputString(input.target, "target"),
    inProgressUpdates: optionalBoolean(input.in_progress_updates),
    locations: buildLocationsBody(input.locations),
    limit: optionalInteger(input.limit),
    measurementOptions: buildMeasurementOptionsBody(measurementOptions),
  });
}

function assertCreateMeasurementInput(
  input: Record<string, unknown>,
  type: GlobalpingMeasurementType,
  measurementOptions: Record<string, unknown> | undefined,
): void {
  if (input.limit !== undefined && Array.isArray(input.locations)) {
    for (const location of input.locations) {
      if (optionalRecord(location)?.limit !== undefined) {
        throw new ProviderRequestError(400, "limit cannot be combined with locations[].limit");
      }
    }
  }

  if (Array.isArray(input.locations)) {
    input.locations.forEach(assertLocationSelector);
  }

  if (measurementOptions) {
    measurementOptionsValidators[type](measurementOptions);
    assertHttpRequestHeaders(measurementOptions);
  }
}

function assertLocationSelector(value: unknown, index: number): void {
  const location = requiredRecord(value, `locations[${index}]`, (message) => new ProviderRequestError(400, message));
  const hasSelector =
    location.continent !== undefined ||
    location.region !== undefined ||
    location.country !== undefined ||
    location.state !== undefined ||
    location.city !== undefined ||
    location.asn !== undefined ||
    location.network !== undefined ||
    location.magic !== undefined ||
    (Array.isArray(location.tags) && location.tags.length > 0);
  if (!hasSelector) {
    throw new ProviderRequestError(400, "Each locations item must include at least one probe selector.");
  }
}

function assertKnownKeys(value: Record<string, unknown>, keys: string[], path: string): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ProviderRequestError(400, `Unrecognized key in ${path}: "${key}"`);
    }
  }
}

function assertHttpRequestHeaders(measurementOptions: Record<string, unknown>): void {
  const request = optionalRecord(measurementOptions.request);
  const headers = optionalRecord(request?.headers);
  if (!headers) {
    return;
  }

  for (const headerName of Object.keys(headers)) {
    if (reservedHttpRequestHeaders.has(headerName.toLowerCase())) {
      throw new ProviderRequestError(400, `The ${headerName} header is reserved and cannot be set in request.headers.`);
    }
  }
}

function buildLocationsBody(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item, index) => {
    const location = requireObjectPayload(item, `globalping locations[${index}]`);
    const tags = Array.isArray(location.tags)
      ? location.tags.map((tag) => requireProviderString(tag, `globalping locations[${index}].tags[]`))
      : undefined;
    return compactObject({
      continent: optionalString(location.continent),
      region: optionalString(location.region),
      country: optionalString(location.country),
      state: optionalString(location.state),
      city: optionalString(location.city),
      asn: optionalInteger(location.asn),
      network: optionalString(location.network),
      tags,
      magic: optionalString(location.magic),
      limit: optionalInteger(location.limit),
    });
  });
}

function buildMeasurementOptionsBody(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  return compactObject({
    packets: optionalInteger(value.packets),
    protocol: optionalString(value.protocol),
    port: optionalInteger(value.port),
    ipVersion: optionalInteger(value.ip_version),
    resolver: optionalString(value.resolver),
    trace: optionalBoolean(value.trace),
    query: buildDnsQueryBody(value.query),
    request: buildHttpRequestBody(value.request),
  });
}

function buildDnsQueryBody(value: unknown): Record<string, unknown> | undefined {
  const query = optionalRecord(value);
  if (!query) {
    return undefined;
  }
  return compactObject({
    type: optionalString(query.type),
  });
}

function buildHttpRequestBody(value: unknown): Record<string, unknown> | undefined {
  const request = optionalRecord(value);
  if (!request) {
    return undefined;
  }

  const headers = optionalRecord(request.headers);
  return compactObject({
    host: optionalString(request.host),
    path: optionalString(request.path),
    query: optionalString(request.query),
    method: optionalString(request.method),
    headers:
      headers === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(headers)
              .map(([key, child]) => [key, optionalString(child)] as const)
              .filter((entry): entry is [string, string] => entry[1] !== undefined),
          ),
  });
}

function requireObjectPayload(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is not an object`);
  }
  return record;
}

function requireArrayPayload(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} is not an array`);
  }
  return value;
}

function requireInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requireMeasurementType(value: unknown): GlobalpingMeasurementType {
  const type = requireInputString(value, "type");
  if (type === "ping" || type === "traceroute" || type === "dns" || type === "mtr" || type === "http") {
    return type;
  }
  throw new ProviderRequestError(400, "type must be one of ping, traceroute, dns, mtr, or http");
}

function requireProviderString(value: unknown, label: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `${label} is missing`);
  }
  return parsed;
}

function requireProviderInteger(value: unknown, label: string): number {
  try {
    return integer(value, label);
  } catch {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }
}

function readOptionalHeaderInteger(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (value == null || value === "") {
    return undefined;
  }
  try {
    return integer(value, name);
  } catch {
    throw new ProviderRequestError(502, `globalping ${name} header is invalid`);
  }
}
