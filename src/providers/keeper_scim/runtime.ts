import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const keeperScimRegionBaseUrls = {
  us: "https://keepersecurity.com/api/rest/scim/v2",
  eu: "https://keepersecurity.eu/api/rest/scim/v2",
  au: "https://keepersecurity.com.au/api/rest/scim/v2",
  jp: "https://keepersecurity.jp/api/rest/scim/v2",
  ca: "https://keepersecurity.ca/api/rest/scim/v2",
  gov: "https://govcloud.keepersecurity.us/api/rest/scim/v2",
} as const;

const defaultKeeperScimRegion = "us";
const keeperScimConfigPath = "/ServiceProviderConfig";

type KeeperScimRegion = keyof typeof keeperScimRegionBaseUrls;
type KeeperScimRequestPhase = "validate" | "execute";

interface KeeperScimConfig {
  region: KeeperScimRegion;
  nodeId: string;
  apiBaseUrl: string;
  nodeBaseUrl: string;
}

interface KeeperScimActionContext {
  apiKey: string;
  config: KeeperScimConfig;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const keeperScimActionHandlers: ProviderActionHandlers<
  "keeper_scim",
  ProviderRuntimeHandler<KeeperScimActionContext>
> = {
  async get_service_provider_config(_input, context) {
    const payload = await requestKeeperScimJson({
      path: keeperScimConfigPath,
      context,
      phase: "execute",
    });

    return {
      config: requireObjectPayload(payload, "Keeper SCIM service provider config"),
    };
  },
  async list_users(input, context) {
    const payload = await requestKeeperScimJson({
      path: "/Users",
      context,
      phase: "execute",
      searchParams: buildUsersSearchParams(input),
    });

    return normalizeListResponse(payload, "users");
  },
  async get_user(input, context) {
    const id = readRequiredString(input, "id", "Keeper SCIM user ID");
    const payload = await requestKeeperScimJson({
      path: `/Users/${encodeURIComponent(id)}`,
      context,
      phase: "execute",
    });

    return {
      user: requireObjectPayload(payload, "Keeper SCIM user"),
    };
  },
  async list_groups(input, context) {
    const payload = await requestKeeperScimJson({
      path: "/Groups",
      context,
      phase: "execute",
      searchParams: buildGroupsSearchParams(input),
    });

    return normalizeListResponse(payload, "groups");
  },
  async get_group(input, context) {
    const id = readRequiredString(input, "id", "Keeper SCIM group ID");
    const payload = await requestKeeperScimJson({
      path: `/Groups/${encodeURIComponent(id)}`,
      context,
      phase: "execute",
      searchParams: buildExcludedAttributesSearchParams(input),
    });

    return {
      group: requireObjectPayload(payload, "Keeper SCIM group"),
    };
  },
};

export async function validateKeeperScimCredential(
  input: { apiKey: string; values: Record<string, string> },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const config = resolveKeeperScimConfig({ values: input.values });
  const payload = await requestKeeperScimJson({
    path: keeperScimConfigPath,
    context: {
      apiKey: input.apiKey,
      config,
      fetcher: options.fetcher,
      signal: options.signal,
    },
    phase: "validate",
  });
  requireObjectPayload(payload, "Keeper SCIM service provider config");

  return {
    profile: {
      accountId: `keeper_scim:${config.region}:${config.nodeId}`,
      displayName: `Keeper SCIM node ${config.nodeId}`,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: config.apiBaseUrl,
      nodeBaseUrl: config.nodeBaseUrl,
      nodeId: config.nodeId,
      region: config.region,
      validationEndpoint: keeperScimConfigPath,
    },
  };
}

export function resolveKeeperScimConfig(input: {
  providerMetadata?: Record<string, unknown>;
  values?: Record<string, unknown>;
}): KeeperScimConfig {
  const nodeId = optionalString(input.values?.nodeId) ?? optionalString(input.providerMetadata?.nodeId);
  if (!nodeId) {
    throw new ProviderRequestError(400, "Keeper SCIM nodeId is required");
  }

  const region = readKeeperScimRegion(
    optionalString(input.values?.region) ?? optionalString(input.providerMetadata?.region),
  );
  const apiBaseUrl = keeperScimRegionBaseUrls[region];
  return {
    region,
    nodeId,
    apiBaseUrl,
    nodeBaseUrl: `${apiBaseUrl}/${encodeURIComponent(nodeId)}`,
  };
}

async function requestKeeperScimJson(input: {
  path: string;
  context: KeeperScimActionContext;
  phase: KeeperScimRequestPhase;
  searchParams?: URLSearchParams;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const url = new URL(`${input.context.config.nodeBaseUrl}${input.path}`);
    for (const [key, value] of input.searchParams ?? []) {
      url.searchParams.append(key, value);
    }

    response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/scim+json, application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    payload = await readKeeperScimPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Keeper SCIM request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Keeper SCIM request failed: ${error.message}` : "Keeper SCIM request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createKeeperScimError(response, payload, input.phase);
  }

  return payload;
}

async function readKeeperScimPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createKeeperScimError(
  response: Response,
  payload: unknown,
  phase: KeeperScimRequestPhase,
): ProviderRequestError {
  const message =
    extractKeeperScimErrorMessage(payload) ??
    response.statusText ??
    `Keeper SCIM request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 409) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractKeeperScimErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  return (
    optionalString(record?.detail) ??
    optionalString(record?.error_description) ??
    optionalString(record?.error) ??
    optionalString(record?.message)
  );
}

function readKeeperScimRegion(value: string | undefined): KeeperScimRegion {
  const normalized = (value ?? defaultKeeperScimRegion).toLowerCase();
  if (Object.hasOwn(keeperScimRegionBaseUrls, normalized)) {
    return normalized as KeeperScimRegion;
  }
  throw new ProviderRequestError(400, `unsupported Keeper SCIM data center: ${value}`);
}

function buildUsersSearchParams(input: Record<string, unknown>): URLSearchParams {
  const params = buildPaginationSearchParams(input);
  const filter = optionalString(input.filter);
  if (filter) {
    params.set("filter", filter);
  }
  return params;
}

function buildGroupsSearchParams(input: Record<string, unknown>): URLSearchParams {
  const params = buildPaginationSearchParams(input);
  appendExcludedAttributes(params, input);
  return params;
}

function buildExcludedAttributesSearchParams(input: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  appendExcludedAttributes(params, input);
  return params;
}

function buildPaginationSearchParams(input: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  const startIndex = optionalInteger(input.startIndex);
  const count = optionalInteger(input.count);
  if (startIndex !== undefined) {
    params.set("startIndex", String(startIndex));
  }
  if (count !== undefined) {
    params.set("count", String(count));
  }
  return params;
}

function appendExcludedAttributes(params: URLSearchParams, input: Record<string, unknown>): void {
  const excludedAttributes = readStringArray(input.excludedAttributes);
  if (excludedAttributes.length > 0) {
    params.set("excludedAttributes", excludedAttributes.join(","));
  }
}

function normalizeListResponse(payload: unknown, key: "users" | "groups"): Record<string, unknown> {
  const record = requireObjectPayload(payload, "Keeper SCIM list response");
  const resources = Array.isArray(record.Resources) ? record.Resources : [];
  return {
    [key]: resources.map((resource) => requireObjectPayload(resource, `Keeper SCIM ${key} item`)),
    totalResults: optionalInteger(record.totalResults) ?? resources.length,
    startIndex: optionalInteger(record.startIndex) ?? 1,
    itemsPerPage: optionalInteger(record.itemsPerPage) ?? resources.length,
    schemas: readStringArray(record.schemas),
    raw: record,
  };
}

function requireObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} response was not an object`);
  }
  return record;
}

function readRequiredString(input: Record<string, unknown>, key: string, label: string): string {
  const value = optionalString(input[key]);
  if (!value) {
    throw new ProviderRequestError(400, `${label} is required`);
  }
  return value;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}
