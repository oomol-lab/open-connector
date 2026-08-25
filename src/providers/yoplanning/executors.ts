import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "yoplanning";
const yoplanningApiBaseUrl = "https://yoplanning.pro/api/v3.1";
const yoplanningRequestTimeoutMs = 30_000;

type RequestPhase = "validate" | "execute";
type YoplanningHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface YoplanningRequestInput {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  query?: Record<string, string | number | undefined>;
  phase: RequestPhase;
}

interface PaginatedPayload {
  count: number;
  next: string | null;
  previous: string | null;
  results: unknown[];
}

export const yoplanningActionHandlers: Record<string, YoplanningHandler> = {
  async list_teams(input, context) {
    return parsePaginatedPayload(
      await requestYoplanningJson({ context, path: "/teams/", query: paginationQuery(input), phase: "execute" }),
    );
  },
  async get_team(input, context) {
    const teamId = readId(input.teamId, "teamId");
    return {
      team: requireResourcePayload(
        await requestYoplanningJson({
          context,
          path: `/teams/${encodeURIComponent(teamId)}/`,
          phase: "execute",
        }),
        "get_team",
      ),
    };
  },
  async list_online_products(input, context) {
    const teamId = readId(input.teamId, "teamId");
    return parsePaginatedPayload(
      await requestYoplanningJson({
        context,
        path: `/teams/${encodeURIComponent(teamId)}/online-products/`,
        query: {
          ...paginationQuery(input),
          lang: optionalString(input.language),
          start_date: optionalString(input.startDate),
          end_date: optionalString(input.endDate),
          sub_category_id: optionalInteger(input.subCategoryId),
        },
        phase: "execute",
      }),
    );
  },
  async get_online_product(input, context) {
    const teamId = readId(input.teamId, "teamId");
    const productId = readId(input.productId, "productId");
    return {
      product: requireResourcePayload(
        await requestYoplanningJson({
          context,
          path: `/teams/${encodeURIComponent(teamId)}/online-products/${encodeURIComponent(productId)}/`,
          phase: "execute",
        }),
        "get_online_product",
      ),
    };
  },
  async list_product_availabilities(input, context) {
    const teamId = readId(input.teamId, "teamId");
    const productId = readId(input.productId, "productId");
    return parsePaginatedPayload(
      await requestYoplanningJson({
        context,
        path: `/teams/${encodeURIComponent(teamId)}/online-products/${encodeURIComponent(productId)}/availabilities/`,
        query: {
          ...paginationQuery(input),
          start_date__gt: optionalString(input.startDateAfter),
          start_date__lt: optionalString(input.startDateBefore),
          status: optionalString(input.status),
        },
        phase: "execute",
      }),
    );
  },
  async get_availability_details(input, context) {
    const teamId = readId(input.teamId, "teamId");
    const availabilityId = readId(input.availabilityId, "availabilityId");
    return {
      availability: requireResourcePayload(
        await requestYoplanningJson({
          context,
          path: `/teams/${encodeURIComponent(teamId)}/availability-details/${encodeURIComponent(availabilityId)}/`,
          query: { lang: optionalString(input.language) },
          phase: "execute",
        }),
        "get_availability_details",
      ),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, yoplanningActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: yoplanningApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Token " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = parsePaginatedPayload(
      await requestYoplanningJson({
        context: { apiKey: input.apiKey, fetcher, signal },
        path: "/teams/",
        query: { limit: 1 },
        phase: "validate",
      }),
    );
    const firstTeam = optionalRecord(payload.results[0]);
    const firstTeamId = optionalString(firstTeam?.id);
    const firstTeamName = optionalString(firstTeam?.name);
    return {
      profile: {
        accountId: firstTeamId ? `yoplanning:team:${firstTeamId}` : "yoplanning-api-token",
        displayName: firstTeamName ?? "YoPlanning API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: yoplanningApiBaseUrl,
        accessibleTeamCount: payload.count,
        firstTeamId,
      }),
    };
  },
};

function paginationQuery(input: Record<string, unknown>): Record<string, number | undefined> {
  return { limit: optionalInteger(input.limit), offset: optionalInteger(input.offset) };
}

async function requestYoplanningJson(input: YoplanningRequestInput): Promise<unknown> {
  const url = new URL(`${yoplanningApiBaseUrl}${input.path}`);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }

  const timeout = createProviderTimeout(input.context.signal, yoplanningRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Token ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readJsonPayload(response);
    if (!response.ok) throw createYoplanningError(response, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      timeout.didTimeout() ? 504 : 502,
      error instanceof Error ? `YoPlanning request failed: ${error.message}` : "YoPlanning request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "YoPlanning returned invalid JSON");
  }
}

function createYoplanningError(response: Response, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const detail = optionalString(optionalRecord(payload)?.detail);
  const message = detail ?? `YoPlanning request failed with status ${response.status}`;
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (response.status === 401) return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function parsePaginatedPayload(payload: unknown): PaginatedPayload {
  const record = optionalRecord(payload);
  const count = optionalInteger(record?.count);
  const results = Array.isArray(record?.results) ? record.results : undefined;
  if (count === undefined || !results) {
    throw new ProviderRequestError(502, "YoPlanning returned an invalid paginated response");
  }
  const next = record?.next === null ? null : optionalString(record?.next);
  const previous = record?.previous === null ? null : optionalString(record?.previous);
  if (next === undefined || previous === undefined) {
    throw new ProviderRequestError(502, "YoPlanning pagination links were invalid");
  }
  return { count, next, previous, results };
}

function requireResourcePayload(payload: unknown, actionName: string): Record<string, unknown> {
  const resource = optionalRecord(payload);
  if (!resource) throw new ProviderRequestError(502, `YoPlanning returned an invalid ${actionName} response`);
  return resource;
}

function readId(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
