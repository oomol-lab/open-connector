import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";
import type { StatsigActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const statsigApiBaseUrl = "https://statsigapi.net";
export const statsigApiVersion = "20240601";

type StatsigRequestPhase = "validate" | "execute";
type StatsigRequestMethod = "GET";
type StatsigQueryValue = string | number | boolean | readonly (string | number | boolean)[] | null | undefined;
type StatsigActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type StatsigActionHandler = (input: Record<string, unknown>, context: StatsigActionContext) => Promise<unknown>;

interface StatsigRequestOptions {
  apiKey: string;
  path: string;
  fetcher: ProviderFetch;
  phase: StatsigRequestPhase;
  method?: StatsigRequestMethod;
  query?: Record<string, StatsigQueryValue>;
  signal?: AbortSignal;
}

export const statsigActionHandlers: Record<StatsigActionName, StatsigActionHandler> = {
  get_project(_input, context) {
    return readSingleStatsigData({
      path: "/console/v1/project",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  list_gates(input, context) {
    return readStatsigList({
      path: "/console/v1/gates",
      query: buildListGatesQuery(input),
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  get_gate(input, context) {
    return readSingleStatsigData({
      path: `/console/v1/gates/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      query: {
        includeArchiveMetadata: optionalBooleanString(input.includeArchiveMetadata),
      },
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  list_dynamic_configs(input, context) {
    return readStatsigList({
      path: "/console/v1/dynamic_configs",
      query: buildListDynamicConfigsQuery(input),
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  get_dynamic_config(input, context) {
    return readSingleStatsigData({
      path: `/console/v1/dynamic_configs/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  list_segments(input, context) {
    return readStatsigList({
      path: "/console/v1/segments",
      query: buildPagingQuery(input),
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  get_segment(input, context) {
    return readSingleStatsigData({
      path: `/console/v1/segments/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
};

export async function validateStatsigCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const trimmedApiKey = optionalString(apiKey);
  if (!trimmedApiKey) {
    throw new ProviderRequestError(400, "apiKey is required");
  }

  const output = await readSingleStatsigData({
    path: "/console/v1/project",
    apiKey: trimmedApiKey,
    fetcher,
    signal,
    phase: "validate",
  });
  const data = optionalRecord(output.data) ?? {};
  const projectId = optionalString(data.id);

  return {
    profile: {
      accountId: projectId ? `statsig:${projectId}` : "statsig:project",
      displayName: projectId ? `Statsig ${projectId}` : "Statsig Project",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: statsigApiBaseUrl,
      apiVersion: statsigApiVersion,
      validationEndpoint: "/console/v1/project",
      projectId,
    }),
  };
}

async function readStatsigList(options: StatsigRequestOptions): Promise<Record<string, unknown>> {
  const payload = await requestStatsig(options);
  return {
    message: optionalString(payload.message) ?? "",
    data: readArray(payload.data, "data"),
    pagination: readObject(payload.pagination, "pagination"),
    raw: payload,
  };
}

async function readSingleStatsigData(options: StatsigRequestOptions): Promise<Record<string, unknown>> {
  const payload = await requestStatsig(options);
  return {
    message: optionalString(payload.message) ?? "",
    data: readObject(payload.data, "data"),
    raw: payload,
  };
}

async function requestStatsig(options: StatsigRequestOptions): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await options.fetcher(buildStatsigUrl(options.path, options.query), {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        "statsig-api-key": options.apiKey,
        "statsig-api-version": statsigApiVersion,
        "user-agent": providerUserAgent,
      },
      signal: options.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Statsig request failed: ${error.message}` : "Statsig request failed",
      error,
    );
  }

  const payload = await readStatsigPayload(response, { tolerant: !response.ok });
  if (!response.ok) {
    throw createStatsigError(response.status, payload, options.phase);
  }
  return payload;
}

function buildStatsigUrl(path: string, query: Record<string, StatsigQueryValue> = {}): string {
  const url = new URL(path, statsigApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }

    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function readStatsigPayload(
  response: Response,
  options: { tolerant: boolean } = { tolerant: false },
): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    if (options.tolerant) {
      return {};
    }
    throw new ProviderRequestError(502, "Statsig returned invalid JSON");
  }

  return readObject(payload, "response");
}

function createStatsigError(
  status: number,
  payload: Record<string, unknown>,
  phase: StatsigRequestPhase,
): ProviderRequestError {
  const message =
    optionalString(payload.message) ??
    optionalString(payload.error) ??
    `Statsig API request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 401 : 403, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function buildListGatesQuery(input: Record<string, unknown>): Record<string, StatsigQueryValue> {
  return {
    idType: readOptionalArray(input.idTypes),
    type: optionalString(input.type),
    typeReason: optionalString(input.typeReason),
    passRate: readOptionalArray(input.passRates),
    rolloutRate: readOptionalArray(input.rolloutRates),
    releasePipelineID: optionalString(input.releasePipelineID),
    teamID: optionalString(input.teamID),
    targetAppID: optionalString(input.targetAppID),
    includeArchived: optionalBooleanString(input.includeArchived),
    includeArchiveMetadata: optionalBooleanString(input.includeArchiveMetadata),
    store0100Exposures: optionalBooleanString(input.store0100Exposures),
    creatorName: optionalString(input.creatorName),
    creatorID: optionalString(input.creatorID),
    tags: readOptionalArray(input.tags),
    limit: optionalInteger(input.limit),
    page: optionalInteger(input.page),
  };
}

function buildListDynamicConfigsQuery(input: Record<string, unknown>): Record<string, StatsigQueryValue> {
  return {
    releasePipelineID: optionalString(input.releasePipelineID),
    teamID: optionalString(input.teamID),
    targetAppID: optionalString(input.targetAppID),
    type: optionalString(input.type),
    typeReason: optionalString(input.typeReason),
    creatorName: optionalString(input.creatorName),
    creatorID: optionalString(input.creatorID),
    tags: readOptionalArray(input.tags),
    limit: optionalInteger(input.limit),
    page: optionalInteger(input.page),
  };
}

function buildPagingQuery(input: Record<string, unknown>): Record<string, StatsigQueryValue> {
  return {
    limit: optionalInteger(input.limit),
    page: optionalInteger(input.page),
  };
}

function optionalBooleanString(value: unknown): string | undefined {
  return typeof value === "boolean" ? String(value) : undefined;
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Statsig returned invalid ${fieldName}`);
  }
  return value;
}

function readOptionalArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  return value.map(String);
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `Statsig returned invalid ${fieldName}`);
  }
  return object;
}
