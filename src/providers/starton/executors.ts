import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { nullableString, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "starton";
const startonApiBaseUrl = "https://api.starton.com";
const startonDefaultRequestTimeoutMs = 30_000;

type StartonPhase = "validate" | "execute";
type StartonActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const startonActionHandlers: ProviderActionHandlers<"starton", StartonActionHandler> = {
  async list_pins(input, context) {
    const payload = await requestStartonJson({
      apiKey: context.apiKey,
      path: "/v3/ipfs/pin",
      query: {
        cid: optionalString(input.cid),
        includeDirectoryContent: optionalBoolean(input.includeDirectoryContent),
        limit: readOptionalIntegerString(input.limit),
        name: optionalString(input.name),
        page: readOptionalIntegerString(input.page),
        status: optionalString(input.status),
      },
      method: "GET",
      context,
      phase: "execute",
    });
    const root = requireObject(payload, "Starton list pins response");
    return {
      pins: normalizePins(root.items),
      pagination: normalizePagination(root.meta),
    };
  },
  async get_pin(input, context) {
    const pinId = requireTrimmedString(input.id, "id");
    const payload = await requestStartonJson({
      apiKey: context.apiKey,
      path: `/v3/ipfs/pin/${encodeURIComponent(pinId)}`,
      query: {
        includeDirectoryContent: optionalBoolean(input.includeDirectoryContent),
      },
      method: "GET",
      context,
      phase: "execute",
    });
    return { pin: normalizePin(payload) };
  },
  async create_json_pin(input, context) {
    const payload = await requestStartonJson({
      apiKey: context.apiKey,
      path: "/v3/ipfs/json",
      method: "POST",
      body: compactUndefined({
        name: requireTrimmedString(input.name, "name"),
        content: requireLooseObject(input.content, "content"),
        metadata: optionalRecord(input.metadata),
      }),
      context,
      phase: "execute",
    });
    return { pin: normalizePin(payload) };
  },
  async pin_existing_file(input, context) {
    const payload = await requestStartonJson({
      apiKey: context.apiKey,
      path: "/v3/ipfs/pin",
      method: "POST",
      body: compactUndefined({
        cid: requireTrimmedString(input.cid, "cid"),
        name: optionalString(input.name),
        metadata: optionalRecord(input.metadata),
      }),
      context,
      phase: "execute",
    });
    return { pin: normalizePin(payload) };
  },
  async delete_pin(input, context) {
    const pinId = requireTrimmedString(input.id, "id");
    const payload = await requestStartonJson({
      apiKey: context.apiKey,
      path: `/v3/ipfs/pin/${encodeURIComponent(pinId)}`,
      method: "DELETE",
      context,
      phase: "execute",
    });
    return { deleted: payload === true || payload === null };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, startonActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ApiKeyProviderContext = {
      apiKey: input.apiKey,
      fetcher,
      signal,
    };
    const payload = await requestStartonJson({
      apiKey: input.apiKey,
      path: "/v3/ipfs/pin",
      query: { limit: "2", page: "0" },
      method: "GET",
      context,
      phase: "validate",
    });
    const root = requireObject(payload, "Starton validation response");
    const pins = normalizePins(root.items);
    const pagination = normalizePagination(root.meta);

    return {
      profile: {
        accountId: "starton-api-key",
        displayName: "Starton API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: startonApiBaseUrl,
        validationEndpoint: "/v3/ipfs/pin",
        pinCount: pins.length,
        totalPinCount: pagination.totalItems,
      },
    };
  },
};

async function requestStartonJson(input: {
  apiKey: string;
  path: string;
  method: "GET" | "POST" | "DELETE";
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: StartonPhase;
  query?: Record<string, string | boolean | undefined>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, startonDefaultRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(buildStartonUrl(input.path, input.query ?? {}), {
      method: input.method,
      headers: startonHeaders(input.apiKey, input.body !== undefined),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readStartonPayload(response);
    if (!response.ok) {
      throw createStartonError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Starton request timed out.");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Starton request failed: ${error.message}` : "Starton request failed.",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildStartonUrl(path: string, query: Record<string, string | boolean | undefined>): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${startonApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function startonHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return compactUndefined({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
    "content-type": hasBody ? "application/json" : undefined,
  }) as Record<string, string>;
}

async function readStartonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Starton returned invalid JSON.");
  }
}

function createStartonError(response: Response, payload: unknown, phase: StartonPhase): ProviderRequestError {
  const message = extractStartonErrorMessage(payload) ?? `Starton request failed with status ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 500, message, payload);
}

function extractStartonErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return record ? (optionalString(record.message) ?? optionalString(record.errorCode)) : undefined;
}

function normalizePins(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Starton returned invalid pin list.", value);
  }
  return value.map((item) => normalizePin(item));
}

function normalizePin(value: unknown): Record<string, unknown> {
  const record = requireObject(value, "Starton pin");
  return compactUndefined({
    id: requireOptionalString(record.id, "Starton pin id"),
    projectId: requireOptionalString(record.projectId, "Starton pin projectId"),
    status: requireOptionalString(record.status, "Starton pin status"),
    cid: nullableString(record.cid),
    name: nullableString(record.name),
    type: nullableString(record.type),
    size: optionalNumber(record.size) ?? (record.size === null ? null : undefined),
    createdAt: nullableString(record.createdAt),
    updatedAt: nullableString(record.updatedAt),
    delegates: Array.isArray(record.delegates) ? record.delegates.map(String) : undefined,
    origins: Array.isArray(record.origins) ? record.origins.map(String) : undefined,
    metadata: optionalRecord(record.metadata),
    directoryContent: Array.isArray(record.directoryContent)
      ? record.directoryContent.map((item) => normalizeDirectoryContent(item))
      : undefined,
  });
}

function normalizeDirectoryContent(value: unknown): Record<string, unknown> {
  const record = requireObject(value, "Starton directory content");
  return compactUndefined({
    cid: requireOptionalString(record.cid, "Starton directory content cid"),
    name: requireOptionalString(record.name, "Starton directory content name"),
    size: requireOptionalNumber(record.size, "Starton directory content size"),
    type: optionalString(record.type),
  });
}

function normalizePagination(value: unknown): Record<string, number> {
  const record = requireObject(value, "Starton pagination");
  return {
    currentPage: requireOptionalNumber(record.currentPage, "Starton pagination currentPage"),
    itemCount: requireOptionalNumber(record.itemCount, "Starton pagination itemCount"),
    itemsPerPage: requireOptionalNumber(record.itemsPerPage, "Starton pagination itemsPerPage"),
    totalItems: requireOptionalNumber(record.totalItems, "Starton pagination totalItems"),
    totalPages: requireOptionalNumber(record.totalPages, "Starton pagination totalPages"),
  };
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is missing.`, value);
  }
  return record;
}

function requireLooseObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object.`);
  }
  return record;
}

function requireTrimmedString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required.`);
  }
  return parsed;
}

function requireOptionalString(value: unknown, label: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `${label} is missing.`, value);
  }
  return parsed;
}

function requireOptionalNumber(value: unknown, label: string): number {
  const parsed = optionalNumber(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `${label} is missing.`, value);
  }
  return parsed;
}

function readOptionalIntegerString(value: unknown): string | undefined {
  return typeof value === "number" && Number.isInteger(value) ? String(value) : undefined;
}

function compactUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.starton.com",
  auth: { type: "api_key_header", name: "x-api-key" },
});
