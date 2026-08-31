import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalIntegerLike, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const eveniumApiBaseUrl = "https://evenium.com";
const eveniumValidationPath = "/api/1/events";

type EveniumRequestMode = "validate" | "execute";
type EveniumContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type EveniumActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface EveniumRequestOptions {
  path: string;
  query?: Record<string, string | number | undefined>;
  mode: EveniumRequestMode;
}

export const eveniumActionHandlers: ProviderActionHandlers<"evenium", EveniumActionHandler> = {
  async list_events(input, context) {
    const payload = await requestEveniumObject(
      {
        path: "/api/1/events",
        mode: "execute",
        query: {
          maxResults: readOptionalNonNegativeInteger(input.maxResults, "maxResults"),
          firstResult: readOptionalNonNegativeInteger(input.firstResult, "firstResult"),
          startsAfter: optionalString(input.startsAfter),
          startsBefore: optionalString(input.startsBefore),
          endsAfter: optionalString(input.endsAfter),
          endsBefore: optionalString(input.endsBefore),
          createdAfter: optionalString(input.createdAfter),
          createdBefore: optionalString(input.createdBefore),
          title: optionalString(input.title),
          status: optionalString(input.status),
        },
      },
      context,
    );

    return normalizeListPayload(payload, "event", "events");
  },
  async get_event(input, context) {
    const eventId = requireIdentifier(input.eventId, "eventId");
    const payload = await requestEveniumObject(
      {
        path: `/api/1/events/${encodeURIComponent(eventId)}`,
        mode: "execute",
      },
      context,
    );

    return { event: payload };
  },
  async list_guests(input, context) {
    const eventId = requireIdentifier(input.eventId, "eventId");
    const payload = await requestEveniumObject(
      {
        path: `/api/1/events/${encodeURIComponent(eventId)}/guests`,
        mode: "execute",
        query: {
          fields: readStringArray(input.fields)?.join(","),
          maxResults: readOptionalNonNegativeInteger(input.maxResults, "maxResults"),
          firstResult: readOptionalNonNegativeInteger(input.firstResult, "firstResult"),
          status: optionalString(input.status),
          since: optionalString(input.since),
          until: optionalString(input.until),
          lastName: optionalString(input.lastName),
          firstName: optionalString(input.firstName),
          email: optionalString(input.email),
          company: optionalString(input.company),
        },
      },
      context,
    );

    return normalizeListPayload(payload, "guests", "guests");
  },
  async get_guest(input, context) {
    const eventId = requireIdentifier(input.eventId, "eventId");
    const payload = await requestEveniumObject(
      {
        path: buildGuestLookupPath(eventId, input),
        mode: "execute",
        query: {
          fields: readStringArray(input.fields)?.join(","),
        },
      },
      context,
    );

    return { guest: payload };
  },
  async get_guest_status(input, context) {
    const eventId = requireIdentifier(input.eventId, "eventId");
    const contactId = requireIdentifier(input.contactId, "contactId");
    const payload = await requestEveniumObject(
      {
        path: `/api/1/events/${encodeURIComponent(eventId)}/guests/${encodeURIComponent(contactId)}/status`,
        mode: "execute",
      },
      context,
    );

    return { guestStatus: normalizeStatusPayload(payload, "status") };
  },
  async get_guest_post_status(input, context) {
    const eventId = requireIdentifier(input.eventId, "eventId");
    const contactId = requireIdentifier(input.contactId, "contactId");
    const payload = await requestEveniumObject(
      {
        path: `/api/1/events/${encodeURIComponent(eventId)}/guests/${encodeURIComponent(contactId)}/postStatus`,
        mode: "execute",
      },
      context,
    );

    return { guestPostStatus: normalizeStatusPayload(payload, "postStatus") };
  },
};

export async function validateEveniumCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestEveniumObject(
    {
      path: eveniumValidationPath,
      mode: "validate",
      query: { maxResults: 1 },
    },
    { apiKey, fetcher, signal },
  );

  return {
    profile: {
      accountId: `api_key:${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`,
      displayName: "Evenium API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: eveniumApiBaseUrl,
      validationEndpoint: eveniumValidationPath,
      eventCount:
        typeof payload.nbrResults === "string" || typeof payload.nbrResults === "number"
          ? payload.nbrResults
          : undefined,
    }),
  };
}

