import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { NylasActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

type NylasActionContext = ApiKeyProviderContext;
type NylasPhase = "validate" | "execute";
type NylasActionHandler = (input: Record<string, unknown>, context: NylasActionContext) => Promise<unknown>;

interface NylasRequestOptions {
  path: string;
  params?: Record<string, string | undefined>;
  context: NylasActionContext;
  phase: NylasPhase;
}

export const nylasApiBaseUrl = "https://api.us.nylas.com/v3";
const nylasDefaultRequestTimeoutMs = 30_000;

export const nylasActionHandlers: Record<NylasActionName, NylasActionHandler> = {
  async list_grants(input, context) {
    const payload = await requestNylasJson({
      path: "/grants",
      params: compactObject({
        limit: readOptionalNumberString(input.limit),
        offset: readOptionalNumberString(input.offset),
        email: optionalString(input.email),
        provider: optionalString(input.provider),
        grant_status: optionalString(input.grantStatus),
        workspace_id: optionalString(input.workspaceId),
        since: readOptionalNumberString(input.since),
        before: readOptionalNumberString(input.before),
        order_by: optionalString(input.orderBy),
        sort_by: optionalString(input.sortBy),
      }),
      context,
      phase: "execute",
    });

    return {
      requestId: readNullableString(payload.request_id),
      grants: normalizeGrantList(payload.data),
      limit: readNullableNumber(payload.limit),
      offset: readNullableNumber(payload.offset),
      raw: payload,
    };
  },
  async get_grant(input, context) {
    const grantId = requiredInputString(input.grantId, "grantId");
    const payload = await requestNylasJson({
      path: `/grants/${encodePathSegment(grantId)}`,
      params: compactObject({
        expose_aliases: readOptionalBooleanString(input.exposeAliases),
      }),
      context,
      phase: "execute",
    });

    return {
      requestId: readNullableString(payload.request_id),
      grant: normalizeGrant(payload.data),
      raw: payload,
    };
  },
  async list_calendars(input, context) {
    const grantId = requiredInputString(input.grantId, "grantId");
    const payload = await requestNylasJson({
      path: `/grants/${encodePathSegment(grantId)}/calendars`,
      params: compactObject({
        limit: readOptionalNumberString(input.limit),
        page_token: optionalString(input.pageToken),
        select: optionalString(input.select),
      }),
      context,
      phase: "execute",
    });

    return {
      requestId: readNullableString(payload.request_id),
      calendars: normalizeCalendarList(payload.data),
      nextCursor: readNullableString(payload.next_cursor),
      raw: payload,
    };
  },
  async list_events(input, context) {
    const grantId = requiredInputString(input.grantId, "grantId");
    const payload = await requestNylasJson({
      path: `/grants/${encodePathSegment(grantId)}/events`,
      params: compactObject({
        calendar_id: requiredInputString(input.calendarId, "calendarId"),
        limit: readOptionalNumberString(input.limit),
        page_token: optionalString(input.pageToken),
        start: readOptionalNumberString(input.start),
        end: readOptionalNumberString(input.end),
        title: optionalString(input.title),
        description: optionalString(input.description),
        location: optionalString(input.location),
        show_cancelled: readOptionalBooleanString(input.showCancelled),
        tentative_as_busy: readOptionalBooleanString(input.tentativeAsBusy),
        updated_after: readOptionalNumberString(input.updatedAfter),
        updated_before: readOptionalNumberString(input.updatedBefore),
        select: optionalString(input.select),
      }),
      context,
      phase: "execute",
    });

    return {
      requestId: readNullableString(payload.request_id),
      events: normalizeEventList(payload.data),
      nextCursor: readNullableString(payload.next_cursor),
      raw: payload,
    };
  },
};

export async function validateNylasCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestNylasJson({
    path: "/grants",
    params: { limit: "1" },
    context: {
      apiKey,
      fetcher,
      signal,
    },
    phase: "validate",
  });
  const grants = normalizeGrantList(payload.data);
  const firstGrant = grants[0];
  const firstGrantId = optionalString(firstGrant?.id);
  const firstGrantProvider = optionalString(firstGrant?.provider);
  const firstGrantEmail = optionalString(firstGrant?.email);
  const firstGrantName = optionalString(firstGrant?.name);

  return {
    profile: {
      accountId: firstGrantId ? `nylas:grant:${firstGrantId}` : "nylas-api-key",
      displayName: firstGrantEmail ?? firstGrantName ?? "Nylas API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: nylasApiBaseUrl,
      validationEndpoint: "/grants",
      firstGrantId,
      firstGrantProvider,
      firstGrantEmail,
      limit: readNullableNumber(payload.limit) ?? undefined,
      offset: readNullableNumber(payload.offset) ?? undefined,
    }),
  };
}

