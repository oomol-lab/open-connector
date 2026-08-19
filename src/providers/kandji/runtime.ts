import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const kandjiDefaultRequestTimeoutMs = 30_000;

type KandjiPhase = "validate" | "execute";
type KandjiActionHandler = (input: Record<string, unknown>, context: KandjiActionContext) => Promise<unknown>;

export interface KandjiActionContext {
  apiKey: string;
  apiUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const kandjiActionHandlers: ProviderActionHandlers<"kandji", KandjiActionHandler> = {
  async list_blueprints(input, context) {
    const payload = await requestKandjiJson({
      apiUrl: context.apiUrl,
      apiKey: context.apiKey,
      path: "/api/v1/blueprints",
      query: compactObject({
        id: optionalString(input.id),
        id__in: readStringList(input.idIn).join(",") || undefined,
        name: optionalString(input.name),
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    const record = requireObject(payload, "Kandji blueprints response");

    return {
      count: typeof record.count === "number" ? record.count : null,
      pagination: normalizePagination(record),
      blueprints: normalizeBlueprintList(record.results),
    };
  },

  async get_blueprint(input, context) {
    const payload = await requestKandjiJson({
      apiUrl: context.apiUrl,
      apiKey: context.apiKey,
      path: `/api/v1/blueprints/${encodeURIComponent(readRequiredString(input.blueprintId, "blueprintId"))}`,
      query: {},
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      blueprint: normalizeBlueprint(requireObject(payload, "Kandji blueprint response")),
    };
  },

  async list_users(input, context) {
    const archived = optionalBoolean(input.archived);
    const payload = await requestKandjiJson({
      apiUrl: context.apiUrl,
      apiKey: context.apiKey,
      path: "/api/v1/users",
      query: compactObject({
        email: optionalString(input.email),
        id: optionalString(input.id),
        integration_id: optionalString(input.integrationId),
        archived: archived === undefined ? undefined : String(archived),
        cursor: optionalString(input.cursor),
        sizePerPage: optionalInteger(input.sizePerPage),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    const record = requireObject(payload, "Kandji users response");

    return {
      pagination: normalizePagination(record),
      users: normalizeUserList(record.results),
    };
  },

  async get_user(input, context) {
    const payload = await requestKandjiJson({
      apiUrl: context.apiUrl,
      apiKey: context.apiKey,
      path: `/api/v1/users/${encodeURIComponent(readRequiredString(input.userId, "userId"))}`,
      query: {},
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      user: normalizeUser(requireObject(payload, "Kandji user response")),
    };
  },
};

export async function validateKandjiCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiUrl = normalizeKandjiApiUrl(input.values.apiUrl);
  const payload = await requestKandjiJson({
    apiUrl,
    apiKey: input.apiKey,
    path: "/api/v1/blueprints",
    query: { limit: 1 },
    fetcher,
    signal,
    phase: "validate",
  });
  const record = requireObject(payload, "Kandji credential validation response");
  const blueprints = normalizeBlueprintList(record.results);
  const host = new URL(apiUrl).host;

  return {
    profile: {
      accountId: `kandji:${hashValue(host).slice(0, 16)}`,
      displayName: `Kandji ${host}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiUrl,
      validationEndpoint: "/api/v1/blueprints",
      firstBlueprintName: blueprints[0]?.name,
    }),
  };
}

export function normalizeKandjiApiUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, "apiUrl is required");
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ProviderRequestError(400, "apiUrl must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "apiUrl must use https");
  }

  if (!isAllowedKandjiApiHost(url.hostname)) {
    throw new ProviderRequestError(400, "apiUrl host must end with .api.kandji.io or .api.eu.kandji.io");
  }

  if (url.pathname !== "/") {
    throw new ProviderRequestError(400, "apiUrl must be the Kandji API root URL");
  }

  url.search = "";
  url.hash = "";
  return url.origin;
}

async function requestKandjiJson(input: {
  apiUrl: string;
  apiKey: string;
  path: string;
  query: Record<string, string | number | boolean | undefined>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: KandjiPhase;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, kandjiDefaultRequestTimeoutMs);

  try {
    const response = await input.fetcher(buildKandjiUrl(input.apiUrl, input.path, input.query), {
      method: "GET",
      headers: buildKandjiHeaders(input.apiKey),
      signal: timeout.signal,
    });
    const payload = await readKandjiPayload(response);

    if (!response.ok) {
      throw createKandjiError(response.status, payload, input.phase, input.notFoundAsInvalidInput);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Kandji request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Kandji request failed: ${error.message}` : "Kandji request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function isAllowedKandjiApiHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return hasTenantSuffix(lower, ".api.kandji.io") || hasTenantSuffix(lower, ".api.eu.kandji.io");
}

function hasTenantSuffix(hostname: string, suffix: string): boolean {
  return hostname.endsWith(suffix) && hostname.length > suffix.length;
}

function buildKandjiUrl(
  apiUrl: string,
  path: string,
  query: Record<string, string | number | boolean | undefined>,
): URL {
  const url = new URL(path, `${apiUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildKandjiHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

async function readKandjiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Kandji returned invalid JSON");
  }
}

function createKandjiError(
  status: number,
  payload: unknown,
  phase: KandjiPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message = extractKandjiErrorMessage(payload) ?? `Kandji request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message);
  }
  if (phase === "execute" && (status === 404 || status === 400) && notFoundAsInvalidInput) {
    return new ProviderRequestError(status, message);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function extractKandjiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.detail) ?? optionalString(record.message) ?? optionalString(record.error);
}

function normalizePagination(record: Record<string, unknown>) {
  return {
    next: optionalString(record.next) ?? null,
    previous: optionalString(record.previous) ?? null,
  };
}

function normalizeBlueprintList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeBlueprint(requireObject(item, "Kandji blueprint record")));
}

function normalizeBlueprint(record: Record<string, unknown>) {
  return {
    id: optionalString(record.id) ?? "",
    name: optionalString(record.name) ?? "",
    type: optionalString(record.type) ?? null,
    description: optionalString(record.description) ?? null,
    computersCount: optionalInteger(record.computers_count) ?? null,
    raw: record,
  };
}

function normalizeUserList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeUser(requireObject(item, "Kandji user record")));
}

function normalizeUser(record: Record<string, unknown>) {
  return {
    id: optionalString(record.id) ?? "",
    email: optionalString(record.email) ?? null,
    name: optionalString(record.name) ?? null,
    active: optionalBoolean(record.active) ?? null,
    archived: optionalBoolean(record.archived) ?? null,
    deviceCount: optionalInteger(record.device_count) ?? null,
    raw: record,
  };
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is not a JSON object`);
  }
  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item)).filter((item) => item.trim());
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
