import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { FomoActionName } from "./actions.ts";

import { compactObject } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const fomoApiBaseUrl = "https://api.fomo.com/api/v1";
const fomoEventsPath = "/applications/me/events";
const fomoRequestTimeoutMs = 30_000;

type FomoRequestMode = "validate" | "execute";
type FomoEventPayload = Record<string, unknown>;

export const fomoActionHandlers: Record<FomoActionName, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async list_events(input, context) {
    const page = readOptionalPositiveInteger(input.page);
    const perPage = readOptionalPositiveInteger(input.per_page);
    const payload = await requestFomoJson(
      {
        path: fomoEventsPath,
        method: "GET",
        apiKey: context.apiKey,
        query: compactObject({
          show_meta: "true",
          per_page: perPage === undefined ? undefined : String(perPage),
          page: page === undefined ? undefined : String(page),
          order_by: readOptionalString(input.order_by),
          order_direction: readOptionalString(input.order_direction),
        }),
        mode: "execute",
        signal: context.signal,
      },
      context.fetcher,
    );
    return normalizeEventListPayload(payload, { page, per_page: perPage });
  },
  async get_event(input, context) {
    const payload = await requestFomoJson(
      {
        path: `${fomoEventsPath}/${encodeURIComponent(readEventId(input.id))}`,
        method: "GET",
        apiKey: context.apiKey,
        mode: "execute",
        signal: context.signal,
      },
      context.fetcher,
    );
    return { event: normalizeEvent(readEventPayload(payload)) };
  },
  async create_event(input, context) {
    validateCreateEventInput(input);
    const payload = await requestFomoJson(
      {
        path: fomoEventsPath,
        method: "POST",
        apiKey: context.apiKey,
        body: { event: buildEventBody(input) },
        mode: "execute",
        signal: context.signal,
      },
      context.fetcher,
    );
    return { event: normalizeEvent(readEventPayload(payload)) };
  },
  async update_event(input, context) {
    validateUpdateEventInput(input);
    const payload = await requestFomoJson(
      {
        path: `${fomoEventsPath}/${encodeURIComponent(readEventId(input.id))}`,
        method: "PATCH",
        apiKey: context.apiKey,
        body: { event: buildEventBody(input) },
        mode: "execute",
        signal: context.signal,
      },
      context.fetcher,
    );
    return { event: normalizeEvent(readEventPayload(payload)) };
  },
  async delete_event(input, context) {
    const payload = await requestFomoJson(
      {
        path: `${fomoEventsPath}/${encodeURIComponent(readEventId(input.id))}`,
        method: "DELETE",
        apiKey: context.apiKey,
        mode: "execute",
        signal: context.signal,
      },
      context.fetcher,
    );
    return normalizeDeletePayload(payload);
  },
};

export async function validateFomoCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await requestFomoJson(
    {
      path: fomoEventsPath,
      method: "GET",
      apiKey,
      query: {
        show_meta: "true",
        per_page: "1",
        page: "1",
      },
      mode: "validate",
      signal,
    },
    fetcher,
  );
  const list = normalizeEventListPayload(payload, { page: 1, per_page: 1 });

  return {
    profile: {
      accountId: "fomo:site-token",
      displayName: "Fomo site token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: fomoApiBaseUrl,
      validationEndpoint: fomoEventsPath,
      eventCount: list.meta.total_count,
    },
  };
}

