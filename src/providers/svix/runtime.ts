import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const svixApiBaseUrl = "https://api.svix.com";
const svixApiPrefix = "/api/v1";
const svixValidationPath = `${svixApiPrefix}/app`;
const svixDefaultRequestTimeoutMs = 15_000;
const svixRegionalApiBaseUrlById: Record<string, string> = {
  us: "https://api.us.svix.com",
  eu: "https://api.eu.svix.com",
  ca: "https://api.ca.svix.com",
  au: "https://api.au.svix.com",
  in: "https://api.in.svix.com",
};

type SvixJsonObject = Record<string, unknown>;
type SvixQueryValue = string | number | boolean | null | undefined | Array<string | number | boolean>;

export interface SvixActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface SvixRequestOptions extends SvixActionContext {
  path: string;
  mode: "validate" | "execute";
  method?: string;
  query?: Record<string, SvixQueryValue>;
  body?: unknown;
}

type SvixActionHandler = ProviderRuntimeHandler<SvixActionContext>;

export const svixActionHandlers: ProviderActionHandlers<"svix", SvixActionHandler> = {
  async list_event_types(input, context) {
    const list = normalizeListPayload(
      await requestSvixJson({
        ...context,
        path: `${svixApiPrefix}/event-type`,
        query: compactObject({
          limit: readOptionalInteger(input.limit),
          iterator: optionalString(input.iterator),
          order: optionalString(input.order),
          include_archived: optionalBoolean(input.include_archived),
          with_content: optionalBoolean(input.with_content),
        }),
        mode: "execute",
      }),
      "Svix event types",
    );
    return { eventTypes: list.data, done: list.done, iterator: list.iterator, prevIterator: list.prevIterator };
  },
  async get_event_type(input, context) {
    return {
      eventType: await requestSvixJson({
        ...context,
        path: `${svixApiPrefix}/event-type/${encodeURIComponent(requireString(input.event_type_name, "event_type_name"))}`,
        query: compactObject({ with_content: optionalBoolean(input.with_content) }),
        mode: "execute",
      }),
    };
  },
  async create_event_type(input, context) {
    return {
      eventType: await requestSvixJson({
        ...context,
        path: `${svixApiPrefix}/event-type`,
        method: "POST",
        body: compactObject({
          name: requireString(input.name, "name"),
          description: requireString(input.description, "description"),
          archived: optionalBoolean(input.archived),
          groupName: optionalString(input.groupName),
          featureFlag: optionalString(input.featureFlag),
          featureFlags: readOptionalStringArray(input.featureFlags),
          schemas: readOptionalObjectRecord(input.schemas),
        }),
        mode: "execute",
      }),
    };
  },
  async list_applications(input, context) {
    const list = normalizeListPayload(
      await requestSvixJson({
        ...context,
        path: `${svixApiPrefix}/app`,
        query: compactObject({
          exclude_apps_with_no_endpoints: optionalBoolean(input.exclude_apps_with_no_endpoints),
          exclude_apps_with_disabled_endpoints: optionalBoolean(input.exclude_apps_with_disabled_endpoints),
          exclude_apps_with_svix_play_endpoints: optionalBoolean(input.exclude_apps_with_svix_play_endpoints),
          limit: readOptionalInteger(input.limit),
          iterator: optionalString(input.iterator),
          order: optionalString(input.order),
        }),
        mode: "execute",
      }),
      "Svix applications",
    );
    return { applications: list.data, done: list.done, iterator: list.iterator, prevIterator: list.prevIterator };
  },
  async get_application(input, context) {
    return {
      application: await requestSvixJson({
        ...context,
        path: `${svixApiPrefix}/app/${encodeURIComponent(requireString(input.app_id_or_uid, "app_id_or_uid"))}`,
        mode: "execute",
      }),
    };
  },
  async create_application(input, context) {
    return {
      application: await requestSvixJson({
        ...context,
        path: `${svixApiPrefix}/app`,
        method: "POST",
        body: compactObject({
          name: requireString(input.name, "name"),
          uid: optionalString(input.uid),
          metadata: readOptionalStringRecord(input.metadata),
          throttleRate: readOptionalInteger(input.throttleRate),
        }),
        mode: "execute",
      }),
    };
  },
  async update_application(input, context) {
    return {
      application: await requestSvixJson({
        ...context,
        path: `${svixApiPrefix}/app/${encodeURIComponent(requireString(input.app_id_or_uid, "app_id_or_uid"))}`,
        method: "PATCH",
        body: compactObject({
          name: optionalString(input.name),
          uid: optionalString(input.uid),
          metadata: readOptionalStringRecord(input.metadata),
          throttleRate: readOptionalInteger(input.throttleRate),
        }),
        mode: "execute",
      }),
    };
  },
  async delete_application(input, context) {
    await requestSvixNoContent({
      ...context,
      path: `${svixApiPrefix}/app/${encodeURIComponent(requireString(input.app_id_or_uid, "app_id_or_uid"))}`,
      method: "DELETE",
      mode: "execute",
    });
    return { success: true };
  },
  async list_endpoints(input, context) {
    const list = normalizeListPayload(
      await requestSvixJson({
        ...context,
        path: `${svixApiPrefix}/app/${encodeURIComponent(requireString(input.app_id_or_uid, "app_id_or_uid"))}/endpoint`,
        query: compactObject({
          limit: readOptionalInteger(input.limit),
          iterator: optionalString(input.iterator),
          order: optionalString(input.order),
        }),
        mode: "execute",
      }),
      "Svix endpoints",
    );
    return { endpoints: list.data, done: list.done, iterator: list.iterator, prevIterator: list.prevIterator };
  },
  async get_endpoint(input, context) {
    return {
      endpoint: await requestSvixJson({
        ...context,
        path: `${svixApiPrefix}/app/${encodeURIComponent(
          requireString(input.app_id_or_uid, "app_id_or_uid"),
        )}/endpoint/${encodeURIComponent(requireString(input.endpoint_id_or_uid, "endpoint_id_or_uid"))}`,
        mode: "execute",
      }),
    };
  },
  async create_endpoint(input, context) {
    return {
      endpoint: await requestSvixJson({
        ...context,
        path: `${svixApiPrefix}/app/${encodeURIComponent(requireString(input.app_id_or_uid, "app_id_or_uid"))}/endpoint`,
        method: "POST",
        body: compactObject({
          url: requireString(input.url, "url"),
          uid: optionalString(input.uid),
          description: optionalString(input.description),
          disabled: optionalBoolean(input.disabled),
          channels: readOptionalStringArray(input.channels),
          filterTypes: readOptionalStringArray(input.filterTypes),
          headers: readOptionalStringRecord(input.headers),
          metadata: readOptionalStringRecord(input.metadata),
          secret: optionalString(input.secret),
          throttleRate: readOptionalInteger(input.throttleRate),
        }),
        mode: "execute",
      }),
    };
  },
  async update_endpoint(input, context) {
    return {
      endpoint: await requestSvixJson({
        ...context,
        path: `${svixApiPrefix}/app/${encodeURIComponent(
          requireString(input.app_id_or_uid, "app_id_or_uid"),
        )}/endpoint/${encodeURIComponent(requireString(input.endpoint_id_or_uid, "endpoint_id_or_uid"))}`,
        method: "PATCH",
        body: compactObject({
          url: optionalString(input.url),
          uid: optionalString(input.uid),
          description: optionalString(input.description),
          disabled: optionalBoolean(input.disabled),
          channels: readOptionalStringArray(input.channels),
          filterTypes: readOptionalStringArray(input.filterTypes),
          metadata: readOptionalStringRecord(input.metadata),
          throttleRate: readOptionalInteger(input.throttleRate),
        }),
        mode: "execute",
      }),
    };
  },
  async delete_endpoint(input, context) {
    await requestSvixNoContent({
      ...context,
      path: `${svixApiPrefix}/app/${encodeURIComponent(
        requireString(input.app_id_or_uid, "app_id_or_uid"),
      )}/endpoint/${encodeURIComponent(requireString(input.endpoint_id_or_uid, "endpoint_id_or_uid"))}`,
      method: "DELETE",
      mode: "execute",
    });
    return { success: true };
  },
  async list_messages(input, context) {
    const list = normalizeListPayload(
      await requestSvixJson({
        ...context,
        path: `${svixApiPrefix}/app/${encodeURIComponent(requireString(input.app_id_or_uid, "app_id_or_uid"))}/msg`,
        query: compactObject({
          limit: readOptionalInteger(input.limit),
          iterator: optionalString(input.iterator),
          channel: optionalString(input.channel),
          before: optionalString(input.before),
          after: optionalString(input.after),
          with_content: optionalBoolean(input.with_content),
          tag: optionalString(input.tag),
          event_types: readOptionalStringArray(input.event_types),
        }),
        mode: "execute",
      }),
      "Svix messages",
    );
    return { messages: list.data, done: list.done, iterator: list.iterator, prevIterator: list.prevIterator };
  },
  async get_message(input, context) {
    return {
      message: await requestSvixJson({
        ...context,
        path: `${svixApiPrefix}/app/${encodeURIComponent(
          requireString(input.app_id_or_uid, "app_id_or_uid"),
        )}/msg/${encodeURIComponent(requireString(input.message_id_or_uid, "message_id_or_uid"))}`,
        query: compactObject({ with_content: optionalBoolean(input.with_content) }),
        mode: "execute",
      }),
    };
  },
  async create_message(input, context) {
    return {
      message: await requestSvixJson({
        ...context,
        path: `${svixApiPrefix}/app/${encodeURIComponent(requireString(input.app_id_or_uid, "app_id_or_uid"))}/msg`,
        method: "POST",
        query: compactObject({ with_content: optionalBoolean(input.with_content) }),
        body: compactObject({
          eventType: requireString(input.eventType, "eventType"),
          payload: requireObject(input.payload, "payload"),
          channels: readOptionalStringArray(input.channels),
          deliverAt: optionalString(input.deliverAt),
          eventId: optionalString(input.eventId),
          payloadRetentionHours: readOptionalInteger(input.payloadRetentionHours),
          payloadRetentionPeriod: readOptionalInteger(input.payloadRetentionPeriod),
          tags: readOptionalStringArray(input.tags),
        }),
        mode: "execute",
      }),
    };
  },
};

