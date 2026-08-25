import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "news_api";
const newsApiBaseUrl = "https://newsapi.org";

type NewsApiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const newsApiActionHandlers: ProviderActionHandlers<"news_api", NewsApiActionHandler> = {
  get_everything(input, context) {
    return executeNewsApiGet("/v2/everything", input, context, {
      q: optionalString(input.q),
      from: optionalString(input.from),
      to: optionalString(input.to),
      sortBy: optionalString(input.sortBy),
      sources: optionalString(input.sources),
      domains: optionalString(input.domains),
      excludeDomains: optionalString(input.excludeDomains),
      language: optionalString(input.language),
      qInTitle: optionalString(input.qInTitle),
      pageSize: optionalInteger(input.pageSize),
      page: optionalInteger(input.page),
    });
  },
  get_top_headlines(input, context) {
    if (optionalString(input.sources) && (optionalString(input.country) || optionalString(input.category))) {
      throw new ProviderRequestError(400, "sources cannot be combined with country or category");
    }
    return executeNewsApiGet("/v2/top-headlines", input, context, {
      q: optionalString(input.q),
      country: optionalString(input.country),
      category: optionalString(input.category),
      sources: optionalString(input.sources),
      pageSize: optionalInteger(input.pageSize),
      page: optionalInteger(input.page),
    });
  },
  get_sources(input, context) {
    return executeNewsApiGet("/v2/top-headlines/sources", input, context, {
      category: optionalString(input.category),
      language: optionalString(input.language),
      country: optionalString(input.country),
    });
  },
  get_v1_articles(input, context) {
    const sortBy = optionalString(input.sortBy);
    if (sortBy && sortBy !== "top") {
      throw new ProviderRequestError(
        400,
        "legacy sortBy latest/popular is not supported; use get_top_headlines or get_everything instead",
      );
    }
    return executeNewsApiGet("/v2/top-headlines", input, context, {
      sources: optionalString(input.source),
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, newsApiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = optionalRecord(
      await executeNewsApiGet(
        "/v2/top-headlines/sources",
        {},
        {
          apiKey: input.apiKey,
          fetcher,
          signal,
        },
        {},
        "validate",
      ),
    );

    return {
      profile: {
        accountId: "news_api",
        displayName: "News API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/v2/top-headlines/sources",
        apiBaseUrl: newsApiBaseUrl,
        sourceCount: Array.isArray(payload?.sources) ? payload.sources.length : 0,
      },
    };
  },
};

async function executeNewsApiGet(
  path: string,
  _input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  query: Record<string, string | number | undefined>,
  phase: "validate" | "execute" = "execute",
): Promise<unknown> {
  const response = await context.fetcher(buildNewsApiUrl(path, compactQuery(query)), {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": providerUserAgent,
      "x-api-key": context.apiKey,
    },
    signal: context.signal,
  });
  const payload = await readNewsApiPayload(response);
  if (!response.ok) {
    throw createNewsApiError(response.status, payload, phase);
  }
  return payload;
}

function buildNewsApiUrl(path: string, query: Record<string, string | number>): URL {
  const url = new URL(path, newsApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

function compactQuery(input: Record<string, string | number | undefined>): Record<string, string | number> {
  return compactObject(input) as Record<string, string | number>;
}

async function readNewsApiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "News API returned invalid JSON");
  }
}

function createNewsApiError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ?? optionalString(record?.code) ?? `News API request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}