async function requestNylasJson(options: NylasRequestOptions): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(options.context.signal, nylasDefaultRequestTimeoutMs);
  try {
    const response = await options.context.fetcher(buildNylasUrl(options.path, options.params ?? {}), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readNylasPayload(response);
    if (!response.ok) {
      throw createNylasError(response.status, payload, options.phase);
    }

    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "Nylas returned an invalid payload");
    }
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Nylas request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Nylas request failed: ${error.message}` : "Nylas request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildNylasUrl(path: string, params: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${nylasApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readNylasPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Nylas returned invalid JSON");
  }
}

function createNylasError(status: number, payload: unknown, phase: NylasPhase): ProviderRequestError {
  const message = extractNylasErrorMessage(payload) ?? `Nylas request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractNylasErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const error = optionalRecord(record.error);
  const errorMessage = optionalString(error?.message);
  if (errorMessage) {
    return errorMessage;
  }

  return optionalString(record.message);
}

function normalizeGrantList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeGrant(item));
}

function normalizeGrant(value: unknown): Record<string, unknown> {
  const record = requiredRecord(value, "grant");
  return {
    id: requiredOutputString(record.id, "grant.id"),
    provider: requiredOutputString(record.provider, "grant.provider"),
    email: readNullableString(record.email),
    name: readNullableString(record.name),
    grantStatus: readNullableString(record.grant_status),
    createdAt: readNullableNumber(record.created_at),
    updatedAt: readNullableNumber(record.updated_at),
    raw: record,
  };
}

function normalizeCalendarList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeCalendar(item));
}

function normalizeCalendar(value: unknown): Record<string, unknown> {
  const record = requiredRecord(value, "calendar");
  return {
    id: requiredOutputString(record.id, "calendar.id"),
    name: readNullableString(record.name),
    description: readNullableString(record.description),
    timezone: readNullableString(record.timezone),
    isPrimary: readNullableBoolean(record.is_primary),
    readOnly: readNullableBoolean(record.read_only),
    raw: record,
  };
}

function normalizeEventList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeEvent(item));
}

function normalizeEvent(value: unknown): Record<string, unknown> {
  const record = requiredRecord(value, "event");
  return {
    id: requiredOutputString(record.id, "event.id"),
    title: readNullableString(record.title),
    calendarId: readNullableString(record.calendar_id),
    grantId: readNullableString(record.grant_id),
    busy: readNullableBoolean(record.busy),
    status: readNullableString(record.status),
    htmlLink: readNullableString(record.html_link),
    raw: record,
  };
}

function requiredRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (record) {
    return record;
  }
  throw new ProviderRequestError(502, `Nylas response is missing ${fieldName}`);
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requiredOutputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(502, `Nylas response ${message}`));
}

function readNullableString(value: unknown): string | null {
  return optionalString(value) ?? null;
}

function readNullableNumber(value: unknown): number | null {
  return optionalNumber(value) ?? null;
}

function readNullableBoolean(value: unknown): boolean | null {
  if (value === null) {
    return null;
  }
  return optionalBoolean(value) ?? null;
}

function readOptionalNumberString(value: unknown): string | undefined {
  const number = optionalNumber(value);
  return number === undefined ? undefined : String(number);
}

function readOptionalBooleanString(value: unknown): string | undefined {
  const valueBoolean = optionalBoolean(value);
  return valueBoolean === undefined ? undefined : String(valueBoolean);
}
