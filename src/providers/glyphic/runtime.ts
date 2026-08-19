import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const glyphicApiBaseUrl = "https://api.glyphic.ai";

const glyphicRequestTimeoutMs = 30_000;

type GlyphicRequestMode = "validate" | "execute";
type GlyphicQueryValue = string | number | boolean | readonly string[] | null | undefined;
type GlyphicActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const glyphicActionHandlers: ProviderActionHandlers<"glyphic", GlyphicActionHandler> = {
  async list_calls(input, context) {
    const payload = await requestGlyphicJson(
      {
        method: "GET",
        path: "/v1/calls/",
        query: {
          participant_email: readOptionalString(input.participantEmail, "participantEmail"),
          start_time_from: readOptionalString(input.startTimeFrom, "startTimeFrom"),
          start_time_to: readOptionalString(input.startTimeTo, "startTimeTo"),
          title_filter: readOptionalString(input.titleFilter, "titleFilter"),
          tag_ids: readOptionalStringArray(input.tagIds, "tagIds"),
          cursor: readOptionalString(input.cursor, "cursor"),
          limit: readOptionalInteger(input.limit, "limit"),
          direction: readOptionalString(input.direction, "direction"),
        },
      },
      context,
      "execute",
    );
    const paginated = normalizePaginatedResponse(payload, "Glyphic calls response");
    return {
      calls: paginated.data,
      nextCursor: paginated.nextCursor,
      previousCursor: paginated.previousCursor,
      pagination: paginated.pagination,
      raw: paginated.raw,
    };
  },
  async get_call(input, context) {
    const call = await requestGlyphicObject(
      `/v1/calls/${encodeURIComponent(readRequiredString(input.callId, "callId"))}`,
      context,
      "Glyphic call response",
    );
    return { call, raw: call };
  },
  async get_call_media(input, context) {
    const media = await requestGlyphicObject(
      `/v1/calls/${encodeURIComponent(readRequiredString(input.callId, "callId"))}/media`,
      context,
      "Glyphic call media response",
    );
    return { media, raw: media };
  },
  async get_call_snippets(input, context) {
    const snippets = await requestGlyphicArray(
      `/v1/calls/${encodeURIComponent(readRequiredString(input.callId, "callId"))}/snippets`,
      context,
      "Glyphic call snippets response",
    );
    return { snippets, raw: snippets };
  },
  async list_call_tags(_input, context) {
    const tags = await requestGlyphicArray("/v1/call_tags/", context, "Glyphic call tags response");
    return { tags, raw: tags };
  },
  async list_playbooks(input, context) {
    const payload = await requestGlyphicJson(
      {
        method: "GET",
        path: "/v1/playbooks/",
        query: {
          cursor: readOptionalString(input.cursor, "cursor"),
          limit: readOptionalInteger(input.limit, "limit"),
          direction: readOptionalString(input.direction, "direction"),
        },
      },
      context,
      "execute",
    );
    const paginated = normalizePaginatedResponse(payload, "Glyphic playbooks response");
    return {
      playbooks: paginated.data,
      nextCursor: paginated.nextCursor,
      previousCursor: paginated.previousCursor,
      pagination: paginated.pagination,
      raw: paginated.raw,
    };
  },
  async get_playbook(input, context) {
    const playbook = await requestGlyphicObject(
      `/v1/playbooks/${encodeURIComponent(readRequiredString(input.playbookId, "playbookId"))}`,
      context,
      "Glyphic playbook response",
    );
    return { playbook, raw: playbook };
  },
  async list_playbook_versions(input, context) {
    const versions = await requestGlyphicArray(
      `/v1/playbooks/${encodeURIComponent(readRequiredString(input.playbookId, "playbookId"))}/versions`,
      context,
      "Glyphic playbook versions response",
    );
    return { versions, raw: versions };
  },
  async get_playbook_version(input, context) {
    const playbook = await requestGlyphicObject(
      `/v1/playbooks/${encodeURIComponent(
        readRequiredString(input.playbookId, "playbookId"),
      )}/versions/${encodeURIComponent(readRequiredString(input.versionId, "versionId"))}`,
      context,
      "Glyphic playbook version response",
    );
    return { playbook, raw: playbook };
  },
};