async function requestEveniumObject(
  options: EveniumRequestOptions,
  context: EveniumContext,
): Promise<Record<string, unknown>> {
  const payload = await requestEveniumJson(options, context);
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Evenium returned an unexpected object response", payload);
  }
  return record;
}

async function requestEveniumJson(options: EveniumRequestOptions, context: EveniumContext): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal);
  try {
    const url = new URL(options.path, eveniumApiBaseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-evenium-token": context.apiKey,
      },
      signal: timeout.signal,
    });
    const payload = await readEveniumPayload(response);

    if (!response.ok) {
      throw createEveniumError(response.status, response.statusText, payload, options.mode);
    }
    if (payload == null || Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Evenium returned an unexpected empty response", payload);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Evenium request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Evenium request failed: ${error.message}` : "Evenium request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readEveniumPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ProviderRequestError(502, "Evenium returned invalid JSON response");
    }
  }
  return text;
}

function createEveniumError(
  status: number,
  statusText: string,
  payload: unknown,
  mode: EveniumRequestMode,
): ProviderRequestError {
  const message = (extractErrorMessage(payload) ?? statusText) || "Evenium request failed";
  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function normalizeListPayload(
  payload: Record<string, unknown>,
  sourceKey: "event" | "guests",
  outputKey: "events" | "guests",
): Record<string, unknown> {
  return {
    nbrResults: readRequiredNonNegativeInteger(payload.nbrResults, "nbrResults"),
    maxResults: readRequiredNonNegativeInteger(payload.maxResults, "maxResults"),
    firstResult: readRequiredNonNegativeInteger(payload.firstResult, "firstResult"),
    more: readRequiredBoolean(payload.more, "more"),
    [outputKey]: readRequiredArray(payload[sourceKey], sourceKey),
  };
}

function normalizeStatusPayload(
  payload: Record<string, unknown>,
  statusKey: "status" | "postStatus",
): Record<string, unknown> {
  try {
    return {
      contactId: requireIdentifier(payload.contactId, "contactId"),
      eventId: requireIdentifier(payload.eventId, "eventId"),
      [statusKey]: requireIdentifier(payload[statusKey], statusKey),
    };
  } catch {
    throw new ProviderRequestError(502, "Evenium returned invalid status payload", payload);
  }
}

function buildGuestLookupPath(eventId: string, input: Record<string, unknown>): string {
  const contactId = optionalString(input.contactId);
  const guestCode = optionalString(input.guestCode);
  if (contactId && guestCode) {
    throw new ProviderRequestError(400, "Provide either contactId or guestCode, not both");
  }
  if (!contactId && !guestCode) {
    throw new ProviderRequestError(400, "contactId or guestCode must be provided");
  }
  if (guestCode) {
    return `/api/1/events/${encodeURIComponent(eventId)}/guests/guestCode/${encodeURIComponent(guestCode)}`;
  }
  return `/api/1/events/${encodeURIComponent(eventId)}/guests/${encodeURIComponent(contactId!)}`;
}

function requireIdentifier(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readRequiredArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Evenium returned invalid ${fieldName}`, value);
  }
  return value;
}

function readRequiredNonNegativeInteger(value: unknown, fieldName: string): number {
  const numeric =
    typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new ProviderRequestError(502, `Evenium returned invalid ${fieldName}`, value);
  }
  return numeric;
}

function readOptionalNonNegativeInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const numeric = optionalIntegerLike(value, fieldName, (message) => new ProviderRequestError(400, message));
  if (numeric === undefined) {
    return undefined;
  }
  if (numeric < 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-negative integer`);
  }
  return numeric;
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new ProviderRequestError(502, `Evenium returned invalid ${fieldName}`, value);
}

function readStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "fields must be an array of strings");
  }
  return value.length === 0 ? undefined : value.map((entry) => requireIdentifier(entry, "fields"));
}

function extractErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const directMessage = optionalString(record?.message);
  if (directMessage) {
    return directMessage;
  }
  if (typeof payload === "string") {
    const messageStart = payload.indexOf("<message>");
    const messageEnd = payload.indexOf("</message>");
    if (messageStart >= 0 && messageEnd > messageStart) {
      return payload.slice(messageStart + "<message>".length, messageEnd).trim();
    }
    return payload.trim() || undefined;
  }
  return undefined;
}
