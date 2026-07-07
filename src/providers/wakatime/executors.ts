import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { WakatimeActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "wakatime";
const wakatimeApiBaseUrl = "https://wakatime.com/api/v1";
const wakatimeDefaultRequestTimeoutMs = 30_000;

type WakatimeRequestPhase = "validate" | "execute";

export const wakatimeActionHandlers: Record<WakatimeActionName, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  get_all_time_since_today(input, context) {
    return getAllTimeSinceToday(input, context);
  },
  list_projects(input, context) {
    return listProjects(input, context);
  },
  get_stats(input, context) {
    return getStats(input, context);
  },
  get_summaries(input, context) {
    return getSummaries(input, context);
  },
  get_status_bar_today(input, context) {
    return getStatusBarToday(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, wakatimeActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: wakatimeApiBaseUrl,
  auth: { type: "api_key_basic" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const { payload } = await requestWakatimeJson({
      apiKey: input.apiKey,
      path: "/users/current",
      fetcher,
      signal,
      phase: "validate",
    });
    const user = requireEnvelopeObject(payload, "wakatime user response");
    const userId = requireResponseString(user.id, "id");
    const accountLabel =
      optionalString(user.display_name) ??
      optionalString(user.email) ??
      optionalString(user.username) ??
      "WakaTime User";
    return {
      profile: {
        accountId: userId,
        displayName: accountLabel,
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: wakatimeApiBaseUrl,
        validationEndpoint: "/users/current",
        userId,
        email: optionalString(user.email),
        username: optionalString(user.username),
        timezone: optionalString(user.timezone),
        plan: optionalString(user.plan),
      }),
    };
  },
};

async function getCurrentUser(context: ApiKeyProviderContext): Promise<unknown> {
  const { payload } = await requestWakatimeJson({
    apiKey: context.apiKey,
    path: "/users/current",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    user: requireEnvelopeObject(payload, "wakatime user response"),
  };
}

async function getAllTimeSinceToday(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { payload } = await requestWakatimeJson({
    apiKey: context.apiKey,
    path: "/users/current/all_time_since_today",
    query: buildQueryParams(input, ["project"]),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    total: requireEnvelopeObject(payload, "wakatime all time since today response"),
  };
}

async function listProjects(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { payload } = await requestWakatimeJson({
    apiKey: context.apiKey,
    path: "/users/current/projects",
    query: buildQueryParams(input, ["q", "page"]),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    projects: requireEnvelopeArray(payload, "wakatime project list response"),
  };
}

async function getStats(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const range = optionalString(input.range);
  const path = range ? `/users/current/stats/${encodeURIComponent(range)}` : "/users/current/stats";
  const { payload } = await requestWakatimeJson({
    apiKey: context.apiKey,
    path,
    query: buildQueryParams(input, ["timeout", "writes_only"]),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    stats: requireEnvelopeObject(payload, "wakatime stats response"),
  };
}

async function getSummaries(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { payload } = await requestWakatimeJson({
    apiKey: context.apiKey,
    path: "/users/current/summaries",
    query: buildQueryParams(input, [
      "range",
      "start",
      "end",
      "project",
      "branches",
      "timeout",
      "writes_only",
      "timezone",
    ]),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    summaries: requireEnvelopeArray(payload, "wakatime summaries response"),
    cumulative_total: optionalRecord(payload.cumulative_total),
    daily_average: optionalRecord(payload.daily_average),
    start: optionalString(payload.start),
    end: optionalString(payload.end),
  };
}

async function getStatusBarToday(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { payload } = await requestWakatimeJson({
    apiKey: context.apiKey,
    path: "/users/current/status_bar/today",
    query: buildQueryParams(input, ["project", "branches", "timeout", "writes_only", "timezone"]),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    status_bar: requireEnvelopeObject(payload, "wakatime status bar response"),
    cached_at: optionalString(payload.cached_at),
    has_team_features: typeof payload.has_team_features === "boolean" ? payload.has_team_features : undefined,
  };
}

async function requestWakatimeJson(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: WakatimeRequestPhase;
  signal?: AbortSignal;
  query?: URLSearchParams;
}): Promise<{ response: Response; payload: Record<string, unknown> }> {
  const timeout = createProviderTimeout(input.signal, wakatimeDefaultRequestTimeoutMs);
  try {
    const normalizedPath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
    const url = new URL(normalizedPath, `${wakatimeApiBaseUrl}/`);
    if (input.query) {
      for (const [key, value] of input.query.entries()) {
        url.searchParams.set(key, value);
      }
    }

    let response: Response;
    try {
      response = await input.fetcher(url, {
        method: "GET",
        signal: timeout.signal,
        headers: {
          Authorization: `Basic ${Buffer.from(input.apiKey).toString("base64")}`,
          Accept: "application/json",
          "User-Agent": providerUserAgent,
        },
      });
    } catch (error) {
      if (timeout.didTimeout()) {
        throw new ProviderRequestError(504, "wakatime request timed out");
      }
      throw new ProviderRequestError(
        502,
        `wakatime request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ProviderRequestError(502, "wakatime returned invalid JSON");
    }

    if (response.ok) {
      return {
        response,
        payload: requireObjectPayload(payload, "wakatime response"),
      };
    }

    const message = buildWakatimeErrorMessage(response.status, payload);
    if (response.status === 429) {
      throw new ProviderRequestError(429, message, payload);
    }
    if (input.phase === "validate" && response.status === 401) {
      throw new ProviderRequestError(400, message, payload);
    }
    if (input.phase === "execute" && response.status === 401) {
      throw new ProviderRequestError(401, message, payload);
    }
    if (response.status === 400 || response.status === 403 || response.status === 404) {
      throw new ProviderRequestError(400, message, payload);
    }
    throw new ProviderRequestError(response.status || 502, message, payload);
  } finally {
    timeout.cleanup();
  }
}

function buildQueryParams(input: Record<string, unknown>, keys: string[]): URLSearchParams | undefined {
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = input[key];
    if (value == null || value === "") {
      continue;
    }

    const stringValue = optionalString(value);
    if (stringValue !== undefined) {
      params.set(key, stringValue);
      continue;
    }

    const booleanValue = optionalBoolean(value);
    if (booleanValue !== undefined) {
      params.set(key, String(booleanValue));
      continue;
    }

    const integerValue = optionalInteger(value);
    if (integerValue !== undefined) {
      params.set(key, String(integerValue));
    }
  }
  return params.size > 0 ? params : undefined;
}

function requireEnvelopeObject(payload: Record<string, unknown>, context: string): Record<string, unknown> {
  const data = requireEnvelopeData(payload, context);
  return requireObjectPayload(data, `${context} data`);
}

function requireEnvelopeArray(payload: Record<string, unknown>, context: string): unknown[] {
  const data = requireEnvelopeData(payload, context);
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, `${context} data is not an array`);
  }
  return data;
}

function requireEnvelopeData(payload: Record<string, unknown>, context: string): unknown {
  if (!("data" in payload)) {
    throw new ProviderRequestError(502, `${context} is missing data`);
  }
  return payload.data;
}

function requireObjectPayload(payload: unknown, context: string): Record<string, unknown> {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, `${context} is not an object`);
  }
  return object;
}

function requireResponseString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `wakatime response is missing ${fieldName}`);
  }
  return parsed;
}

function buildWakatimeErrorMessage(status: number, payload: unknown): string {
  const object = optionalRecord(payload);
  const message = optionalString(object?.error) ?? optionalString(object?.message) ?? optionalString(object?.detail);
  return message ?? `wakatime request failed with status ${status}`;
}
