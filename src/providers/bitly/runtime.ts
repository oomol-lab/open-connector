import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BitlyActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const bitlyApiBaseUrl = "https://api-ssl.bitly.com/v4";
const bitlyValidationPath = "/user";

type BitlyRequestPhase = "validate" | "execute";
type BitlyRequestMethod = "GET" | "POST" | "PATCH";
type BitlyActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

type JsonPayloadReadResult =
  | { kind: "empty" }
  | { kind: "json"; value: unknown }
  | { kind: "invalid_json"; raw: string };

interface BitlyRequestContext {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface BitlyRequestInput {
  path: string;
  phase: BitlyRequestPhase;
  method?: BitlyRequestMethod;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

export const bitlyActionHandlers: Record<BitlyActionName, BitlyActionHandler> = {
  get_user(input, context) {
    return getUser(input, context);
  },
  list_groups(input, context) {
    return listGroups(input, context);
  },
  get_group(input, context) {
    return getGroup(input, context);
  },
  shorten_link(input, context) {
    return shortenLink(input, context);
  },
  get_bitlink(input, context) {
    return getBitlink(input, context);
  },
  update_bitlink(input, context) {
    return updateBitlink(input, context);
  },
};

export async function validateBitlyCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestBitlyJson(
    { apiKey, fetcher, signal },
    {
      path: bitlyValidationPath,
      phase: "validate",
    },
  );
  const user = requireObject(payload, "bitly validateCredential returned no object");
  const login = optionalString(user.login);
  const name = optionalString(user.name);
  const defaultGroupGuid = optionalString(user.default_group_guid);

  return {
    profile: {
      accountId: login ?? defaultGroupGuid,
      displayName: name ?? login ?? "Bitly API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: bitlyValidationPath,
      apiBaseUrl: bitlyApiBaseUrl,
      login,
      name,
      defaultGroupGuid,
    }),
  };
}

async function getUser(
  _input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestBitlyJson(context, {
    path: "/user",
    phase: "execute",
  });

  return {
    user: requireObject(payload, "bitly get_user returned no object"),
  };
}

async function listGroups(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestBitlyJson(context, {
    path: "/groups",
    phase: "execute",
    query: {
      organization_guid: optionalString(input.organizationGuid),
    },
  });
  const response = requireObject(payload, "bitly list_groups returned no object");
  if (!Array.isArray(response.groups)) {
    throw new ProviderRequestError(502, "bitly returned invalid groups payload", response);
  }

  return {
    groups: response.groups,
  };
}

async function getGroup(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const groupGuid = requireInputString(input.groupGuid, "groupGuid");
  const payload = await requestBitlyJson(context, {
    path: `/groups/${encodeURIComponent(groupGuid)}`,
    phase: "execute",
  });

  return {
    group: requireObject(payload, "bitly get_group returned no object"),
  };
}

async function shortenLink(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestBitlyJson(context, {
    path: "/shorten",
    phase: "execute",
    method: "POST",
    body: compactObject({
      long_url: requireInputString(input.longUrl, "longUrl"),
      domain: optionalString(input.domain),
      group_guid: optionalString(input.groupGuid),
      force_new_link: optionalBoolean(input.forceNewLink),
    }),
  });

  return {
    bitlink: requireObject(payload, "bitly shorten_link returned no object"),
  };
}

async function getBitlink(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const bitlink = requireInputString(input.bitlink, "bitlink");
  const payload = await requestBitlyJson(context, {
    path: `/bitlinks/${encodeBitlinkPath(bitlink)}`,
    phase: "execute",
  });

  return {
    bitlink: requireObject(payload, "bitly get_bitlink returned no object"),
  };
}

async function updateBitlink(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const bitlink = requireInputString(input.bitlink, "bitlink");
  const body = compactObject({
    title: optionalString(input.title),
    archived: optionalBoolean(input.archived),
    tags: Array.isArray(input.tags) ? input.tags : undefined,
    long_url: optionalString(input.longUrl),
    expiration_at: optionalString(input.expirationAt),
  });
  if (Object.keys(body).length === 0) {
    throw new ProviderRequestError(400, "At least one of title, archived, tags, longUrl, or expirationAt is required");
  }

  const payload = await requestBitlyJson(context, {
    path: `/bitlinks/${encodeBitlinkPath(bitlink)}`,
    phase: "execute",
    method: "PATCH",
    body,
  });

  return {
    bitlink: requireObject(payload, "bitly update_bitlink returned no object"),
  };
}

async function requestBitlyJson(context: BitlyRequestContext, input: BitlyRequestInput): Promise<unknown> {
  const url = new URL(`${bitlyApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryValue(url, key, value);
  }

  const init: RequestInit = {
    method: input.method ?? "GET",
    headers: bitlyHeaders(context.apiKey, input.body !== undefined),
    signal: context.signal,
  };
  if (input.body !== undefined) {
    init.body = JSON.stringify(input.body);
  }

  let response: Response;
  let payload: JsonPayloadReadResult;
  try {
    response = await context.fetcher(url.toString(), init);
    payload = await readJsonPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `bitly request failed: ${error.message}` : "bitly request failed",
      error,
    );
  }

  if (payload.kind === "invalid_json") {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : 502,
      `bitly returned invalid JSON: ${payload.raw.slice(0, 200)}`,
      payload.raw,
    );
  }

  const value = payload.kind === "json" ? payload.value : null;
  if (!response.ok) {
    throw createBitlyError(response, value, input.phase);
  }

  return value;
}

function bitlyHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    accept: "application/json",
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readJsonPayload(response: Response): Promise<JsonPayloadReadResult> {
  const raw = await response.text();
  if (!raw.trim()) {
    return { kind: "empty" };
  }

  try {
    return { kind: "json", value: JSON.parse(raw) as unknown };
  } catch {
    return { kind: "invalid_json", raw };
  }
}

function createBitlyError(response: Response, payload: unknown, phase: BitlyRequestPhase): ProviderRequestError {
  const message = readBitlyErrorMessage(payload) ?? response.statusText ?? "bitly request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }

  if (phase === "execute" && [400, 402, 404, 409, 410, 417, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function readBitlyErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload;
  }

  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  const errors = Array.isArray(body.errors) ? body.errors : [];
  const firstError = optionalRecord(errors[0]);
  return (
    optionalString(firstError?.message) ??
    optionalString(firstError?.error_code) ??
    optionalString(body.description) ??
    optionalString(body.message) ??
    optionalString(body.resource)
  );
}

function appendQueryValue(url: URL, key: string, value: string | undefined): void {
  if (value !== undefined && value !== "") {
    url.searchParams.set(key, value);
  }
}

function encodeBitlinkPath(value: string): string {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message, value);
  }
  return record;
}

function requireInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
