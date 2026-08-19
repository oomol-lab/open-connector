import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "the_swarm";
const theSwarmApiBaseUrl = "https://bee.theswarm.com";
const theSwarmValidationPath = "/credits/usage";

type TheSwarmRequestMode = "validate" | "execute";
type TheSwarmRequestMethod = "GET" | "POST";
type TheSwarmActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const theSwarmActionHandlers: ProviderActionHandlers<"the_swarm", TheSwarmActionHandler> = {
  async get_credit_usage(_input, context) {
    return getCreditUsage(context, "execute");
  },
  async search_profiles(input, context) {
    assertStablePaginationLimit(input);
    const payload = await requestTheSwarmJson({
      path: "/v3/profiles/search",
      method: "POST",
      body: buildSearchBody(input, true),
      context,
      mode: "execute",
    });
    return normalizeSearchResponse(payload);
  },
  async fetch_profiles(input, context) {
    assertHasIdentifier(input, ["ids", "linkedinNames", "linkedinIds", "linkedinEntityIds"], "profile");
    const payload = await requestTheSwarmJson({
      path: "/v3/profiles/fetch",
      method: "POST",
      body: compactObject({
        ids: input.ids,
        linkedin_names: input.linkedinNames,
        linkedin_ids: input.linkedinIds,
        linkedin_entity_ids: input.linkedinEntityIds,
        fields: input.fields,
      }),
      context,
      mode: "execute",
    });
    const record = requireObject(payload, "The Swarm returned an invalid fetch profiles payload");
    return {
      profiles: readObjectArray(record.results, "results"),
      notFound: readOptionalStringArray(record.not_found, "not_found"),
      raw: record,
    };
  },
  async search_companies(input, context) {
    assertStablePaginationLimit(input);
    const payload = await requestTheSwarmJson({
      path: "/v3/companies/search",
      method: "POST",
      body: buildSearchBody(input, false),
      context,
      mode: "execute",
    });
    return normalizeSearchResponse(payload);
  },
  async fetch_companies(input, context) {
    assertHasIdentifier(input, ["ids", "linkedinNames", "linkedinIds"], "company");
    const payload = await requestTheSwarmJson({
      path: "/v3/companies/fetch",
      method: "POST",
      body: compactObject({
        ids: input.ids,
        linkedin_names: input.linkedinNames,
        linkedin_ids: input.linkedinIds,
        fields: input.fields,
      }),
      context,
      mode: "execute",
    });
    const record = requireObject(payload, "The Swarm returned an invalid fetch companies payload");
    return {
      companies: readObjectArray(record.results, "results"),
      notFound: readOptionalStringArray(record.not_found, "not_found"),
      raw: record,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, theSwarmActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const usage = await getCreditUsage({ apiKey: input.apiKey, fetcher, signal }, "validate");

    return {
      profile: {
        accountId: `the_swarm:api_key:${hashApiKey(input.apiKey)}`,
        displayName: "The Swarm API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: theSwarmApiBaseUrl,
        validationEndpoint: theSwarmValidationPath,
        usage: usage.usage,
      },
    };
  },
};

async function getCreditUsage(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  mode: TheSwarmRequestMode,
): Promise<{ usage: number; raw: Record<string, unknown> }> {
  const payload = await requestTheSwarmJson({
    path: theSwarmValidationPath,
    method: "GET",
    context,
    mode,
  });
  const record = requireObject(payload, "The Swarm returned an invalid credit usage payload");
  const usage = readNonNegativeInteger(record.usage, "usage");

  return {
    usage,
    raw: record,
  };
}

function buildSearchBody(input: Record<string, unknown>, includeInNetworkOnly: boolean): Record<string, unknown> {
  return compactObject({
    query: input.query,
    limit: input.limit,
    pagination_token: input.paginationToken,
    stable_pagination: input.stablePagination,
    ...(includeInNetworkOnly ? { in_network_only: input.inNetworkOnly } : {}),
  });
}

async function requestTheSwarmJson(input: {
  path: string;
  method: TheSwarmRequestMethod;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  mode: TheSwarmRequestMode;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": input.context.apiKey,
  };
  if (input.method === "POST") {
    headers["content-type"] = "application/json";
  }

  const response = await input.context.fetcher(new URL(input.path, theSwarmApiBaseUrl), {
    method: input.method,
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: input.context.signal,
  });
  const payload = await readTheSwarmPayload(response);

  if (!response.ok) {
    throw createTheSwarmError(response.status, payload, input.mode);
  }

  return payload;
}

async function readTheSwarmPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "The Swarm returned invalid JSON");
  }
}

function normalizeSearchResponse(payload: unknown): Record<string, unknown> {
  const record = requireObject(payload, "The Swarm returned an invalid search payload");
  return {
    ids: readRequiredStringArray(record.ids, "ids"),
    totalCount: readNonNegativeInteger(record.total_count, "total_count"),
    paginationToken: optionalString(record.pagination_token) ?? null,
    raw: record,
  };
}

function createTheSwarmError(status: number, payload: unknown, mode: TheSwarmRequestMode): ProviderRequestError {
  const message = readTheSwarmErrorMessage(payload) ?? `The Swarm API request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (mode === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (mode === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 402) {
    return new ProviderRequestError(402, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function readTheSwarmErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = optionalString(record.message) ?? optionalString(record.error);
  if (message) {
    return message;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    const firstError = errors.find((error) => error != null);
    if (typeof firstError === "string" && firstError.trim()) {
      return firstError.trim();
    }
    const firstErrorRecord = optionalRecord(firstError);
    const firstErrorMessage = optionalString(firstErrorRecord?.message) ?? optionalString(firstErrorRecord?.detail);
    if (firstErrorMessage) {
      return firstErrorMessage;
    }
  }

  return undefined;
}

function assertStablePaginationLimit(input: Record<string, unknown>): void {
  if (input.stablePagination === true && input.limit !== 1000) {
    throw new ProviderRequestError(400, "limit must be 1000 when stablePagination is true");
  }
}

function assertHasIdentifier(input: Record<string, unknown>, keys: string[], label: "profile" | "company"): void {
  const hasIdentifier = keys.some((key) => Array.isArray(input[key]) && (input[key] as unknown[]).length > 0);
  if (!hasIdentifier) {
    throw new ProviderRequestError(400, `At least one ${label} identifier array is required.`);
  }
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function readObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `The Swarm returned invalid ${fieldName}`);
  }

  return value.map((item, index) => requireObject(item, `The Swarm returned invalid ${fieldName}[${index}]`));
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] {
  if (value == null) {
    return [];
  }

  return readRequiredStringArray(value, fieldName);
}

function readRequiredStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `The Swarm returned invalid ${fieldName}`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new ProviderRequestError(502, `The Swarm returned invalid ${fieldName}[${index}]`);
    }
    return item;
  });
}

function readNonNegativeInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ProviderRequestError(502, `The Swarm returned invalid ${fieldName}`);
  }
  return value;
}

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://bee.theswarm.com",
  auth: { type: "api_key_header", name: "x-api-key" },
});
