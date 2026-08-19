import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const oomnitzaValidationPath = "/api/v3/assets";

const oomnitzaRequestTimeoutMs = 30_000;

type OomnitzaRequestMode = "validate" | "execute";

interface OomnitzaCredential {
  apiKey: string;
  baseUrl: string;
  host: string;
}

export interface OomnitzaActionContext extends OomnitzaCredential {
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface OomnitzaRequestInput extends OomnitzaActionContext {
  path: string;
  mode: OomnitzaRequestMode;
  query?: URLSearchParams;
  notFoundAsInvalidInput?: boolean;
}

type OomnitzaActionHandler = (input: Record<string, unknown>, context: OomnitzaActionContext) => Promise<unknown>;

export const oomnitzaActionHandlers: ProviderActionHandlers<"oomnitza", OomnitzaActionHandler> = {
  async identify(_input, context) {
    return {
      baseUrl: context.baseUrl,
      host: context.host,
      validationEndpoint: oomnitzaValidationPath,
    };
  },
  async list_assets(input, context) {
    const payload = await requestOomnitzaJson({
      ...context,
      path: "/api/v3/assets",
      query: buildListSearchParams(input),
      mode: "execute",
    });
    return normalizeOomnitzaListPayload(payload, "assets");
  },
  async get_asset(input, context) {
    const id = requiredString(input.id, "id", requestInputError);
    const payload = await requestOomnitzaJson({
      ...context,
      path: `/api/v3/assets/${encodeURIComponent(id)}`,
      query: buildGetSearchParams(input),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      asset: normalizeOomnitzaRecordPayload(payload, "asset"),
      raw: payload,
    };
  },
  async list_users(input, context) {
    const payload = await requestOomnitzaJson({
      ...context,
      path: "/api/v3/users",
      query: buildListSearchParams(input),
      mode: "execute",
    });
    return normalizeOomnitzaListPayload(payload, "users");
  },
  async get_user(input, context) {
    const username = requiredString(input.username, "username", requestInputError);
    const payload = await requestOomnitzaJson({
      ...context,
      path: `/api/v3/users/${encodeURIComponent(username)}`,
      query: buildGetSearchParams(input),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      user: normalizeOomnitzaRecordPayload(payload, "user"),
      raw: payload,
    };
  },
};

export async function validateOomnitzaCredential(
  input: { apiKey: string; baseUrl?: string },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credential = resolveOomnitzaCredential(input.apiKey, input.baseUrl);
  await requestOomnitzaJson({
    ...credential,
    path: oomnitzaValidationPath,
    query: new URLSearchParams({ limit: "1" }),
    fetcher,
    signal,
    mode: "validate",
  });
  return {
    profile: {
      accountId: `oomnitza:${credential.host}`,
      displayName: `Oomnitza ${credential.host}`,
    },
    grantedScopes: [],
    metadata: {
      baseUrl: credential.baseUrl,
      host: credential.host,
      validationEndpoint: oomnitzaValidationPath,
    },
  };
}

export function resolveOomnitzaCredential(apiKey: string, baseUrlInput?: string): OomnitzaCredential {
  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    throw new ProviderRequestError(400, "Oomnitza API token is required");
  }
  return {
    apiKey: trimmedApiKey,
    ...normalizeOomnitzaBaseUrl(baseUrlInput),
  };
}

async function requestOomnitzaJson(input: OomnitzaRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, oomnitzaRequestTimeoutMs);
  try {
    const response = await input.fetcher(buildOomnitzaUrl(input.baseUrl, input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization2: input.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readOomnitzaPayload(response);
    if (!response.ok) {
      throw mapOomnitzaError(response.status, payload, input.mode, input.notFoundAsInvalidInput === true);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `Oomnitza request timed out after ${Math.ceil(oomnitzaRequestTimeoutMs / 1000)} seconds`,
      );
    }
    const message = error instanceof Error && error.message.trim() ? error.message : "request failed";
    throw new ProviderRequestError(502, `Oomnitza request failed: ${message}`);
  } finally {
    timeout.cleanup();
  }
}

async function readOomnitzaPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Oomnitza returned invalid JSON");
    }
    return { message: text };
  }
}

