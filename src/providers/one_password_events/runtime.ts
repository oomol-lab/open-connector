import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { OnePasswordEventsActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  runProviderRequest,
} from "../provider-runtime.ts";

export const onePasswordEventsValidationPath = "/api/v2/auth/introspect";

type OnePasswordEventsPhase = "validate" | "execute";
type OnePasswordEventsActionHandler = ProviderRuntimeHandler<OnePasswordEventsContext>;

export interface OnePasswordEventsContext {
  apiKey: string;
  baseUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

const eventPathByActionName: Record<OnePasswordEventsActionName, string> = {
  list_audit_events: "/api/v2/auditevents",
  list_item_usages: "/api/v2/itemusages",
  list_sign_in_attempts: "/api/v2/signinattempts",
};

export const onePasswordEventsActionHandlers: ProviderActionHandlers<
  "one_password_events",
  OnePasswordEventsActionHandler
> = {
  list_audit_events(input, context) {
    return listOnePasswordEvents("list_audit_events", input, context);
  },
  list_item_usages(input, context) {
    return listOnePasswordEvents("list_item_usages", input, context);
  },
  list_sign_in_attempts(input, context) {
    return listOnePasswordEvents("list_sign_in_attempts", input, context);
  },
};

export function resolveOnePasswordEventsCredentialContext(
  apiKey: string,
  values: Record<string, string>,
  metadata: Record<string, unknown> | undefined,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): OnePasswordEventsContext {
  return {
    apiKey: requiredString(apiKey, "apiKey", providerInputError),
    baseUrl: resolveOnePasswordEventsBaseUrl(values, metadata),
    fetcher,
    signal,
  };
}

export async function validateOnePasswordEventsCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = resolveOnePasswordEventsCredentialContext(apiKey, values, undefined, fetcher, signal);
  const introspection = requiredRecord(
    await requestOnePasswordEventsJson({
      context,
      path: onePasswordEventsValidationPath,
      method: "GET",
      phase: "validate",
    }),
    "1Password Events introspection response",
    providerResponseError,
  );
  const integrationUuid = optionalString(introspection.uuid);
  const accountUuid = optionalString(introspection.account_uuid);
  const issuedAt = optionalString(introspection.issued_at);
  const grantedScopes = readFeatureList(introspection.features);

  return {
    profile: {
      accountId: `one_password_events:${new URL(context.baseUrl).host}:${integrationUuid ?? "unknown"}:${buildTokenFingerprint(
        apiKey,
      )}`,
      displayName: accountUuid ? `1Password Events (${accountUuid})` : "1Password Events",
    },
    grantedScopes,
    metadata: compactObject({
      baseUrl: context.baseUrl,
      apiBaseUrl: context.baseUrl,
      validationEndpoint: onePasswordEventsValidationPath,
      accountUuid,
      integrationUuid,
      issuedAt,
      features: grantedScopes,
    }),
  };
}

async function listOnePasswordEvents(
  actionName: OnePasswordEventsActionName,
  input: Record<string, unknown>,
  context: OnePasswordEventsContext,
): Promise<unknown> {
  const payload = await requestOnePasswordEventsJson({
    context,
    path: eventPathByActionName[actionName],
    method: "POST",
    phase: "execute",
    body: buildEventCursorBody(input),
  });
  const record = requiredRecord(payload, "1Password Events stream response", providerResponseError);

  return {
    cursor: optionalString(record.cursor) ?? "",
    hasMore: optionalBoolean(record.has_more) ?? false,
    events: objectArray(record.items, "1Password Events stream items", providerResponseError),
    raw: record,
  };
}

function buildEventCursorBody(input: Record<string, unknown>): Record<string, unknown> {
  const cursor = optionalString(input.cursor);
  const startTime = optionalString(input.startTime);
  const endTime = optionalString(input.endTime);
  const limit = optionalNumber(input.limit);

  if (cursor && (startTime || endTime || limit !== undefined)) {
    throw new ProviderRequestError(400, "cursor cannot be combined with startTime, endTime, or limit");
  }

  return compactObject({
    cursor,
    start_time: startTime,
    end_time: endTime,
    limit,
  });
}

function resolveOnePasswordEventsBaseUrl(
  values: Record<string, string>,
  metadata: Record<string, unknown> | undefined,
): string {
  return normalizeOnePasswordEventsBaseUrl(
    optionalString(metadata?.baseUrl) ?? optionalString(metadata?.apiBaseUrl) ?? values.baseUrl,
  );
}

function normalizeOnePasswordEventsBaseUrl(value: unknown): string {
  const raw = requiredString(value, "baseUrl", providerInputError);
  const url = assertPublicHttpUrl(raw, {
    fieldName: "baseUrl",
    createError: providerInputError,
  });

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must use https");
  }
  if (url.pathname !== "/") {
    throw new ProviderRequestError(400, "baseUrl must be the Events API root URL without any path");
  }

  url.hash = "";
  url.search = "";
  return trimTrailingSlash(url.toString());
}

async function requestOnePasswordEventsJson(input: {
  context: OnePasswordEventsContext;
  path: string;
  method: "GET" | "POST";
  phase: OnePasswordEventsPhase;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  return runProviderRequest({ signal: input.context.signal, label: "1Password Events" }, async (signal) => {
    const response = await input.context.fetcher(new URL(input.path, `${input.context.baseUrl}/`), {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        ...(input.method === "POST" ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      ...(input.method === "POST" ? { body: JSON.stringify(input.body ?? {}) } : {}),
      signal,
    });
    const payload = await readOnePasswordEventsPayload(response);

    if (!response.ok) {
      throw createOnePasswordEventsError(response.status, payload, input.phase);
    }

    return payload;
  });
}

async function readOnePasswordEventsPayload(response: Response): Promise<unknown> {
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

function createOnePasswordEventsError(
  status: number,
  payload: unknown,
  phase: OnePasswordEventsPhase,
): ProviderRequestError {
  const message =
    extractOnePasswordEventsErrorMessage(payload) ?? `1Password Events request failed with status ${status}`;

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message);
}

function extractOnePasswordEventsErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function readFeatureList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function buildTokenFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
}
