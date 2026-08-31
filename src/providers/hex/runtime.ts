import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  booleanString,
  compactObject,
  optionalBoolean,
  optionalRecord,
  optionalScalarString,
  optionalString,
} from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const hexApiBaseUrl = "https://app.hex.tech/api/v1";

type HexActionContext = ApiKeyProviderContext;
type HexActionHandler = (input: Record<string, unknown>, context: HexActionContext) => Promise<unknown>;
type HexRequestMode = "validate" | "execute";

interface HexRequestOptions {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  mode: HexRequestMode;
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string | undefined>;
  body?: unknown;
  headers?: Record<string, string | undefined>;
}

export const hexActionHandlers: ProviderActionHandlers<"hex", HexActionHandler> = {
  list_projects(input, context) {
    return listProjects(input, context);
  },
  get_project(input, context) {
    return getProject(input, context);
  },
  run_project(input, context) {
    return runProject(input, context);
  },
  list_project_runs(input, context) {
    return listProjectRuns(input, context);
  },
  get_run_status(input, context) {
    return getRunStatus(input, context);
  },
  cancel_run(input, context) {
    return cancelRun(input, context);
  },
};

export async function validateHexCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  await requestHexJson({
    path: "/projects",
    apiKey: input.apiKey,
    fetcher: options.fetcher,
    signal: options.signal,
    mode: "validate",
    query: {
      limit: "1",
    },
  });

  return {
    profile: {
      accountId: "api_token",
      displayName: "Hex API Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: hexApiBaseUrl,
      validationEndpoint: "/projects",
    },
  };
}

async function listProjects(input: Record<string, unknown>, context: HexActionContext): Promise<unknown> {
  const payload = await requestHexJson({
    path: "/projects",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    query: compactObject({
      limit: optionalScalarString(input.limit),
      after: optionalString(input.after),
      before: optionalString(input.before),
      sortBy: optionalString(input.sortBy),
      sortDirection: optionalString(input.sortDirection),
      statuses: joinStringArray(input.statuses),
      categories: joinStringArray(input.categories),
      ownerEmail: optionalString(input.ownerEmail),
      creatorEmail: optionalString(input.creatorEmail),
      collectionId: optionalString(input.collectionId),
      includeSharing: booleanString(input.includeSharing),
      includeArchived: booleanString(input.includeArchived),
      includeTrashed: booleanString(input.includeTrashed),
      includeComponents: booleanString(input.includeComponents),
    }),
  });

  const body = requireObject(payload, "Hex projects response");
  return {
    values: readArray(body.values, "values"),
    pagination: nullableObject(body.pagination),
    raw: body,
  };
}

async function getProject(input: Record<string, unknown>, context: HexActionContext): Promise<unknown> {
  const projectId = requireString(input.projectId, "projectId");
  const payload = await requestHexJson({
    path: `/projects/${encodeURIComponent(projectId)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    query: compactObject({
      includeSharing: booleanString(input.includeSharing),
    }),
  });

  const project = requireObject(payload, "Hex project response");
  return {
    project,
    raw: project,
  };
}

async function runProject(input: Record<string, unknown>, context: HexActionContext): Promise<unknown> {
  const projectId = requireString(input.projectId, "projectId");
  const body = compactObject({
    inputParams: optionalRecord(input.inputParams),
    notifications: input.notifications,
    dryRun: optionalBoolean(input.dryRun),
    updatePublishedResults: optionalBoolean(input.updatePublishedResults),
    useCachedSqlResults: optionalBoolean(input.useCachedSqlResults),
    viewId: optionalString(input.viewId),
    flagConfigOverride: optionalString(input.flagConfigOverride),
  });
  const payload = await requestHexJson({
    path: `/projects/${encodeURIComponent(projectId)}/runs`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    method: "POST",
    body,
  });

  const run = requireObject(payload, "Hex run response");
  return {
    runId: requireString(run.runId, "runId"),
    projectId: requireString(run.projectId ?? projectId, "projectId"),
    runUrl: nullableString(run.runUrl),
    runStatusUrl: nullableString(run.runStatusUrl),
    traceId: nullableString(run.traceId),
    projectVersion: nullableInteger(run.projectVersion),
    notifications: nullableArray(run.notifications),
    raw: run,
  };
}

async function listProjectRuns(input: Record<string, unknown>, context: HexActionContext): Promise<unknown> {
  const projectId = requireString(input.projectId, "projectId");
  const payload = await requestHexJson({
    path: `/projects/${encodeURIComponent(projectId)}/runs`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    query: compactObject({
      limit: optionalScalarString(input.limit),
      offset: optionalScalarString(input.offset),
      statusFilter: optionalString(input.statusFilter),
    }),
  });

  const body = requireObject(payload, "Hex project runs response");
  return {
    runs: readArray(body.runs, "runs"),
    nextPage: nullableString(body.nextPage),
    previousPage: nullableString(body.previousPage),
    traceId: nullableString(body.traceId),
    raw: body,
  };
}

async function getRunStatus(input: Record<string, unknown>, context: HexActionContext): Promise<unknown> {
  const projectId = requireString(input.projectId, "projectId");
  const runId = requireString(input.runId, "runId");
  const payload = await requestHexJson({
    path: `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    headers: compactObject({
      "enable-expanded-stats": booleanString(input.enableExpandedStats),
    }),
  });

  const run = requireObject(payload, "Hex run status response");
  return {
    runId: requireString(run.runId ?? runId, "runId"),
    projectId: requireString(run.projectId ?? projectId, "projectId"),
    status: requireString(run.status, "status"),
    run,
    raw: run,
  };
}

async function cancelRun(input: Record<string, unknown>, context: HexActionContext): Promise<unknown> {
  const projectId = requireString(input.projectId, "projectId");
  const runId = requireString(input.runId, "runId");
  await requestHexJson({
    path: `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    method: "DELETE",
  });

  return {
    success: true,
  };
}

async function requestHexJson(options: HexRequestOptions): Promise<unknown> {
  const url = new URL(`${hexApiBaseUrl}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${options.apiKey}`,
    "user-agent": providerUserAgent,
  });
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    if (value !== undefined) {
      headers.set(key, value);
    }
  }
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  let response: Response;
  try {
    response = await options.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Hex ${options.mode} request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw mapHexError(response.status, payload, options.mode);
  }

  return payload;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function mapHexError(status: number, payload: unknown, mode: HexRequestMode): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Hex API request failed with status ${status}`;
  if (status === 401) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 403) {
    return new ProviderRequestError(403, message, payload);
  }
  if (status === 429 || status === 503) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  return (
    optionalString(body.message) ?? optionalString(body.error) ?? optionalString(optionalRecord(body.error)?.message)
  );
}

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${fieldName} was not an object`, value);
  }
  return object;
}

function nullableObject(value: unknown): Record<string, unknown> | null {
  return value === null || value === undefined ? null : requireObject(value, "Hex object field");
}

function readArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Hex response missing ${fieldName} array`, value);
  }
  return value;
}

function nullableArray(value: unknown): unknown[] | null {
  return value === null || value === undefined ? null : readArray(value, "array field");
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(502, `Hex response missing ${fieldName}`, value);
  }
  return value;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : (optionalScalarString(value) ?? null);
}

function nullableInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function joinStringArray(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => String(item)).join(",");
}
