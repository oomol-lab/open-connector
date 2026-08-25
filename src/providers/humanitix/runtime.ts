import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  objectArray,
  optionalBoolean,
  optionalIntegerLike,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const humanitixApiBaseUrl = "https://api.humanitix.com/v1";

const validationPage = 1;

interface HumanitixActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface HumanitixRequestInput {
  path: string;
  query: Array<[string, unknown]>;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase?: "validate" | "execute";
}

type HumanitixActionHandler = (input: Record<string, unknown>, context: HumanitixActionContext) => Promise<unknown>;

export const humanitixActionHandlers: ProviderActionHandlers<"humanitix", HumanitixActionHandler> = {
  async list_events(input, context) {
    const payload = await requestHumanitix({
      ...context,
      path: "/events",
      query: [
        ["page", input.page],
        ["pageSize", input.pageSize],
        ["since", input.since],
        ["inFutureOnly", optionalBoolean(input.inFutureOnly)],
        ["overrideLocation", optionalString(input.overrideLocation)?.toUpperCase()],
      ],
    });

    return normalizeEventsPage(payload);
  },
  async get_event(input, context) {
    const eventId = requiredString(input.eventId, "eventId", (message) => new ProviderRequestError(400, message));
    const payload = await requestHumanitix({
      ...context,
      path: `/events/${encodeURIComponent(eventId)}`,
      query: [],
    });

    return {
      event: readEvent(payload),
    };
  },
  async list_tags(input, context) {
    const payload = await requestHumanitix({
      ...context,
      path: "/tags",
      query: [["page", input.page]],
    });
    const record = requireHumanitixObject(payload, "Humanitix tags response");

    return {
      tags: readObjectArray(record.tags, "tags"),
      pagination: {
        page: readInteger(record.page, "page"),
        pageSize: readInteger(record.pageSize, "pageSize"),
        total: readInteger(record.total, "total"),
      },
    };
  },
};

export async function validateHumanitixCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await requestHumanitix({
    path: "/events",
    query: [["page", validationPage]],
    apiKey: input.apiKey,
    fetcher: options.fetcher,
    signal: options.signal,
    phase: "validate",
  });
  const page = normalizeEventsPage(payload);

  return {
    profile: {
      accountId: "humanitix:public-api-key",
      displayName: "Humanitix Public API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: humanitixApiBaseUrl,
      validationEndpoint: "/events",
      eventCount: page.pagination.total,
    },
  };
}

async function requestHumanitix(input: HumanitixRequestInput): Promise<unknown> {
  const url = new URL(`${humanitixApiBaseUrl}${input.path}`);
  for (const [key, value] of input.query) {
    appendQueryValue(url, key, value);
  }

  let response: Response;
  try {
    response = await input.fetcher(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.apiKey,
      },
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Humanitix request failed: ${error.message}` : "Humanitix request failed",
      error,
    );
  }

  const payload = await readHumanitixPayload(response);
  if (!response.ok) {
    throw mapHumanitixHttpError(response, payload, input.phase ?? "execute");
  }

  return payload;
}

async function readHumanitixPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Humanitix returned invalid JSON");
  }
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  url.searchParams.set(key, String(value));
}

function mapHumanitixHttpError(
  response: Response,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = extractHumanitixErrorMessage(payload) ?? `Humanitix request failed with HTTP ${response.status}`;
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status, message, payload);
}

function extractHumanitixErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["message", "error", "detail"]) {
    const message = optionalString(record[key]);
    if (message) {
      return message;
    }
  }
  return undefined;
}

function normalizeEventsPage(payload: unknown): {
  events: Array<Record<string, unknown>>;
  pagination: { page: number; pageSize: number; total: number };
} {
  const record = requireHumanitixObject(payload, "Humanitix events response");
  return {
    events: readObjectArray(record.events, "events"),
    pagination: {
      page: readInteger(record.page, "page"),
      pageSize: readInteger(record.pageSize, "pageSize"),
      total: readInteger(record.total, "total"),
    },
  };
}

function readEvent(payload: unknown): Record<string, unknown> {
  const record = requireHumanitixObject(payload, "Humanitix event response");
  const wrapped = record.event;
  return wrapped === undefined ? record : requireHumanitixObject(wrapped, "Humanitix event");
}

function readObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  return objectArray(value, fieldName, (message) => new ProviderRequestError(502, message));
}

function readInteger(value: unknown, fieldName: string): number {
  const integer = optionalIntegerLike(value, fieldName, (message) => new ProviderRequestError(502, message));
  if (integer !== undefined) {
    return integer;
  }

  throw new ProviderRequestError(502, `Humanitix response missing integer field: ${fieldName}`);
}

function requireHumanitixObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (record) {
    return record;
  }

  throw new ProviderRequestError(502, `${fieldName} must be an object`);
}
