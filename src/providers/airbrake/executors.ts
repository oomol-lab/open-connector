import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "airbrake";
const airbrakeApiBaseUrl = "https://api.airbrake.io";
const airbrakeRequestTimeoutMs = 30_000;

type AirbrakeRequestPhase = "validate" | "execute";
type AirbrakeQueryValue = string | number | boolean | undefined;
type AirbrakeActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface AirbrakeRequestInput {
  path: string;
  apiKey: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: AirbrakeRequestPhase;
  method?: string;
  query?: Record<string, AirbrakeQueryValue>;
  body?: Record<string, unknown>;
}

interface NormalizedProject {
  id: number | null;
  name: string | null;
  raw: Record<string, unknown>;
}

interface NormalizedDeploy {
  id: number | null;
  environment: string | null;
  username: string | null;
  revision: string | null;
  version: string | null;
  raw: Record<string, unknown>;
}

interface NormalizedGroup {
  id: number | null;
  errorClass: string | null;
  errorMessage: string | null;
  noticeCount: number | null;
  lastNoticeAt: string | null;
  raw: Record<string, unknown>;
}

interface NormalizedNotice {
  id: string | null;
  message: string | null;
  createdAt: string | null;
  raw: Record<string, unknown>;
}

interface AirbrakeListResponse<T> {
  items: T[];
  count: number | null;
  page: number | null;
  raw: Record<string, unknown>;
}

