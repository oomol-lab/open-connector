import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { DiscolikeActionName } from "./actions.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const discolikeApiBaseUrl = "https://api.discolike.com/v1";

const discolikeDefaultRequestTimeoutMs = 30_000;

type DiscolikePhase = "validate" | "execute";
type DiscolikeQueryValue = string | number | boolean | readonly string[] | undefined;
type DiscolikeContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type DiscolikeActionHandler = (input: Record<string, unknown>, context: DiscolikeContext) => Promise<unknown>;

export const discolikeActionHandlers: Record<DiscolikeActionName, DiscolikeActionHandler> = {
  async discover_companies(input, context) {
    const payload = await requestDiscolikeJson({
      path: "/discover",
      query: buildDiscoverQuery(input),
      context,
      phase: "execute",
    });

    return {
      results: objectArray(payload, "discover results", (message) => new ProviderRequestError(502, message)),
    };
  },
  async count_matching_domains(input, context) {
    const payload = await requestDiscolikeJson({
      path: "/count",
      query: buildCountQuery(input),
      context,
      phase: "execute",
    });
    const record = requireObject(payload, "count response");

    return {
      count: requireNumber(record.count, "count"),
    };
  },
  async get_business_profile(input, context) {
    return {
      company: await requestDiscolikeDomainObject("/bizdata", input, context),
    };
  },
  async get_digital_footprint_score(input, context) {
    return {
      score: await requestDiscolikeDomainObject("/score", input, context),
    };
  },
  async get_growth_metrics(input, context) {
    return {
      growth: await requestDiscolikeDomainObject("/growth", input, context),
    };
  },
  async get_certificate_metrics(input, context) {
    return {
      metrics: await requestDiscolikeDomainObject("/metrics", input, context),
    };
  },
  async get_usage(_input, context) {
    return {
      usage: await requestDiscolikeJson({
        path: "/usage",
        query: {},
        context,
        phase: "execute",
      }),
    };
  },
};

export async function validateDiscolikeCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestDiscolikeJson({
    path: "/usage",
    query: {},
    context: { apiKey, fetcher, signal },
    phase: "validate",
  });
  const usage = requireObject(payload, "usage response");
  const accountStatus = optionalString(usage.account_status);

  return {
    profile: {
      accountId: "api_key",
      displayName: accountStatus ? `DiscoLike ${accountStatus}` : "DiscoLike API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/usage",
      accountStatus,
      monthToDateRequests: optionalNumber(usage.month_to_date_requests),
      monthToDateRecords: optionalNumber(usage.month_to_date_records),
    }),
  };
}

async function requestDiscolikeDomainObject(
  path: string,
  input: Record<string, unknown>,
  context: DiscolikeContext,
): Promise<Record<string, unknown>> {
  const payload = await requestDiscolikeJson({
    path,
    query: {
      domain: requiredString(input.domain, "domain"),
    },
    context,
    phase: "execute",
  });
  return requireObject(payload, `${path} response`);
}

function buildDiscoverQuery(input: Record<string, unknown>): Record<string, DiscolikeQueryValue> {
  return {
    ...buildSharedFilterQuery(input),
    icp_prompt: optionalString(input.icpPrompt),
    domain: optionalStringArray(input.domains),
    max_records: optionalNumber(input.maxRecords),
    offset: optionalNumber(input.offset),
  };
}

function buildCountQuery(input: Record<string, unknown>): Record<string, DiscolikeQueryValue> {
  return buildSharedFilterQuery(input);
}

function buildSharedFilterQuery(input: Record<string, unknown>): Record<string, DiscolikeQueryValue> {
  return {
    country: optionalStringArray(input.countries),
    category: optionalStringArray(input.categories),
    business_model: optionalStringArray(input.businessModels),
    employee_range: optionalString(input.employeeRange),
    revenue_range: optionalString(input.revenueRange),
    min_digital_footprint: optionalNumber(input.minDigitalFootprint),
    max_digital_footprint: optionalNumber(input.maxDigitalFootprint),
    exclude_leadgen: optionalBoolean(input.excludeLeadgen),
  };
}

async function requestDiscolikeJson(input: {
  path: string;
  query: Record<string, DiscolikeQueryValue>;
  context: DiscolikeContext;
  phase: DiscolikePhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, discolikeDefaultRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(buildDiscolikeUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-API-Key": input.context.apiKey,
      },
      signal: timeout.signal,
    });
    const payload = await readDiscolikePayload(response);

    if (!response.ok) {
      throw createDiscolikeError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "DiscoLike request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `DiscoLike request failed: ${error.message}` : "DiscoLike request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildDiscolikeUrl(path: string, query: Record<string, DiscolikeQueryValue>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${discolikeApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function readDiscolikePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "DiscoLike returned invalid JSON");
  }
}

function createDiscolikeError(status: number, payload: unknown, phase: DiscolikePhase): ProviderRequestError {
  const message = extractDiscolikeErrorMessage(payload) ?? `DiscoLike request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }

  if (phase === "execute" && (status === 400 || status === 422)) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractDiscolikeErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const detail = record.detail;
  if (typeof detail === "string" && detail.trim() !== "") {
    return detail;
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        const issue = optionalRecord(item);
        return optionalString(issue?.msg);
      })
      .filter((message) => message);
    if (messages.length > 0) {
      return messages.join("; ");
    }
  }

  return optionalString(record.message) ?? optionalString(record.error);
}

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `DiscoLike returned invalid ${fieldName}`, value);
  }
  return record;
}

function requireNumber(value: unknown, fieldName: string): number {
  const parsed = optionalNumber(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `DiscoLike response missing numeric field: ${fieldName}`, value);
  }
  return parsed;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => optionalString(item)).filter((item) => item !== undefined);
}
