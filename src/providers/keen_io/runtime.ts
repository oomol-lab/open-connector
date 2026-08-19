import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const keenIoApiBaseUrl = "https://api.keen.io/3.0";

type KeenIoActionHandler = (input: Record<string, unknown>, context: KeenIoContext) => Promise<unknown>;

export interface KeenIoContext {
  apiKey: string;
  fetcher: ProviderFetch;
  projectId: string;
  signal?: AbortSignal;
}

export const keenIoActionHandlers: ProviderActionHandlers<"keen_io", KeenIoActionHandler> = {
  add_event(input, context) {
    return addEvent(input, context);
  },
  query_count(input, context) {
    return runAnalysis("count", input, context);
  },
  query_sum(input, context) {
    return runAnalysis("sum", input, context);
  },
};

export async function validateKeenIoCredential(
  apiKey: string,
  projectIdInput: unknown,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const projectId = requireProjectId(projectIdInput);
  await requestKeen({
    path: `/projects/${encodeURIComponent(projectId)}/events`,
    apiKey,
    fetcher,
    phase: "validate",
    signal,
  });

  return {
    profile: {
      accountId: projectId,
      displayName: `Keen IO project ${projectId}`,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: keenIoApiBaseUrl,
      projectId,
      validationEndpoint: `/projects/${projectId}/events`,
    },
  };
}

export function requireProjectId(value: unknown): string {
  return requiredString(value, "projectId", (message) => new ProviderRequestError(400, message));
}

async function addEvent(input: Record<string, unknown>, context: KeenIoContext): Promise<unknown> {
  const eventCollection = requireInputString(input, "eventCollection");
  const event = requiredRecord(input.event, "event", (message) => new ProviderRequestError(400, message));

  const payload = await requestKeen({
    path: `/projects/${encodeURIComponent(context.projectId)}/events/${encodeURIComponent(eventCollection)}`,
    method: "POST",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    body: event,
    phase: "execute",
    signal: context.signal,
  });
  const object = optionalRecord(payload);
  if (!object || object.created !== true) {
    throw new ProviderRequestError(502, "invalid keen_io add_event response");
  }

  return { created: true, raw: object };
}

async function runAnalysis(
  analysis: "count" | "sum",
  input: Record<string, unknown>,
  context: KeenIoContext,
): Promise<unknown> {
  const payload = await requestKeen({
    path: `/projects/${encodeURIComponent(context.projectId)}/queries/${analysis}`,
    method: "POST",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    body: buildAnalysisBody(input, analysis),
    phase: "execute",
    signal: context.signal,
  });
  const object = optionalRecord(payload);
  if (!object || !("result" in object)) {
    throw new ProviderRequestError(502, `invalid keen_io ${analysis} response`);
  }

  return { result: object.result, raw: object };
}

function buildAnalysisBody(input: Record<string, unknown>, analysis: "count" | "sum"): Record<string, unknown> {
  const filters = input.filters;
  return {
    event_collection: requireInputString(input, "eventCollection"),
    target_property: analysis === "sum" ? requireInputString(input, "targetProperty") : undefined,
    timeframe: input.timeframe,
    filters: Array.isArray(filters)
      ? filters.map((filter) => {
          const object = requiredRecord(filter, "filters item", (message) => new ProviderRequestError(400, message));
          return {
            property_name: requireInputString(object, "propertyName"),
            operator: requireInputString(object, "operator"),
            property_value: object.propertyValue,
          };
        })
      : undefined,
    group_by: input.groupBy,
    interval: input.interval,
    timezone: input.timezone,
    include_metadata: input.includeMetadata,
  };
}

async function requestKeen(input: {
  path: string;
  apiKey: string;
  fetcher: ProviderFetch;
  phase: "validate" | "execute";
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    const path = input.path.startsWith("/") ? input.path.slice(1) : input.path;
    response = await input.fetcher(new URL(path, `${keenIoApiBaseUrl}/`), {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: input.apiKey,
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `keen_io request failed: ${error.message}` : "keen_io request failed",
    );
  }

  if (!response.ok) {
    throw createKeenError(response, payload, input.phase);
  }
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
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

function createKeenError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const object = optionalRecord(payload);
  const message =
    optionalString(object?.message) ?? optionalString(object?.error) ?? response.statusText ?? "keen_io request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}

function requireInputString(input: Record<string, unknown>, key: string): string {
  return requiredString(input[key], key, (message) => new ProviderRequestError(400, message));
}