async function requestFomoJson(
  input: {
    path: string;
    method: "GET" | "POST" | "PATCH" | "DELETE";
    apiKey: string;
    query?: Record<string, string | undefined>;
    body?: Record<string, unknown>;
    mode: FomoRequestMode;
    signal?: AbortSignal;
  },
  fetcher: typeof fetch,
): Promise<unknown> {
  const url = new URL(`${fomoApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(input.signal, fomoRequestTimeoutMs);
  try {
    const response = await fetcher(url, {
      method: input.method,
      headers: buildFomoHeaders(input.apiKey, input.body !== undefined),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readFomoPayload(response);
    if (!response.ok) {
      throw mapFomoError(response.status, payload, input.mode);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      timeout.didTimeout() || isAbortLikeError(error) ? 504 : 502,
      timeout.didTimeout()
        ? "Fomo API request timed out"
        : error instanceof Error
          ? error.message
          : "Fomo API request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildFomoHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    authorization: `Token ${apiKey}`,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readFomoPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Fomo returned a non-JSON response");
  }
}

function mapFomoError(status: number, payload: unknown, mode: FomoRequestMode): ProviderRequestError {
  const message = readFomoErrorMessage(payload) ?? `Fomo API request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }
  if (status === 400 || status === 403 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function readFomoErrorMessage(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }
  for (const key of ["error", "message", "errors"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeEventListPayload(
  payload: unknown,
  requested: { page?: number; per_page?: number },
): {
  events: Array<ReturnType<typeof normalizeEvent>>;
  meta: { per_page: number; page: number; total_count: number; total_pages: number };
  raw: Record<string, unknown>;
} {
  if (Array.isArray(payload)) {
    return {
      events: payload.filter(isRecord).map(normalizeEvent),
      meta: {
        per_page: requested.per_page ?? payload.length,
        page: requested.page ?? 1,
        total_count: payload.length,
        total_pages: 1,
      },
      raw: {
        events: payload,
      },
    };
  }

  if (!isRecord(payload)) {
    throw new ProviderRequestError(502, "Fomo returned an invalid event list", payload);
  }

  const eventPayloads = Array.isArray(payload.events) ? payload.events.filter(isRecord) : [];
  return {
    events: eventPayloads.map(normalizeEvent),
    meta: normalizeMeta(payload.meta, {
      page: requested.page,
      per_page: requested.per_page,
      eventCount: eventPayloads.length,
    }),
    raw: payload,
  };
}

function normalizeMeta(
  value: unknown,
  fallback: { page?: number; per_page?: number; eventCount: number },
): { per_page: number; page: number; total_count: number; total_pages: number } {
  const meta = isRecord(value) ? value : {};
  const perPage = readOptionalInteger(meta.per_page) ?? fallback.per_page ?? fallback.eventCount;
  const page = readOptionalInteger(meta.page) ?? fallback.page ?? 1;
  const totalCount = readOptionalInteger(meta.total_count) ?? fallback.eventCount;
  const totalPages = readOptionalInteger(meta.total_pages) ?? (perPage > 0 ? Math.ceil(totalCount / perPage) : 1);

  return {
    per_page: perPage,
    page,
    total_count: totalCount,
    total_pages: totalPages,
  };
}

function readEventPayload(payload: unknown): FomoEventPayload {
  if (!isRecord(payload)) {
    throw new ProviderRequestError(502, "Fomo returned an invalid event payload", payload);
  }
  if (isRecord(payload.event)) {
    return payload.event;
  }
  return payload;
}

function normalizeEvent(event: FomoEventPayload): Record<string, unknown> {
  return {
    id: readId(event.id),
    event_type_id: readId(event.event_type_id),
    event_type_tag: readNullableString(event.event_type_tag),
    url: readNullableString(event.url),
    first_name: readNullableString(event.first_name),
    email_address: readNullableString(event.email_address),
    ip_address: readNullableString(event.ip_address),
    city: readNullableString(event.city),
    province: readNullableString(event.province),
    country: readNullableString(event.country),
    title: readNullableString(event.title),
    external_id: readNullableString(event.external_id),
    image_url: readNullableString(event.image_url),
    message: readNullableString(event.message),
    link: readNullableString(event.link),
    created_at: readNullableString(event.created_at),
    created_at_to_seconds_from_epoch: readNullableNumber(event.created_at_to_seconds_from_epoch),
    custom_event_fields_attributes: readCustomEventFields(event.custom_event_fields_attributes),
    raw: event,
  };
}

function normalizeDeletePayload(payload: unknown): Record<string, unknown> {
  const raw = isRecord(payload) ? payload : {};
  return {
    message: readNullableString(raw.message),
    raw,
  };
}

function buildEventBody(input: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of [
    "event_type_id",
    "event_type_tag",
    "url",
    "first_name",
    "email_address",
    "ip_address",
    "city",
    "province",
    "country",
    "title",
    "external_id",
    "image_url",
    "created_at",
    "custom_event_fields_attributes",
  ]) {
    if (input[key] !== undefined) {
      body[key] = input[key];
    }
  }
  return body;
}

function validateCreateEventInput(input: Record<string, unknown>): void {
  const hasEventTypeId = input.event_type_id !== undefined;
  const hasEventTypeTag = input.event_type_tag !== undefined;
  if (hasEventTypeId === hasEventTypeTag) {
    throw new ProviderRequestError(400, "Exactly one of event_type_id or event_type_tag is required.");
  }
}

function validateUpdateEventInput(input: Record<string, unknown>): void {
  if (input.event_type_id !== undefined && input.event_type_tag !== undefined) {
    throw new ProviderRequestError(400, "Only one of event_type_id or event_type_tag can be provided.");
  }
}

function readEventId(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  throw new ProviderRequestError(400, "id is required");
}

function readId(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readOptionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function readOptionalPositiveInteger(value: unknown): number | undefined {
  const integer = readOptionalInteger(value);
  return integer !== undefined && integer > 0 ? integer : undefined;
}

function readCustomEventFields(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