export async function validateSvixCredential(
  input: { apiKey: string; serverUrl?: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const baseUrl = getSvixBaseUrl({ apiKey: input.apiKey, serverUrl: input.serverUrl });
  const payload = await requestSvixJson({
    apiKey: input.apiKey,
    baseUrl,
    path: svixValidationPath,
    query: { limit: 1 },
    fetcher,
    signal,
    mode: "validate",
  });
  const list = normalizeListPayload(payload, "Svix applications");
  const firstApplication = optionalRecord(list.data[0]);
  return {
    profile: {
      accountId: "svix",
      displayName: "Svix API Key",
    },
    grantedScopes: [],
    metadata: {
      serverUrl: optionalString(input.serverUrl),
      validationEndpoint: svixValidationPath,
      firstApplicationId: optionalString(firstApplication?.id),
      firstApplicationName: optionalString(firstApplication?.name),
    },
  };
}

async function requestSvixJson(input: SvixRequestOptions): Promise<SvixJsonObject> {
  const response = await svixFetch(input);
  const payload = await parseSvixJson(response);
  if (!response.ok) throw toSvixError(response, payload, input.mode);
  return payload;
}

async function requestSvixNoContent(input: SvixRequestOptions): Promise<Response> {
  const response = await svixFetch(input);
  const raw = await readResponseBody(response);
  if (!response.ok) {
    const payload = raw.trim() === "" ? {} : parseSvixBody(raw);
    throw toSvixError(response, payload, input.mode);
  }
  return response;
}

async function svixFetch(input: SvixRequestOptions): Promise<Response> {
  const url = new URL(input.path.startsWith("/") ? `${input.baseUrl}${input.path}` : `${input.baseUrl}/${input.path}`);
  const method = input.method ?? "GET";
  const timeout = createProviderTimeout(input.signal, svixDefaultRequestTimeoutMs);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    return await input.fetcher(url, {
      method,
      headers: svixHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(
      timeout.didTimeout() || isAbortLikeError(error) ? 504 : 502,
      `Svix request failed for ${method} ${url.toString()}: ${message}`,
    );
  } finally {
    timeout.cleanup();
  }
}

function svixHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    ...(hasBody ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
  };
}

async function parseSvixJson(response: Response): Promise<SvixJsonObject> {
  const raw = await readResponseBody(response);
  if (raw.trim() === "") throw new ProviderRequestError(502, "Svix returned an empty response body");
  return parseSvixBody(raw);
}

async function readResponseBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Failed to read Svix response body: ${error.message}`
        : "Failed to read Svix response body",
    );
  }
}

function parseSvixBody(raw: string): SvixJsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProviderRequestError(502, "Svix returned invalid JSON");
  }
  const payload = optionalRecord(parsed);
  if (!payload) throw new ProviderRequestError(502, "Svix returned a non-object JSON payload");
  return payload;
}

function toSvixError(
  response: Response,
  payload: SvixJsonObject,
  mode: SvixRequestOptions["mode"],
): ProviderRequestError {
  const message = extractSvixErrorMessage(payload) ?? `Svix request failed with status ${response.status}`;
  if (response.status === 401) return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  if (response.status === 404 || response.status === 409)
    return new ProviderRequestError(response.status, message, payload);
  if ([400, 403, 413, 422].includes(response.status)) return new ProviderRequestError(400, message, payload);
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function extractSvixErrorMessage(payload: SvixJsonObject): string | undefined {
  if (typeof payload.detail === "string" && payload.detail) return payload.detail;
  if (Array.isArray(payload.detail) && payload.detail.length > 0) {
    const first = payload.detail[0];
    if (typeof first === "string" && first) return first;
    const firstObject = optionalRecord(first);
    const message = optionalString(firstObject?.msg);
    if (message) return message;
  }
  return optionalString(payload.code);
}

function normalizeListPayload(payload: SvixJsonObject, label: string) {
  if (!Array.isArray(payload.data)) throw new ProviderRequestError(502, `${label} response is missing data`);
  if (typeof payload.done !== "boolean") throw new ProviderRequestError(502, `${label} response is missing done`);
  const iterator = payload.iterator;
  const prevIterator = payload.prevIterator;
  if (iterator !== null && iterator !== undefined && typeof iterator !== "string") {
    throw new ProviderRequestError(502, `${label} response has invalid iterator`);
  }
  if (prevIterator !== null && prevIterator !== undefined && typeof prevIterator !== "string") {
    throw new ProviderRequestError(502, `${label} response has invalid prevIterator`);
  }
  return {
    data: payload.data,
    done: payload.done,
    iterator: typeof iterator === "string" ? iterator : null,
    prevIterator: typeof prevIterator === "string" ? prevIterator : null,
  };
}

function requireString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new ProviderRequestError(400, `${fieldName} is required`);
  return parsed;
}

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  const parsed = optionalRecord(value);
  if (!parsed) throw new ProviderRequestError(400, `${fieldName} must be an object`);
  return parsed;
}

export function getSvixBaseUrl(input: { apiKey: string; serverUrl?: string }): string {
  const serverUrl = optionalString(input.serverUrl);
  if (serverUrl) return normalizeSvixBaseUrl(serverUrl);
  const regionId = input.apiKey.split(".")[1];
  return regionId && svixRegionalApiBaseUrlById[regionId] ? svixRegionalApiBaseUrlById[regionId] : svixApiBaseUrl;
}

function normalizeSvixBaseUrl(value: string): string {
  const url = assertPublicHttpUrl(value, {
    fieldName: "serverUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "svix serverUrl must use https");
  }
  let normalizedPath = url.pathname;
  while (normalizedPath.length > 1 && normalizedPath.endsWith("/")) normalizedPath = normalizedPath.slice(0, -1);
  if (normalizedPath === svixApiPrefix) normalizedPath = "";
  else if (normalizedPath.endsWith(svixApiPrefix)) normalizedPath = normalizedPath.slice(0, -svixApiPrefix.length);
  return normalizedPath ? `${url.origin}${normalizedPath}` : url.origin;
}

function readOptionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.map((item) => optionalString(item)).filter((item): item is string => item !== undefined);
  return strings.length === value.length ? strings : undefined;
}

function readOptionalStringRecord(value: unknown): Record<string, string> | undefined {
  const record = optionalRecord(value);
  if (!record) return undefined;
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, item]) => [key, optionalString(item)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== undefined),
  );
}

function readOptionalObjectRecord(value: unknown): Record<string, Record<string, unknown>> | undefined {
  const record = optionalRecord(value);
  if (!record) return undefined;
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, item]) => [key, optionalRecord(item)] as const)
      .filter((entry): entry is readonly [string, Record<string, unknown>] => entry[1] !== undefined),
  );
}