export async function validateGlyphicCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const result = await requestGlyphicJson(
    { method: "GET", path: "/v1/test/ping" },
    { apiKey, fetcher, signal },
    "validate",
  );

  return {
    profile: {
      accountId: "glyphic:organization",
      displayName: "Glyphic API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: glyphicApiBaseUrl,
      validationEndpoint: "/v1/test/ping",
      validationResult: typeof result === "string" ? result : undefined,
    }),
  };
}

async function requestGlyphicObject(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  label: string,
): Promise<Record<string, unknown>> {
  const payload = await requestGlyphicJson({ method: "GET", path }, context, "execute");
  return readResponseObject(payload, label);
}

async function requestGlyphicArray(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  label: string,
): Promise<Array<Record<string, unknown>>> {
  const payload = await requestGlyphicJson({ method: "GET", path }, context, "execute");
  return readResponseArray(payload, label);
}

async function requestGlyphicJson(
  input: {
    method: "GET";
    path: string;
    query?: Record<string, GlyphicQueryValue>;
  },
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  mode: GlyphicRequestMode,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, glyphicRequestTimeoutMs);
  try {
    const response = await context.fetcher(buildGlyphicUrl(input.path, input.query), {
      method: input.method,
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-API-Key": context.apiKey,
      },
      signal: timeout.signal,
    });
    if (!response.ok) {
      const errorPayload = await readGlyphicErrorPayload(response);
      throw mapGlyphicError(response.status, errorPayload, mode);
    }

    return readGlyphicJson(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, `Glyphic request timed out after ${glyphicRequestTimeoutMs / 1000} seconds`);
    }

    const message = error instanceof Error && error.message.trim() ? error.message : "request failed";
    throw new ProviderRequestError(502, `Glyphic request failed: ${message}`);
  } finally {
    timeout.cleanup();
  }
}

function buildGlyphicUrl(path: string, query: Record<string, GlyphicQueryValue> = {}): URL {
  const url = new URL(path, glyphicApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value == null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function readGlyphicJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Glyphic returned invalid JSON");
  }
}

async function readGlyphicErrorPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapGlyphicError(status: number, payload: unknown, mode: GlyphicRequestMode): ProviderRequestError {
  const message = extractGlyphicErrorMessage(payload) ?? `Glyphic request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : status, message, payload);
  }
  if (status === 404 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractGlyphicErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const object = asResponseObject(payload);
  if (!object) {
    return undefined;
  }

  for (const key of ["message", "error"]) {
    const value = optionalString(object[key]);
    if (value) {
      return value;
    }
  }

  const detail = object.detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail.trim();
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        const child = asResponseObject(item);
        return child ? optionalString(child.msg) : undefined;
      })
      .filter((item): item is string => Boolean(item));
    if (messages.length > 0) {
      return messages.join("; ");
    }
  }

  return undefined;
}

function normalizePaginatedResponse(
  payload: unknown,
  label: string,
): {
  data: Array<Record<string, unknown>>;
  nextCursor: string | null;
  previousCursor: string | null;
  pagination: Record<string, unknown>;
  raw: Record<string, unknown>;
} {
  const raw = readResponseObject(payload, label);
  const pagination = asResponseObject(raw.pagination) ?? {};
  return {
    data: readResponseArray(raw.data, `${label} data`),
    nextCursor: readNullableString(pagination.next_cursor),
    previousCursor: readNullableString(pagination.previous_cursor),
    pagination,
    raw,
  };
}

function readResponseObject(payload: unknown, label: string): Record<string, unknown> {
  const object = asResponseObject(payload);
  if (!object) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return object;
}

function readResponseArray(payload: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }
  return payload.map((item, index) => readResponseObject(item, `${label}[${index}]`));
}

function asResponseObject(payload: unknown): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  return payload as Record<string, unknown>;
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return optionalString(value) ?? null;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return trimmed;
}

function readOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value == null) {
    return undefined;
  }
  return readRequiredString(value, fieldName);
}

function readOptionalInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return value;
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item, index) => readRequiredString(item, `${fieldName}[${index}]`));
}
