import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "oncehub";
const oncehubApiBaseUrl = "https://api.oncehub.com";
const oncehubValidationPath = "/test";
const oncehubRequestTimeoutMs = 30_000;

type OncehubRequestPhase = "validate" | "execute";
type OncehubActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface OncehubListInput {
  context: ApiKeyProviderContext;
  path: string;
  query?: Record<string, unknown>;
  phase: OncehubRequestPhase;
}

interface OncehubRequestInput extends OncehubListInput {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
}

interface OncehubCursors {
  nextCursor: string | null;
  previousCursor: string | null;
}

export const oncehubActionHandlers: ProviderActionHandlers<"oncehub", OncehubActionHandler> = {
  list_bookings(input, context) {
    return requestOncehubList({
      context,
      path: "/v2/bookings",
      query: {
        ...input,
        "last_updated_time.gt": input.lastUpdatedTimeGt,
        lastUpdatedTimeGt: undefined,
      },
      phase: "execute",
    });
  },
  list_booking_pages(input, context) {
    return requestOncehubList({
      context,
      path: "/v2/booking-pages",
      query: input,
      phase: "execute",
    });
  },
  list_event_types(input, context) {
    return requestOncehubList({
      context,
      path: "/v2/event-types",
      query: input,
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, oncehubActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestOncehubJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: oncehubValidationPath,
      phase: "validate",
    });

    const validationObject = optionalString(optionalRecord(payload)?.object);
    const tokenHash = createHash("sha256").update(input.apiKey).digest("hex").slice(0, 16);
    return {
      profile: {
        accountId: `oncehub:api_key:${tokenHash}`,
        displayName: "OnceHub API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: oncehubApiBaseUrl,
        validationEndpoint: oncehubValidationPath,
        validationObject,
      },
    };
  },
};

async function requestOncehubList(input: OncehubListInput): Promise<Record<string, unknown>> {
  if (input.query?.after !== undefined && input.query.before !== undefined) {
    throw new ProviderRequestError(400, "after and before cannot be used together");
  }

  const response = await requestOncehubResponse(input);
  const payload = await readOncehubPayload(response);
  handleOncehubError(response, payload, input.phase);

  const record = optionalRecord(payload);
  const data = Array.isArray(record?.data) ? record.data : undefined;
  if (!record || !data) {
    throw new ProviderRequestError(502, "OnceHub returned invalid list response", payload);
  }

  const cursors = parseOncehubLinkHeader(response.headers.get("link"));
  return {
    object: optionalString(record.object) ?? "list",
    data,
    hasMore: typeof record.has_more === "boolean" ? record.has_more : Boolean(cursors.nextCursor),
    nextCursor: cursors.nextCursor,
    previousCursor: cursors.previousCursor,
    requestId: response.headers.get("request-id"),
  };
}

async function requestOncehubJson(input: OncehubRequestInput): Promise<unknown> {
  const response = await requestOncehubResponse(input);
  const payload = await readOncehubPayload(response);
  handleOncehubError(response, payload, input.phase);
  return payload;
}

async function requestOncehubResponse(input: OncehubRequestInput): Promise<Response> {
  const timeout = createProviderTimeout(input.context.signal, oncehubRequestTimeoutMs);
  try {
    return await input.context.fetcher(buildOncehubUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "api-key": input.context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "OnceHub request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `OnceHub request failed: ${error.message}` : "OnceHub request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildOncehubUrl(path: string, query?: Record<string, unknown>): URL {
  const url = new URL(path, oncehubApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    appendOncehubQueryValue(url, key, value);
  }
  return url;
}

function appendOncehubQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  if (Array.isArray(value)) {
    const values = value.filter((item) => item !== undefined && item !== null && item !== "");
    if (values.length > 0) {
      url.searchParams.set(key, values.map((item) => String(item)).join(","));
    }
    return;
  }

  url.searchParams.set(key, String(value));
}

async function readOncehubPayload(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function handleOncehubError(response: Response, payload: unknown, phase: OncehubRequestPhase): void {
  if (response.ok) {
    return;
  }

  const record = optionalRecord(payload);
  const type = optionalString(record?.type);
  const message =
    optionalString(record?.message) ??
    (response.statusText ? `OnceHub request failed: ${response.statusText}` : "OnceHub request failed");

  if (type === "authentication_error" || response.status === 401 || response.status === 403) {
    throw new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (type === "invalid_request_error" || response.status === 404 || response.status === 409) {
    throw new ProviderRequestError(400, message, payload);
  }
  if (type === "rate_limit_error" || response.status === 429) {
    throw new ProviderRequestError(429, message, payload);
  }

  throw new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function parseOncehubLinkHeader(value: string | null): OncehubCursors {
  const cursors: OncehubCursors = {
    nextCursor: null,
    previousCursor: null,
  };

  if (!value) {
    return cursors;
  }

  for (const segment of value.split(",")) {
    const [urlPart, ...parameters] = segment.trim().split(";");
    const urlText = urlPart?.trim();
    if (!urlText?.startsWith("<") || !urlText.endsWith(">")) {
      continue;
    }

    const relation = parameters
      .map((parameter) => parameter.trim())
      .find((parameter) => parameter === 'rel="next"' || parameter === 'rel="previous"');
    if (!relation) {
      continue;
    }

    const cursor = readCursorFromLink(urlText.slice(1, -1), relation === 'rel="next"' ? "after" : "before");
    if (relation === 'rel="next"') {
      cursors.nextCursor = cursor;
    } else {
      cursors.previousCursor = cursor;
    }
  }

  return cursors;
}

function readCursorFromLink(urlText: string, name: "after" | "before"): string | null {
  try {
    return new URL(urlText, oncehubApiBaseUrl).searchParams.get(name);
  } catch {
    return null;
  }
}
