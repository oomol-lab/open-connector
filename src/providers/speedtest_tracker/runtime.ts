import type { CredentialValidationResult } from "../../core/types.ts";

import {
  booleanString,
  compactObject,
  integer,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "speedtest_tracker";
const apiSegment = "api";
const validationPath = "v1/stats";
const apiTokenDocsUrl = "https://docs.speedtest-tracker.dev/api/authorization";
const permissionDeniedPrefix = "You do not have permission";
const unauthenticatedPrefix = "Unauthenticated";
const noResultPrefixes = ["No query results for model", "No result found"] as const;
const comparisonOperators = ["<=", ">=", "<>", "<", ">", "="] as const;

type RequestPhase = "validate" | "execute";
type QueryValue = string | number | boolean | undefined;
type ActionHandler = (input: Record<string, unknown>, context: SpeedtestTrackerContext) => Promise<unknown>;

export interface SpeedtestTrackerContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface SpeedtestTrackerResponse {
  status: number;
  payload: unknown;
}

export const speedtestTrackerActionHandlers: Record<string, ActionHandler> = {
  async list_results(input, context) {
    const payload = await requestSpeedtestTrackerJson(context, "v1/results", {
      query: {
        ...buildResultFilterQuery(input),
        sort: optionalString(input.sort),
        "page[number]": readOptionalInteger(input.page),
        "page[size]": readOptionalInteger(input.pageSize),
      },
    });
    const record = requiredResponseRecord(payload, "speedtest_tracker results response");
    const results = requireResponseArray(record.data, "speedtest_tracker results response data");
    const meta = requiredResponseRecord(record.meta, "speedtest_tracker results response meta");
    const currentPage = integer(meta.current_page, "results meta current_page", providerResponseError);
    const lastPage = integer(meta.last_page, "results meta last_page", providerResponseError);
    return {
      results,
      pagination: {
        currentPage,
        lastPage,
        perPage: integer(meta.per_page ?? meta["per.page"], "results meta per_page", providerResponseError),
        total: integer(meta.total, "results meta total", providerResponseError),
        from: optionalInteger(meta.from) ?? null,
        to: optionalInteger(meta.to) ?? null,
        nextPage: currentPage < lastPage ? currentPage + 1 : null,
      },
    };
  },

  async get_result(input, context) {
    const id = Number(input.id);
    const payload = await requestSpeedtestTrackerJson(context, `v1/results/${id}`, {});
    return { result: readResultEnvelope(payload) };
  },

  async get_latest_result(input, context) {
    const response = await fetchSpeedtestTracker(context, "v1/results/latest", {
      query: buildResultFilterQuery(input),
    });
    if (response.status === 404 && isNoResultFound(response.payload)) {
      return { result: null };
    }
    assertSuccessful(response, "execute");
    return { result: readResultEnvelope(response.payload) };
  },

  async run_speedtest(input, context) {
    const payload = await requestSpeedtestTrackerJson(context, "v1/speedtests/run", {
      method: "POST",
      query: { server_id: readOptionalInteger(input.serverId) },
    });
    const record = requiredResponseRecord(payload, "speedtest_tracker run response");
    return {
      result: readResultEnvelope(payload),
      message: optionalString(record.message) ?? "Speedtest added to the queue.",
    };
  },

  async get_stats(input, context) {
    const payload = await requestSpeedtestTrackerJson(context, "v1/stats", {
      query: buildDateRangeQuery(input),
    });
    return { stats: readStats(payload) };
  },

  async list_servers(_input, context) {
    const payload = await requestSpeedtestTrackerJson(context, "v1/ookla/list-servers", {});
    const record = requiredResponseRecord(payload, "speedtest_tracker servers response");
    const servers = requireResponseArray(record.data, "speedtest_tracker servers response data");
    return {
      servers: servers.map((server) => {
        const item = requiredResponseRecord(server, "speedtest_tracker server");
        return { ...item, id: normalizeServerId(item.id) };
      }),
    };
  },

  async check_health(_input, context) {
    const payload = await requestSpeedtestTrackerJson(context, "healthcheck", {});
    const record = requiredResponseRecord(payload, "speedtest_tracker healthcheck response");
    return {
      message: requiredString(record.message, "speedtest_tracker healthcheck message", providerResponseError),
    };
  },
} satisfies Record<string, ActionHandler>;

export async function validateSpeedtestTrackerCredential(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const baseUrl = normalizeSpeedtestTrackerBaseUrl(values.baseUrl);
  const context = createSpeedtestTrackerContext(apiKey, baseUrl, fetcher, signal);
  const response = await fetchSpeedtestTracker(context, validationPath, {});

  const resultsReadable = !(response.status === 403 && isPermissionDenied(response.payload));
  let totalResults: number | undefined;
  if (resultsReadable) {
    assertSuccessful(response, "validate");
    totalResults = optionalInteger(readStats(response.payload).total_results);
  }

  const parsed = new URL(baseUrl);
  return {
    profile: {
      accountId: `${service}:${buildInstanceKey(parsed)}`,
      displayName: `Speedtest Tracker ${parsed.host}`,
    },
    metadata: compactObject({
      baseUrl,
      validationEndpoint: buildApiUrl(baseUrl, validationPath).pathname,
      credentialHelpUrl: apiTokenDocsUrl,
      resultsReadable,
      totalResults,
    }),
  };
}

export function normalizeSpeedtestTrackerBaseUrl(
  value: string | undefined,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const parsed = assertPublicHttpUrl(value ?? "", {
    fieldName: "baseUrl",
    createError: providerInputError,
    allowPrivateNetwork,
  });

  if (parsed.protocol !== "https:") {
    throw providerInputError("baseUrl must use https");
  }
  if (parsed.username || parsed.password) {
    throw providerInputError("baseUrl must not include credentials");
  }

  let pathname = stripTrailingSlashes(parsed.pathname);
  const lowerPathname = pathname.toLowerCase();
  for (const suffix of [`/${apiSegment}/v1`, `/${apiSegment}`]) {
    if (lowerPathname.endsWith(suffix)) {
      pathname = stripTrailingSlashes(pathname.slice(0, -suffix.length));
      break;
    }
  }

  return `${parsed.origin}${pathname === "/" ? "" : pathname}`;
}

export function buildSpeedtestTrackerProxyBaseUrl(baseUrl: string): string {
  return buildApiUrl(baseUrl, "").toString();
}

export function createSpeedtestTrackerContext(
  apiKey: string,
  baseUrl: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): SpeedtestTrackerContext {
  return {
    apiKey,
    baseUrl,
    fetcher,
    signal,
  };
}

function buildApiUrl(baseUrl: string, path: string): URL {
  return new URL(path, `${baseUrl}/${apiSegment}/`);
}

interface RequestOptions {
  method?: "GET" | "POST";
  query?: Record<string, QueryValue>;
}

async function requestSpeedtestTrackerJson(
  context: SpeedtestTrackerContext,
  path: string,
  options: RequestOptions,
): Promise<unknown> {
  const response = await fetchSpeedtestTracker(context, path, options);
  assertSuccessful(response, "execute");
  return response.payload;
}

async function fetchSpeedtestTracker(
  context: SpeedtestTrackerContext,
  path: string,
  options: RequestOptions,
): Promise<SpeedtestTrackerResponse> {
  const url = buildApiUrl(context.baseUrl, path);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return runProviderRequest({ label: "Speedtest Tracker", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(url, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    return { status: response.status, payload: await readPayload(response) };
  });
}

async function readPayload(response: Response): Promise<unknown> {
  return readProviderJsonBody(response, {
    emptyBody: {},
    invalidJsonMessage: "Speedtest Tracker returned invalid JSON",
    invalidJsonFallback: response.ok ? undefined : (text) => ({ message: text }),
  });
}

function assertSuccessful(response: SpeedtestTrackerResponse, phase: RequestPhase): void {
  if (response.status >= 400) {
    throw createSpeedtestTrackerError(response.status, response.payload, phase);
  }
}

function createSpeedtestTrackerError(status: number, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    readPayloadMessage(payload) ||
    optionalString(record?.error) ||
    `Speedtest Tracker request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, undefined, "rate_limited");
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return providerInputError(message);
  }
  if (status === 401 && message.startsWith(unauthenticatedPrefix)) {
    return new ProviderRequestError(401, message);
  }
  if (status === 403 && isPermissionDenied(payload)) {
    return new ProviderRequestError(403, message);
  }
  if (status === 422) {
    return providerInputError(formatValidationMessage(message, record));
  }
  if (status === 404) {
    return new ProviderRequestError(404, message);
  }
  return new ProviderRequestError(status, message);
}

function formatValidationMessage(message: string, record: Record<string, unknown> | undefined): string {
  const details = optionalRecord(record?.data);
  if (!details) {
    return message;
  }
  const lines = Object.entries(details).flatMap(([field, errors]) => {
    const messages = Array.isArray(errors) ? errors.filter((item): item is string => typeof item === "string") : [];
    return messages.length > 0 ? [`${field}: ${messages.join(" ")}`] : [];
  });
  return lines.length > 0 ? `${message} ${lines.join(" ")}` : message;
}

function isPermissionDenied(payload: unknown): boolean {
  return readPayloadMessage(payload)?.startsWith(permissionDeniedPrefix) === true;
}

function isNoResultFound(payload: unknown): boolean {
  const message = readPayloadMessage(payload);
  return message !== undefined && noResultPrefixes.some((prefix) => message.startsWith(prefix));
}

function readPayloadMessage(payload: unknown): string | undefined {
  return optionalString(optionalRecord(payload)?.message);
}

function buildResultFilterQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return {
    "filter[ping]": readComparisonFilter(input.ping, "ping"),
    "filter[download]": readComparisonFilter(input.download, "download"),
    "filter[upload]": readComparisonFilter(input.upload, "upload"),
    "filter[healthy]": booleanString(input.healthy),
    "filter[status]": optionalString(input.status),
    "filter[scheduled]": booleanString(input.scheduled),
    ...buildDateRangeQuery(input),
  };
}

function buildDateRangeQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return {
    "filter[start_at]": readOptionalDate(input.startAt, "startAt"),
    "filter[end_at]": readOptionalDate(input.endAt, "endAt"),
  };
}

function readComparisonFilter(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw providerInputError(`${fieldName} must be a finite number`);
    }
    return String(value);
  }
  const text = typeof value === "string" ? value.trim() : "";
  const operator = comparisonOperators.find((candidate) => text.startsWith(candidate)) ?? "";
  const numberText = text.slice(operator.length).trim();
  if (numberText === "" || !Number.isFinite(Number(numberText))) {
    throw providerInputError(`${fieldName} must be a number optionally prefixed with <, <=, >, >=, or <>`);
  }
  return `${operator}${numberText}`;
}

function readOptionalDate(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = optionalString(value)?.trim();
  if (!text) {
    throw providerInputError(`${fieldName} must be a non-empty date or date-time string`);
  }
  return text;
}

function readOptionalInteger(value: unknown): number | undefined {
  return value === undefined || value === null ? undefined : Number(value);
}

function readResultEnvelope(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "speedtest_tracker result response");
  const envelopeData = optionalRecord(record.data);
  if (envelopeData && envelopeData.id !== undefined) {
    return envelopeData;
  }
  if (record.id !== undefined) {
    return record;
  }
  throw providerResponseError("speedtest_tracker result response is missing data");
}

function readStats(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "speedtest_tracker stats response");
  return requiredResponseRecord(record.data, "speedtest_tracker stats response data");
}

function normalizeServerId(value: unknown): number | string {
  if (typeof value === "number") {
    return value;
  }
  const text = optionalString(value)?.trim() ?? "";
  const parsed = Number(text);
  return text !== "" && Number.isSafeInteger(parsed) ? parsed : String(value ?? "");
}

function requireResponseArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw providerResponseError(`${label} must be an array`);
  }
  return value;
}

function buildInstanceKey(url: URL): string {
  return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
}

function stripTrailingSlashes(value: string): string {
  let normalized = value;
  while (normalized.endsWith("/") && normalized !== "/") {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}
