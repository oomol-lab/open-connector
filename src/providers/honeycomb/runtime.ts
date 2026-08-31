import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const defaultHoneycombApiBaseUrl = "https://api.honeycomb.io";

const allowedHoneycombApiOrigins = new Set([defaultHoneycombApiBaseUrl, "https://api.eu1.honeycomb.io"]);

export interface HoneycombActionContext extends ApiKeyProviderContext {
  apiBaseUrl: string;
}

type HoneycombRequestPhase = "validate" | "execute";
type HoneycombActionHandler = (input: Record<string, unknown>, context: HoneycombActionContext) => Promise<unknown>;

export const honeycombActionHandlers: ProviderActionHandlers<"honeycomb", HoneycombActionHandler> = {
  get_auth(_input, context) {
    return getHoneycombAuth(context);
  },
  list_datasets(_input, context) {
    return listHoneycombDatasets(context);
  },
  get_dataset(input, context) {
    return getHoneycombDataset(input, context);
  },
  list_markers(input, context) {
    return listHoneycombMarkers(input, context);
  },
  create_marker(input, context) {
    return createHoneycombMarker(input, context);
  },
  list_boards(_input, context) {
    return listHoneycombBoards(context);
  },
  get_board(input, context) {
    return getHoneycombBoard(input, context);
  },
};

export async function validateHoneycombCredential(
  input: { apiKey: string; values: Record<string, string> },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const apiBaseUrl = resolveHoneycombApiBaseUrl({ values: input.values });
  const payload = await requestHoneycombJson({
    path: "/1/auth",
    method: "GET",
    apiBaseUrl,
    apiKey: input.apiKey,
    fetcher: options.fetcher,
    signal: options.signal,
    phase: "validate",
  });
  const authorization = normalizeAuthorization(payload);
  const teamName = authorization.team.name || authorization.team.slug;
  const environmentName = authorization.environment.name || authorization.environment.slug;

  return {
    profile: {
      accountId: authorization.id || teamName || "honeycomb_api_key",
      displayName: [teamName, environmentName].filter(Boolean).join(" / ") || "Honeycomb API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl,
      keyId: authorization.id,
      keyType: authorization.type,
      teamName: authorization.team.name,
      teamSlug: authorization.team.slug,
      environmentName: authorization.environment.name,
      environmentSlug: authorization.environment.slug,
      apiKeyAccess: authorization.apiKeyAccess,
    }),
  };
}

export function resolveHoneycombApiBaseUrl(input: {
  values?: Record<string, string>;
  metadata?: Record<string, unknown>;
}): string {
  const value = optionalString(input.metadata?.apiBaseUrl) ?? optionalString(input.values?.apiBaseUrl);
  return normalizeHoneycombApiBaseUrl(value);
}