export const airbrakeActionHandlers: ProviderActionHandlers<"airbrake", AirbrakeActionHandler> = {
  async list_projects(input, context) {
    const payload = await requestAirbrakeForAction(context, "/api/v4/projects", {
      page: readOptionalInteger(input.page, "page"),
      limit: readOptionalInteger(input.limit, "limit"),
    });
    const normalized = normalizeListResponse(payload, "projects", normalizeProject);
    return {
      projects: normalized.items,
      count: normalized.count,
      page: normalized.page,
      raw: normalized.raw,
    };
  },

  async get_project(input, context) {
    const payload = await requestAirbrakeForAction(
      context,
      `/api/v4/projects/${readRequiredInteger(input.projectId, "projectId")}`,
    );
    return {
      project: normalizeProject(readWrappedObject(payload, "project")),
      raw: ensureObject(payload, "Airbrake project response"),
    };
  },

  async list_deploys(input, context) {
    const payload = await requestAirbrakeForAction(
      context,
      `/api/v4/projects/${readRequiredInteger(input.projectId, "projectId")}/deploys`,
      {
        page: readOptionalInteger(input.page, "page"),
        limit: readOptionalInteger(input.limit, "limit"),
      },
    );
    const normalized = normalizeListResponse(payload, "deploys", normalizeDeploy);
    return {
      deploys: normalized.items,
      count: normalized.count,
      page: normalized.page,
      raw: normalized.raw,
    };
  },

  async get_deploy(input, context) {
    const payload = await requestAirbrakeForAction(
      context,
      `/api/v4/projects/${readRequiredInteger(input.projectId, "projectId")}/deploys/${readRequiredInteger(input.deployId, "deployId")}`,
    );
    return {
      deploy: normalizeDeploy(readWrappedObject(payload, "deploy")),
      raw: ensureObject(payload, "Airbrake deploy response"),
    };
  },

  async list_groups(input, context) {
    const payload = await requestAirbrakeForAction(
      context,
      `/api/v4/projects/${readRequiredInteger(input.projectId, "projectId")}/groups`,
      {
        page: readOptionalInteger(input.page, "page"),
        limit: readOptionalInteger(input.limit, "limit"),
        deploy_id: readOptionalInteger(input.deployId, "deployId"),
        archived: readOptionalBoolean(input.archived, "archived"),
        muted: readOptionalBoolean(input.muted, "muted"),
        start_time: optionalString(input.startTime),
        end_time: optionalString(input.endTime),
        order: readOptionalGroupOrder(input.order),
      },
    );
    const normalized = normalizeListResponse(payload, "groups", normalizeGroup);
    return {
      groups: normalized.items,
      count: normalized.count,
      page: normalized.page,
      raw: normalized.raw,
    };
  },

  async get_group(input, context) {
    const payload = await requestAirbrakeForAction(
      context,
      `/api/v4/projects/${readRequiredInteger(input.projectId, "projectId")}/groups/${readRequiredInteger(input.groupId, "groupId")}`,
    );
    return {
      group: normalizeGroup(readWrappedObject(payload, "group")),
      raw: ensureObject(payload, "Airbrake group response"),
    };
  },

  async list_notices(input, context) {
    const payload = await requestAirbrakeForAction(
      context,
      `/api/v4/projects/${readRequiredInteger(input.projectId, "projectId")}/groups/${readRequiredInteger(input.groupId, "groupId")}/notices`,
      {
        page: readOptionalInteger(input.page, "page"),
        limit: readOptionalInteger(input.limit, "limit"),
        version: optionalString(input.version),
      },
    );
    const normalized = normalizeListResponse(payload, "notices", normalizeNotice);
    return {
      notices: normalized.items,
      count: normalized.count,
      page: normalized.page,
      raw: normalized.raw,
    };
  },

  async get_notice_status(input, context) {
    const noticeUuid = encodeURIComponent(requiredString(input.noticeUuid, "noticeUuid", providerInputError));
    const payload = await requestAirbrakeForAction(
      context,
      `/api/v4/projects/${readRequiredInteger(input.projectId, "projectId")}/notice-status/${noticeUuid}`,
    );
    const raw = ensureObject(payload, "Airbrake notice status response");
    return {
      status: readString(raw, "status"),
      groupId: readInteger(raw, "groupId", "group_id"),
      message: readString(raw, "message", "error"),
      raw,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, airbrakeActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: airbrakeApiBaseUrl,
  auth: { type: "api_key_query", name: "key" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await requestAirbrake({
      path: "/api/v4/projects",
      query: { limit: 1 },
      apiKey: input.apiKey,
      context: {
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const normalized = normalizeListResponse(payload, "projects", normalizeProject);
    const firstProject = normalized.items[0];
    return {
      profile: {
        accountId: firstProject?.id == null ? "airbrake-api-key" : String(firstProject.id),
        displayName: firstProject?.name ? `Airbrake: ${firstProject.name}` : "Airbrake API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: airbrakeApiBaseUrl,
        validationEndpoint: "/api/v4/projects",
        projectCount: normalized.count,
        firstProjectId: firstProject?.id ?? undefined,
        firstProjectName: firstProject?.name ?? undefined,
      }),
    };
  },
};

function requestAirbrakeForAction(
  context: ApiKeyProviderContext,
  path: string,
  query?: Record<string, AirbrakeQueryValue>,
): Promise<unknown> {
  return requestAirbrake({
    path,
    query,
    apiKey: context.apiKey,
    context,
    phase: "execute",
  });
}

async function requestAirbrake(input: AirbrakeRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, airbrakeRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(buildAirbrakeUrl(input.path, input.apiKey, input.query ?? {}), {
      method: input.method ?? "GET",
      headers: buildAirbrakeHeaders(input.body !== undefined),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readAirbrakePayload(response);
    if (!response.ok) {
      throw createAirbrakeError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(502, "Airbrake request timed out");
    }
    throw new ProviderRequestError(502, "Airbrake request failed");
  } finally {
    timeout.cleanup();
  }
}

function buildAirbrakeUrl(path: string, apiKey: string, query: Record<string, AirbrakeQueryValue>): string {
  const url = new URL(path, airbrakeApiBaseUrl);
  url.searchParams.set("key", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function buildAirbrakeHeaders(hasBody: boolean): Record<string, string> {
  const headers = compactObject({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "content-type": hasBody ? "application/json" : undefined,
  });
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]));
}

async function readAirbrakePayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return {};
  }

  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createAirbrakeError(status: number, payload: unknown, phase: AirbrakeRequestPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Airbrake request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(status >= 400 ? status : 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed || undefined;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = readString(record, "message", "error");
  if (message) {
    return message;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    return errors.map((error) => String(error)).join(", ");
  }

  return undefined;
}

function normalizeListResponse<T>(
  payload: unknown,
  collectionName: string,
  normalize: (record: Record<string, unknown>) => T,
): AirbrakeListResponse<T> {
  const raw = ensureObject(payload, `Airbrake ${collectionName} response`);
  const collection = Array.isArray(raw[collectionName]) ? raw[collectionName] : [];
  return {
    items: collection.map((item) => normalize(ensureObject(item, `Airbrake ${collectionName} item`))),
    count: readInteger(raw, "count"),
    page: readInteger(raw, "page"),
    raw,
  };
}

function readWrappedObject(payload: unknown, propertyName: string): Record<string, unknown> {
  const raw = ensureObject(payload, `Airbrake ${propertyName} response`);
  return ensureObject(raw[propertyName] ?? raw, `Airbrake ${propertyName}`);
}

function ensureObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} was not an object`, value);
  }
  return record;
}

function normalizeProject(raw: Record<string, unknown>): NormalizedProject {
  return {
    id: readInteger(raw, "id"),
    name: readString(raw, "name"),
    raw,
  };
}

function normalizeDeploy(raw: Record<string, unknown>): NormalizedDeploy {
  return {
    id: readInteger(raw, "id"),
    environment: readString(raw, "environment"),
    username: readString(raw, "username"),
    revision: readString(raw, "revision"),
    version: readString(raw, "version"),
    raw,
  };
}

function normalizeGroup(raw: Record<string, unknown>): NormalizedGroup {
  return {
    id: readInteger(raw, "id"),
    errorClass: readString(raw, "errorClass", "error_class"),
    errorMessage: readString(raw, "errorMessage", "error_message", "message"),
    noticeCount: readInteger(raw, "noticeCount", "notice_count"),
    lastNoticeAt: readString(raw, "lastNoticeAt", "last_notice_at"),
    raw,
  };
}

function normalizeNotice(raw: Record<string, unknown>): NormalizedNotice {
  const id = readString(raw, "id", "uuid");
  const integerId = readInteger(raw, "id");
  return {
    id: id ?? (integerId == null ? null : String(integerId)),
    message: readString(raw, "message", "error_message"),
    createdAt: readString(raw, "createdAt", "created_at"),
    raw,
  };
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = optionalString(record[key]);
    if (value != null) {
      return value;
    }
  }
  return null;
}

function readInteger(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const numberValue = optionalNumber(record[key]);
    if (typeof numberValue == "number" && Number.isInteger(numberValue)) {
      return numberValue;
    }

    const stringValue = optionalString(record[key]);
    if (stringValue != null) {
      const parsed = Number(stringValue);
      if (Number.isInteger(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function readOptionalInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = readOptionalInteger(value, fieldName);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} must be a boolean`);
}

function readOptionalGroupOrder(value: unknown): string | undefined {
  const order = optionalString(value);
  if (order === undefined) {
    return undefined;
  }
  if (order === "last_notice" || order === "notice_count" || order === "weight" || order === "created") {
    return order;
  }
  throw new ProviderRequestError(400, "order must be last_notice, notice_count, weight, or created");
}
