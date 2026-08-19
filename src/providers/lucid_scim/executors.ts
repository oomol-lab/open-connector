import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "lucid_scim";
const lucidScimApiBaseUrl = "https://users.lucid.app/scim/v2";
const lucidScimConfigPath = "/ServiceProviderConfig";

type RequestPhase = "validate" | "execute";
type LucidScimActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const lucidScimActionHandlers: ProviderActionHandlers<"lucid_scim", LucidScimActionHandler> = {
  async get_service_provider_config(_input, context) {
    const payload = await requestLucidScimJson({
      path: lucidScimConfigPath,
      context,
      phase: "execute",
    });

    return {
      config: requireObjectPayload(payload, "Lucid SCIM service provider config"),
    };
  },
  async list_users(input, context) {
    const payload = await requestLucidScimJson({
      path: "/Users",
      context,
      phase: "execute",
      searchParams: buildListSearchParams(input),
    });

    return normalizeListResponse(payload, "users");
  },
  async get_user(input, context) {
    const id = readRequiredString(input, "id", "Lucid SCIM user ID");
    const payload = await requestLucidScimJson({
      path: `/Users/${encodeURIComponent(id)}`,
      context,
      phase: "execute",
      searchParams: buildAttributeSearchParams(input),
    });

    return {
      user: requireObjectPayload(payload, "Lucid SCIM user"),
    };
  },
  async list_groups(input, context) {
    const payload = await requestLucidScimJson({
      path: "/Groups",
      context,
      phase: "execute",
      searchParams: buildListSearchParams(input),
    });

    return normalizeListResponse(payload, "groups");
  },
  async get_group(input, context) {
    const id = readRequiredString(input, "id", "Lucid SCIM group ID");
    const payload = await requestLucidScimJson({
      path: `/Groups/${encodeURIComponent(id)}`,
      context,
      phase: "execute",
      searchParams: buildAttributeSearchParams(input),
    });

    return {
      group: requireObjectPayload(payload, "Lucid SCIM group"),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, lucidScimActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiKey = input.apiKey.trim();
    if (!apiKey) {
      throw new ProviderRequestError(400, "Lucid SCIM bearer token is required.");
    }

    const payload = await requestLucidScimJson({
      path: lucidScimConfigPath,
      context: {
        apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const config = requireObjectPayload(payload, "Lucid SCIM service provider config");

    return {
      profile: {
        displayName: "Lucid SCIM Bearer Token",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: lucidScimApiBaseUrl,
        validationEndpoint: lucidScimConfigPath,
        documentationUri: optionalString(config.documentationUri),
      },
    };
  },
};

async function requestLucidScimJson(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: RequestPhase;
  searchParams?: URLSearchParams;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    const url = new URL(`${lucidScimApiBaseUrl}${input.path}`);
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
      signal: input.context.signal,
    });
    payload = await readLucidScimPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Lucid SCIM request failed: ${error.message}` : "Lucid SCIM request failed",
    );
  }

  if (!response.ok) {
    throw createLucidScimError(response, payload, input.phase);
  }

  return payload;
}

async function readLucidScimPayload(response: Response): Promise<unknown> {
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

function createLucidScimError(response: Response, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const message =
    extractLucidScimErrorMessage(payload) ??
    response.statusText ??
    `Lucid SCIM request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 409) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractLucidScimErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  if (!isPlainObject(payload)) {
    return undefined;
  }

  for (const key of ["detail", "message", "error", "error_description"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function buildListSearchParams(input: Record<string, unknown>): URLSearchParams {
  const searchParams = buildAttributeSearchParams(input);
  appendSearchParam(searchParams, "startIndex", optionalInteger(input.startIndex));
  appendSearchParam(searchParams, "count", optionalInteger(input.count));
  appendSearchParam(searchParams, "filter", optionalString(input.filter));
  return searchParams;
}

function buildAttributeSearchParams(input: Record<string, unknown>): URLSearchParams {
  const searchParams = new URLSearchParams();
  appendCommaListSearchParam(searchParams, "attributes", readOptionalStringArray(input.attributes));
  appendCommaListSearchParam(searchParams, "excludedAttributes", readOptionalStringArray(input.excludedAttributes));
  return searchParams;
}

function appendSearchParam(searchParams: URLSearchParams, key: string, value: string | number | undefined): void {
  if (value !== undefined) {
    searchParams.set(key, String(value));
  }
}

function appendCommaListSearchParam(searchParams: URLSearchParams, key: string, value: string[] | undefined): void {
  if (value?.length) {
    searchParams.set(key, value.join(","));
  }
}

function normalizeListResponse(payload: unknown, resourcesKey: "users" | "groups"): Record<string, unknown> {
  const record = requireObjectPayload(payload, "Lucid SCIM list response");
  const resources = readObjectArray(record.Resources);
  return {
    [resourcesKey]: resources,
    totalResults: readInteger(record.totalResults, resources.length),
    startIndex: readInteger(record.startIndex, 1),
    itemsPerPage: readInteger(record.itemsPerPage, resources.length),
    schemas: readOptionalStringArray(record.schemas) ?? [],
    raw: record,
  };
}

function requireObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(payload)) {
    throw new ProviderRequestError(502, `${label} response must be a JSON object.`, payload);
  }
  return payload;
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isPlainObject);
}

function readInteger(value: unknown, fallback: number): number {
  const parsed = optionalInteger(value);
  return parsed === undefined ? fallback : parsed;
}

function readRequiredString(input: Record<string, unknown>, key: string, label: string): string {
  const value = optionalString(input[key]);
  if (!value) {
    throw new ProviderRequestError(400, `${label} is required.`);
  }
  return value;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
