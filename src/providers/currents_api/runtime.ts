import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

type CurrentsApiPhase = "validate" | "execute";
type CurrentsApiQueryValue = string | number | undefined;
type CurrentsApiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const currentsApiBaseUrl = "https://api.currentsapi.services";

export const currentsApiActionHandlers: ProviderActionHandlers<"currents_api", CurrentsApiActionHandler> = {
  get_latest_news(input, context) {
    return currentsApiRequest(
      {
        path: "/v2/latest-news",
        query: compactObject({
          language: optionalString(input.language),
          country: optionalString(input.country),
          category: optionalString(input.category),
          type: optionalString(input.type),
          domain: optionalString(input.domain),
          domain_not: optionalString(input.domain_not),
          page_number: optionalInteger(input.page_number),
          page_size: optionalInteger(input.page_size),
        }),
      },
      context,
      "execute",
    );
  },
  search_news(input, context) {
    if (input.cursor !== undefined && input.page_number !== undefined) {
      throw new ProviderRequestError(400, "cursor cannot be combined with page_number");
    }
    return currentsApiRequest(
      {
        path: "/v2/search",
        query: compactObject({
          keywords: optionalString(input.keywords),
          language: optionalString(input.language),
          country: optionalString(input.country),
          category: optionalString(input.category),
          start_date: optionalString(input.start_date),
          end_date: optionalString(input.end_date),
          type: optionalString(input.type),
          domain: optionalString(input.domain),
          domain_not: optionalString(input.domain_not),
          author: optionalString(input.author),
          page_number: optionalInteger(input.page_number),
          page_size: optionalInteger(input.page_size),
          cursor: optionalString(input.cursor),
        }),
      },
      context,
      "execute",
    );
  },
  list_available_languages(_input, context) {
    return currentsApiRequest({ path: "/v2/available/languages" }, context, "execute");
  },
  list_available_regions(_input, context) {
    return currentsApiRequest({ path: "/v2/available/regions" }, context, "execute");
  },
  list_available_categories(_input, context) {
    return currentsApiRequest({ path: "/v2/available/categories" }, context, "execute");
  },
};

export async function validateCurrentsApiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const { response } = await currentsApiRawRequest(
    { path: "/v1/auth" },
    {
      apiKey,
      fetcher,
      signal,
    },
    "validate",
  );

  return {
    profile: {
      accountId: "api_key",
      displayName: "Currents API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/v1/auth",
      apiBaseUrl: currentsApiBaseUrl,
      rateLimit: readHeaderInteger(response.headers, "x-ratelimit-limit"),
      rateRemaining: readHeaderInteger(response.headers, "x-ratelimit-remaining"),
    }),
  };
}

interface CurrentsApiRequestInput {
  path: string;
  query?: Record<string, CurrentsApiQueryValue>;
}

async function currentsApiRequest(
  input: CurrentsApiRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: CurrentsApiPhase,
): Promise<unknown> {
  const { payload } = await currentsApiRawRequest(input, context, phase);
  return payload;
}

async function currentsApiRawRequest(
  input: CurrentsApiRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: CurrentsApiPhase,
): Promise<{ response: Response; payload: unknown }> {
  const url = new URL(input.path, currentsApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Currents API request failed: ${error.message}` : "Currents API request failed",
    );
  }

  if (!response.ok) {
    throw createCurrentsApiError(response.status, payload, phase);
  }

  return {
    response,
    payload: payload == null ? null : normalizePayloadObject(payload),
  };
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Currents API returned invalid JSON");
  }
}

function createCurrentsApiError(status: number, payload: unknown, phase: CurrentsApiPhase): ProviderRequestError {
  const message = extractCurrentsApiMessage(payload) ?? `Currents API request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status === 401) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractCurrentsApiMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const errors = Array.isArray(record.errors) ? record.errors : [];
  const firstError = errors.find((value) => typeof value === "string");
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    (typeof firstError === "string" ? firstError : undefined) ??
    optionalString(record.description)
  );
}

function normalizePayloadObject(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  return payload as Record<string, unknown>;
}

function readHeaderInteger(headers: Headers, name: string): number | undefined {
  const raw = headers.get(name);
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : undefined;
}