function mapOomnitzaError(
  status: number,
  payload: unknown,
  mode: OomnitzaRequestMode,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = extractOomnitzaErrorMessage(payload) ?? `Oomnitza request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, { status, payload });
  }
  if (status === 401 || status === 403 || (notFoundAsInvalidInput && status === 404)) {
    return new ProviderRequestError(400, message, { status, payload });
  }
  if (mode === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, { status, payload });
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, { status, payload });
  }
  return new ProviderRequestError(502, message, { status, payload });
}

function extractOomnitzaErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const direct =
    optionalString(record.message) ??
    optionalString(record.error_description) ??
    optionalString(record.description) ??
    optionalString(record.detail);
  if (direct) {
    return direct;
  }
  const errorRecord = optionalRecord(record.error);
  if (errorRecord) {
    return (
      optionalString(errorRecord.message) ??
      optionalString(errorRecord.description) ??
      optionalString(errorRecord.detail)
    );
  }
  const errorString = optionalString(record.error);
  if (errorString) {
    return errorString;
  }
  const errors = record.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    return extractOomnitzaErrorMessage(errors[0]);
  }
  return undefined;
}

function normalizeOomnitzaListPayload(payload: unknown, fieldName: "assets" | "users"): Record<string, unknown> {
  if (Array.isArray(payload)) {
    return {
      [fieldName]: payload.map((item) => normalizeOomnitzaRecordPayload(item, fieldName)),
      raw: payload,
    };
  }
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `Oomnitza ${fieldName} response must be an array or object`);
  }
  const nested = pickFirstArray(record, fieldName, "data", "items", "results");
  if (!nested) {
    throw new ProviderRequestError(502, `Oomnitza ${fieldName} response is missing an array payload`);
  }
  return {
    [fieldName]: nested.map((item) => normalizeOomnitzaRecordPayload(item, fieldName)),
    raw: payload,
  };
}

function normalizeOomnitzaRecordPayload(payload: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `Oomnitza ${fieldName} response must be an object`);
  }
  return record;
}

function pickFirstArray(record: Record<string, unknown>, ...keys: string[]): unknown[] | undefined {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return undefined;
}

function buildListSearchParams(input: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  const limit = optionalInteger(input.limit);
  const skip = optionalInteger(input.skip);
  const filter = optionalString(input.filter);
  const sortBy = optionalString(input.sortBy);
  const fields = normalizeFields(input.fields);
  if (limit !== undefined) {
    params.set("limit", String(limit));
  }
  if (skip !== undefined) {
    params.set("skip", String(skip));
  }
  if (filter) {
    params.set("filter", filter);
  }
  if (sortBy) {
    params.set("sortby", sortBy);
  }
  if (fields) {
    params.set("fields", fields);
  }
  if (input.includeDeleted === true) {
    params.set("include_deleted", "1");
  }
  return params;
}

function buildGetSearchParams(input: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  if (input.includeDeleted === true) {
    params.set("include_deleted", "1");
  }
  return params;
}

function normalizeFields(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const fields = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter((item) => item.length > 0);
  return fields.length > 0 ? fields.join(",") : undefined;
}

function normalizeOomnitzaBaseUrl(value?: string): { baseUrl: string; host: string } {
  const candidate = optionalString(value);
  if (!candidate) {
    throw new ProviderRequestError(400, "baseUrl is required");
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new ProviderRequestError(400, "baseUrl must be a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must be an HTTPS URL");
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "baseUrl must not include credentials");
  }
  if (!url.hostname) {
    throw new ProviderRequestError(400, "baseUrl host is required");
  }
  assertPublicHttpUrl(candidate, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return {
    baseUrl: trimTrailingSlash(url.toString()),
    host: url.hostname,
  };
}

function buildOomnitzaUrl(baseUrl: string, path: string, query?: URLSearchParams): string {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${baseUrl}/`);
  if (query) {
    url.search = query.toString();
  }
  return url.toString();
}

function trimTrailingSlash(value: string): string {
  let normalized = value;
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function requestInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