async function getHoneycombAuth(context: HoneycombActionContext): Promise<unknown> {
  const payload = await requestHoneycombJson({
    path: "/1/auth",
    method: "GET",
    apiBaseUrl: context.apiBaseUrl,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { authorization: normalizeAuthorization(payload) };
}

async function listHoneycombDatasets(context: HoneycombActionContext): Promise<unknown> {
  const payload = await requestHoneycombJson({
    path: "/1/datasets",
    method: "GET",
    apiBaseUrl: context.apiBaseUrl,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { datasets: normalizeArray(payload, normalizeDataset) };
}

async function getHoneycombDataset(input: Record<string, unknown>, context: HoneycombActionContext): Promise<unknown> {
  const datasetSlug = readInputString(input.datasetSlug, "datasetSlug");
  const payload = await requestHoneycombJson({
    path: `/1/datasets/${encodeURIComponent(datasetSlug)}`,
    method: "GET",
    apiBaseUrl: context.apiBaseUrl,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { dataset: normalizeDataset(payload) };
}

async function listHoneycombMarkers(input: Record<string, unknown>, context: HoneycombActionContext): Promise<unknown> {
  const datasetSlug = readInputString(input.datasetSlug, "datasetSlug");
  const payload = await requestHoneycombJson({
    path: `/1/markers/${encodeURIComponent(datasetSlug)}`,
    method: "GET",
    apiBaseUrl: context.apiBaseUrl,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { markers: normalizeArray(payload, normalizeMarker) };
}

async function createHoneycombMarker(
  input: Record<string, unknown>,
  context: HoneycombActionContext,
): Promise<unknown> {
  const datasetSlug = readInputString(input.datasetSlug, "datasetSlug");
  const payload = await requestHoneycombJson({
    path: `/1/markers/${encodeURIComponent(datasetSlug)}`,
    method: "POST",
    apiBaseUrl: context.apiBaseUrl,
    apiKey: context.apiKey,
    body: compactObject({
      message: readInputString(input.message, "message"),
      type: readInputString(input.type, "type"),
      start_time: optionalNumber(input.startTime),
      end_time: optionalNumber(input.endTime),
      url: optionalString(input.url),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { marker: normalizeMarker(payload) };
}

async function listHoneycombBoards(context: HoneycombActionContext): Promise<unknown> {
  const payload = await requestHoneycombJson({
    path: "/1/boards",
    method: "GET",
    apiBaseUrl: context.apiBaseUrl,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { boards: normalizeArray(payload, normalizeBoard) };
}

async function getHoneycombBoard(input: Record<string, unknown>, context: HoneycombActionContext): Promise<unknown> {
  const boardId = readInputString(input.boardId, "boardId");
  const payload = await requestHoneycombJson({
    path: `/1/boards/${encodeURIComponent(boardId)}`,
    method: "GET",
    apiBaseUrl: context.apiBaseUrl,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { board: normalizeBoard(payload) };
}

async function requestHoneycombJson(input: {
  path: string;
  method: string;
  apiBaseUrl: string;
  apiKey: string;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: HoneycombRequestPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal);
  const headers = new Headers();
  headers.set("accept", "application/json");
  headers.set("user-agent", providerUserAgent);
  headers.set("x-honeycomb-team", input.apiKey);

  let body: string | undefined;
  if (input.body) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(input.body);
  }

  let response: Response;
  try {
    response = await input.fetcher(new URL(input.path, input.apiBaseUrl), {
      method: input.method,
      headers,
      body,
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Honeycomb request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Honeycomb request failed: ${error.message}` : "Honeycomb request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  const { payload, text } = await parseHoneycombResponse(response);
  if (!response.ok) {
    throw createHoneycombError({
      status: response.status,
      payload,
      fallbackMessage: text || response.statusText || "Honeycomb request failed",
      phase: input.phase,
    });
  }
  return payload;
}

async function parseHoneycombResponse(response: Response): Promise<{ payload: unknown; text: string }> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return { payload: null, text };
  }
  try {
    return { payload: JSON.parse(text) as unknown, text };
  } catch {
    return { payload: text, text };
  }
}

function createHoneycombError(input: {
  status: number;
  payload: unknown;
  fallbackMessage: string;
  phase: HoneycombRequestPhase;
}): ProviderRequestError {
  const message = extractHoneycombErrorMessage(input.payload) ?? input.fallbackMessage;
  if (input.status === 429) {
    return new ProviderRequestError(429, message, input.payload);
  }
  if (input.status === 401 || input.status === 403) {
    return new ProviderRequestError(input.phase === "validate" ? 400 : input.status, message, input.payload);
  }
  if (input.status === 400 || input.status === 404 || input.status === 422) {
    return new ProviderRequestError(400, message, input.payload);
  }
  return new ProviderRequestError(input.status >= 500 ? input.status : 502, message, input.payload);
}

function extractHoneycombErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.error) ?? optionalString(record.message) ?? optionalString(record.detail);
}

function normalizeAuthorization(payload: unknown): {
  id: string;
  type: string;
  apiKeyAccess: Record<string, unknown>;
  environment: { name: string; slug: string };
  team: { name: string; slug: string };
  raw: Record<string, unknown>;
} {
  const record = asRecord(payload);
  const environment = asRecord(record.environment);
  const team = asRecord(record.team);
  return {
    id: readString(record.id),
    type: readString(record.type),
    apiKeyAccess: asRecord(record.api_key_access),
    environment: {
      name: readString(environment.name),
      slug: readString(environment.slug),
    },
    team: {
      name: readString(team.name),
      slug: readString(team.slug),
    },
    raw: record,
  };
}

function normalizeDataset(payload: unknown): Record<string, unknown> {
  const record = asRecord(payload);
  return {
    name: readString(record.name),
    slug: readNullableString(record.slug),
    description: readNullableString(record.description),
    expandJsonDepth: readNullableInteger(record.expand_json_depth),
    regularColumnsCount: readNullableInteger(record.regular_columns_count),
    createdAt: readNullableString(record.created_at),
    lastWrittenAt: readNullableString(record.last_written_at),
    raw: record,
  };
}

function normalizeMarker(payload: unknown): Record<string, unknown> {
  const record = asRecord(payload);
  return {
    id: readNullableString(record.id),
    message: readNullableString(record.message),
    type: readNullableString(record.type),
    startTime: readNullableInteger(record.start_time),
    endTime: readNullableInteger(record.end_time),
    url: readNullableString(record.url),
    color: readNullableString(record.color),
    createdAt: readNullableString(record.created_at),
    updatedAt: readNullableString(record.updated_at),
    raw: record,
  };
}

function normalizeBoard(payload: unknown): Record<string, unknown> {
  const record = asRecord(payload);
  const links = asRecord(record.links);
  return {
    id: readNullableString(record.id),
    name: readString(record.name),
    description: readNullableString(record.description),
    type: readNullableString(record.type),
    boardUrl: readNullableString(links.board_url),
    tags: Array.isArray(record.tags) ? record.tags.filter(isRecord) : [],
    raw: record,
  };
}

function normalizeArray<T>(payload: unknown, normalizeItem: (item: unknown) => T): T[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Honeycomb response was not an array", payload);
  }
  return payload.map((item) => normalizeItem(item));
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNullableInteger(value: unknown): number | null {
  return optionalInteger(value) ?? null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return optionalRecord(value) !== undefined;
}

export function normalizeHoneycombApiBaseUrl(value: string | undefined): string {
  if (!value?.trim()) {
    return defaultHoneycombApiBaseUrl;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderRequestError(400, "apiBaseUrl must be a valid URL");
  }
  if (!allowedHoneycombApiOrigins.has(url.origin)) {
    throw new ProviderRequestError(400, "apiBaseUrl must be an official Honeycomb API URL");
  }
  return url.origin;
}
