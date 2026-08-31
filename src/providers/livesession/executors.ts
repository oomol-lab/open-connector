import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { optionalInteger, optionalRecord, optionalString, rawStringOrNull } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "livesession";
const livesessionApiBaseUrl = "https://api.livesession.io/v1";
const livesessionValidationPath = "/sessions";
const livesessionCredentialHelpUrl = "https://livesession.dev/docs/api/authentication";

type LivesessionActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const livesessionActionHandlers: ProviderActionHandlers<"livesession", LivesessionActionHandler> = {
  list_sessions(input, context) {
    return listSessions(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, livesessionActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await requestLivesessionJson({
      path: livesessionValidationPath,
      query: queryParams({ size: 1 }),
      context: { apiKey: input.apiKey, fetcher, signal },
      mode: "validate",
    });
    const body = requireObject(payload, "LiveSession returned an invalid credential payload");
    const firstSession = objectArray(body.sessions, "LiveSession returned invalid sessions").find(Boolean);

    return {
      profile: {
        accountId: `livesession:api_token:${hashApiKey(input.apiKey)}`,
        displayName: "LiveSession API Token",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: livesessionApiBaseUrl,
        validationEndpoint: `${livesessionValidationPath}?size=1`,
        sampleWebsiteId: optionalString(firstSession?.website_id) ?? null,
        credentialHelpUrl: livesessionCredentialHelpUrl,
      },
    };
  },
};

async function listSessions(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestLivesessionJson({
    path: "/sessions",
    query: queryParams({
      page: optionalInteger(input.page),
      size: optionalInteger(input.size),
      email: optionalString(input.email),
      visitor_id: optionalString(input.visitorId),
      tz: optionalString(input.timezone),
      date_from: optionalString(input.dateFrom),
      date_to: optionalString(input.dateTo),
    }),
    context,
    mode: "execute",
  });
  const body = requireObject(payload, "LiveSession returned an invalid session list payload");
  const page = requireObject(body.page, "LiveSession returned invalid pagination metadata");
  const sessions = objectArray(body.sessions, "LiveSession returned invalid sessions");

  return {
    total: readNonNegativeInteger(body.total, "total"),
    page: {
      num: readInteger(page.num, "page.num"),
      size: readInteger(page.size, "page.size"),
    },
    sessions: sessions.map(normalizeSession),
    raw: body,
  };
}

async function requestLivesessionJson(input: {
  path: string;
  query: Record<string, string>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  mode: "validate" | "execute";
}): Promise<unknown> {
  const url = new URL(`${livesessionApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query)) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "LiveSession API request failed");
  }

  const payload = await readLivesessionPayload(response);
  if (!response.ok) {
    throw createLivesessionError(response.status, payload, input.mode);
  }

  return payload;
}

function normalizeSession(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readString(value.id, "session.id"),
    websiteId: rawStringOrNull(value.website_id),
    sessionUrl: rawStringOrNull(value.session_url),
    creationTimestamp: readNullableInteger(value.creation_timestamp, "session.creation_timestamp"),
    duration: readNullableInteger(value.duration, "session.duration"),
    device: rawStringOrNull(value.device),
    visitor: value.visitor == null ? null : requireObject(value.visitor, "LiveSession returned invalid nested object"),
    raw: value,
  };
}

async function readLivesessionPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createLivesessionError(status: number, payload: unknown, mode: "validate" | "execute"): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `LiveSession API request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(status === 404 ? 404 : 400, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  const error = body?.error;
  if (typeof error === "string" && error) {
    return error;
  }
  const errorObject = optionalRecord(error);
  return optionalString(errorObject?.message) ?? optionalString(body?.message);
}

function requireObject(value: unknown, errorMessage: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (record) {
    return record;
  }
  throw new ProviderRequestError(502, errorMessage);
}

function objectArray(value: unknown, errorMessage: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, errorMessage);
  }
  return value.map((item) => requireObject(item, errorMessage));
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value) {
    throw new ProviderRequestError(502, `LiveSession returned invalid ${fieldName}`);
  }
  return value;
}

function readInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `LiveSession returned invalid ${fieldName}`);
  }
  return value;
}

function readNullableInteger(value: unknown, fieldName: string): number | null {
  if (value == null) {
    return null;
  }
  return readInteger(value, fieldName);
}

function readNonNegativeInteger(value: unknown, fieldName: string): number {
  const integer = readInteger(value, fieldName);
  if (integer < 0) {
    throw new ProviderRequestError(502, `LiveSession returned invalid ${fieldName}`);
  }
  return integer;
}

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}
