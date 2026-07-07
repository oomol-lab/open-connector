import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { JumpcloudActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "jumpcloud";

const jumpcloudRegionBaseUrls = {
  us: "https://console.jumpcloud.com/api",
  eu: "https://console.eu.jumpcloud.com/api",
  in: "https://console.in.jumpcloud.com/api",
};

const defaultJumpcloudRegion = "us";
const jumpcloudValidationPath = "/systemusers";

type JumpcloudRegion = keyof typeof jumpcloudRegionBaseUrls;
type JumpcloudRequestPhase = "validate" | "execute";

interface JumpcloudListPayload {
  results: unknown[];
  totalCount: number | null;
  raw: Record<string, unknown>;
}

interface JumpcloudActionContext {
  apiKey: string;
  region?: string;
  orgId?: string;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type JumpcloudActionHandler = (input: Record<string, unknown>, context: JumpcloudActionContext) => Promise<unknown>;

export const jumpcloudActionHandlers: Record<JumpcloudActionName, JumpcloudActionHandler> = {
  list_system_users(input, context) {
    return listSystemUsers(input, context);
  },
  get_system_user(input, context) {
    return getSystemUser(input, context);
  },
  list_systems(input, context) {
    return listSystems(input, context);
  },
  get_system(input, context) {
    return getSystem(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<JumpcloudActionContext>({
  service,
  handlers: jumpcloudActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<JumpcloudActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      region: optionalString(credential.values.region),
      orgId: optionalString(credential.values.orgId),
      metadata: credential.metadata,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const region = readJumpcloudRegion(
      optionalString(credential.values.region) ?? optionalString(credential.metadata.region),
    );
    const orgId = optionalString(credential.values.orgId) ?? optionalString(credential.metadata.orgId);
    const url = createProviderProxyUrl(jumpcloudRegionBaseUrls[region], input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("x-api-key", credential.apiKey);
    headers.set("user-agent", providerUserAgent);
    if (orgId) {
      headers.set("x-org-id", orgId);
    }

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `JumpCloud request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "JumpCloud request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const region = readJumpcloudRegion(input.values.region);
    const orgId = optionalString(input.values.orgId);
    const payload = await jumpcloudGetJson({
      path: jumpcloudValidationPath,
      query: { limit: "1" },
      orgId,
      apiKey: input.apiKey,
      region,
      phase: "validate",
      fetcher,
      signal,
    });
    const listPayload = normalizeJumpcloudListPayload(payload);

    return {
      profile: {
        accountId: "api_key",
        displayName: "JumpCloud API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: jumpcloudRegionBaseUrls[region],
        region,
        orgId,
        validationEndpoint: `${jumpcloudValidationPath}?limit=1`,
        systemUserCount: listPayload.totalCount,
      }),
    };
  },
};

async function listSystemUsers(input: Record<string, unknown>, context: JumpcloudActionContext): Promise<unknown> {
  return normalizeListSystemUsers(await jumpcloudGetJson(buildReadRequest("/systemusers", input, context, "execute")));
}

async function getSystemUser(input: Record<string, unknown>, context: JumpcloudActionContext): Promise<unknown> {
  return {
    systemUser: await jumpcloudGetJson(
      buildReadRequest(
        `/systemusers/${encodeURIComponent(requiredString(input.id, "id", jumpcloudInputError))}`,
        input,
        context,
        "execute",
      ),
    ),
  };
}

async function listSystems(input: Record<string, unknown>, context: JumpcloudActionContext): Promise<unknown> {
  return normalizeListSystems(await jumpcloudGetJson(buildReadRequest("/systems", input, context, "execute")));
}

async function getSystem(input: Record<string, unknown>, context: JumpcloudActionContext): Promise<unknown> {
  return {
    system: await jumpcloudGetJson(
      buildReadRequest(
        `/systems/${encodeURIComponent(requiredString(input.id, "id", jumpcloudInputError))}`,
        input,
        context,
        "execute",
      ),
    ),
  };
}

function buildReadRequest(
  path: string,
  input: Record<string, unknown>,
  context: JumpcloudActionContext,
  phase: JumpcloudRequestPhase,
): JumpcloudRequestInput {
  const regionInput = input.region ?? context.region ?? context.metadata.region;
  const orgIdInput = input.orgId ?? context.orgId ?? context.metadata.orgId;
  return {
    path,
    query: buildJumpcloudQuery(input),
    orgId: optionalString(orgIdInput),
    apiKey: context.apiKey,
    region: readJumpcloudRegion(regionInput),
    phase,
    fetcher: context.fetcher,
    signal: context.signal,
  };
}

function buildJumpcloudQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    fields: optionalString(input.fields),
    filter: optionalString(input.filter),
    limit: stringifyOptionalInteger(input.limit),
    search: optionalString(input.search),
    skip: stringifyOptionalInteger(input.skip),
    sort: optionalString(input.sort),
  };
}

function stringifyOptionalInteger(value: unknown): string | undefined {
  const parsed = optionalInteger(value);
  return parsed === undefined ? undefined : String(parsed);
}

interface JumpcloudRequestInput {
  path: string;
  query?: Record<string, string | undefined>;
  orgId?: string;
  apiKey: string;
  region: JumpcloudRegion;
  phase: JumpcloudRequestPhase;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

async function jumpcloudGetJson(input: JumpcloudRequestInput): Promise<unknown> {
  const url = buildJumpcloudUrl(input.region, input.path);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: "GET",
      headers: jumpcloudHeaders(input.apiKey, input.orgId),
      signal: input.signal,
    });
    payload = await readJumpcloudPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `JumpCloud ${input.phase} request failed: ${error.message}`
        : `JumpCloud ${input.phase} request failed`,
    );
  }

  if (!response.ok) {
    throw createJumpcloudError(response, payload, input.phase);
  }

  return payload;
}

function jumpcloudHeaders(apiKey: string, orgId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
  if (orgId) {
    headers["x-org-id"] = orgId;
  }
  return headers;
}

function buildJumpcloudUrl(region: JumpcloudRegion, path: string): URL {
  const baseUrl = jumpcloudRegionBaseUrls[region];
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(`${normalizedBaseUrl}/${normalizedPath}`);
}

async function readJumpcloudPayload(response: Response): Promise<unknown> {
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

function createJumpcloudError(
  response: Response,
  payload: unknown,
  phase: JumpcloudRequestPhase,
): ProviderRequestError {
  const message = extractJumpcloudErrorMessage(payload) ?? response.statusText;

  if (response.status === 429) {
    return new ProviderRequestError(429, message || "JumpCloud rate limit exceeded", payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message || "JumpCloud API key is invalid", payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message || "JumpCloud credential is unauthorized", payload);
  }
  if (phase === "execute" && [400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message || "JumpCloud request is invalid", payload);
  }

  return new ProviderRequestError(response.status || 500, message || "JumpCloud request failed", payload);
}

function extractJumpcloudErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.error_description) ??
    optionalString(record.status)
  );
}

function normalizeListSystemUsers(payload: unknown): Record<string, unknown> {
  const listPayload = normalizeJumpcloudListPayload(payload);
  return {
    results: listPayload.results,
    meta: {
      totalCount: listPayload.totalCount,
    },
    raw: listPayload.raw,
  };
}

function normalizeListSystems(payload: unknown): Record<string, unknown> {
  const listPayload = normalizeJumpcloudListPayload(payload);
  return {
    results: listPayload.results,
    meta: {
      totalCount: listPayload.totalCount,
    },
    raw: listPayload.raw,
  };
}

function normalizeJumpcloudListPayload(payload: unknown): JumpcloudListPayload {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "JumpCloud list response must be an object", payload);
  }

  return {
    results: Array.isArray(record.results) ? record.results : [],
    totalCount: typeof record.totalCount === "number" ? record.totalCount : null,
    raw: record,
  };
}

function readJumpcloudRegion(value: unknown): JumpcloudRegion {
  const region = optionalString(value);
  if (region === "eu" || region === "in" || region === "us") {
    return region;
  }
  if (!region) {
    return defaultJumpcloudRegion;
  }
  throw new ProviderRequestError(400, "region must be one of us, eu, or in");
}

function jumpcloudInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
