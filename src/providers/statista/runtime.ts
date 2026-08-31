import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { looseArray, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const statistaApiBaseUrl = "https://api.statista.ai";

const statistaValidationPath = "/v1/search/statistics";

type StatistaMode = "validate" | "execute";
type StatistaQuery = Record<string, string | undefined>;
type StatistaActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface StatistaRequestOptions {
  path: string;
  mode: StatistaMode;
  query?: StatistaQuery;
}

export const statistaActionHandlers: ProviderActionHandlers<"statista", StatistaActionHandler> = {
  async search_statistics(input, context) {
    const payload = await requestStatistaJson(
      {
        path: "/v1/search/statistics",
        mode: "execute",
        query: statisticsSearchQuery(input),
      },
      context,
    );
    return normalizeStatisticsSearchResponse(payload);
  },

  async get_statistic(input, context) {
    const payload = await requestStatistaJson(
      {
        path: "/v1/data/statistic",
        mode: "execute",
        query: {
          id: String(readRequiredInteger(input.id, "id")),
        },
      },
      context,
    );
    return {
      statistic: normalizeStatisticData(payload),
    };
  },

  async search_market_insights_indicators(input, context) {
    const payload = await requestStatistaJson(
      {
        path: "/v1/search/market-insights/indicators",
        mode: "execute",
        query: requiredSearchQuery(input),
      },
      context,
    );
    return normalizeMarketInsightsSearchResponse(payload);
  },

  async search_consumer_insights(input, context) {
    const payload = await requestStatistaJson(
      {
        path: "/v1/search/consumer-insights",
        mode: "execute",
        query: requiredSearchQuery(input),
      },
      context,
    );
    return normalizeConsumerInsightsSearchResponse(payload);
  },
};

export async function validateStatistaCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestStatistaJson(
    {
      path: statistaValidationPath,
      mode: "validate",
      query: {
        size: "0",
      },
    },
    { apiKey, fetcher, signal },
  );

  return {
    profile: {
      accountId: "statista-api-key",
      displayName: "Statista API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: statistaApiBaseUrl,
      validationEndpoint: statistaValidationPath,
      validationSize: 0,
    },
  };
}

async function requestStatistaJson(
  options: StatistaRequestOptions,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  const url = new URL(options.path, statistaApiBaseUrl);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(context.signal);
  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: statistaHeaders(context.apiKey),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Statista request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Statista request failed: ${error.message}` : "Statista request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readStatistaPayload(response);
  if (!response.ok) {
    throw mapStatistaError(response.status, payload, options.mode);
  }

  return requireObjectPayload(payload);
}

function statistaHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
}

function statisticsSearchQuery(input: Record<string, unknown>): StatistaQuery {
  return {
    q: optionalString(input.q),
    offset: readOptionalIntegerString(input.offset),
    size: readOptionalIntegerString(input.size),
    date_from: optionalString(input.date_from),
    date_to: optionalString(input.date_to),
    premium: typeof input.premium === "boolean" ? String(input.premium) : undefined,
  };
}

function requiredSearchQuery(input: Record<string, unknown>): StatistaQuery {
  return {
    q: readRequiredString(input.q, "q"),
    size: readOptionalIntegerString(input.size),
  };
}

function normalizeStatisticsSearchResponse(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    items: looseArray(payload.items).map((item, index) => normalizeStatisticSearchItem(item, `items[${index}]`)),
    totalCount: readRequiredInteger(payload.total_count, "total_count"),
    took: optionalRecord(payload.took) ?? null,
    raw: payload,
  };
}

function normalizeStatisticSearchItem(value: unknown, fieldName: string): Record<string, unknown> {
  const record = readObject(value, fieldName);
  return {
    identifier: readRequiredInteger(record.identifier, `${fieldName}.identifier`),
    title: readRequiredString(record.title, `${fieldName}.title`),
    subject: readRequiredString(record.subject, `${fieldName}.subject`),
    isPremium: readRequiredBoolean(record.is_premium, `${fieldName}.is_premium`),
    description: readNullableString(record.description),
    link: readRequiredString(record.link, `${fieldName}.link`),
    date: readNullableString(record.date),
    platform: readRequiredString(record.platform, `${fieldName}.platform`),
    teaserImageUrls: looseArray(record.teaser_image_urls).map((image, index) =>
      normalizeTeaserImage(image, `${fieldName}.teaser_image_urls[${index}]`),
    ),
    rankingScore: readNullableNumber(record.ranking_score),
    raw: record,
  };
}

function normalizeStatisticData(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    identifier: readRequiredInteger(payload.identifier, "identifier"),
    title: readRequiredString(payload.title, "title"),
    subject: readRequiredString(payload.subject, "subject"),
    isPremium: readRequiredBoolean(payload.is_premium, "is_premium"),
    description: readNullableString(payload.description),
    link: readRequiredString(payload.link, "link"),
    date: readNullableString(payload.date),
    platform: readRequiredString(payload.platform, "platform"),
    teaserImageUrls: looseArray(payload.teaser_image_urls).map((image, index) =>
      normalizeTeaserImage(image, `teaser_image_urls[${index}]`),
    ),
    chart: optionalRecord(payload.chart) ?? {},
    raw: payload,
  };
}

function normalizeMarketInsightsSearchResponse(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    items: looseArray(payload.items).map((item, index) => normalizeMarketInsightItem(item, `items[${index}]`)),
    totalCount: readRequiredInteger(payload.total_count, "total_count"),
    raw: payload,
  };
}

function normalizeMarketInsightItem(value: unknown, fieldName: string): Record<string, unknown> {
  const record = readObject(value, fieldName);
  return {
    identifier: readRequiredString(record.identifier, `${fieldName}.identifier`),
    title: readRequiredString(record.title, `${fieldName}.title`),
    subject: readRequiredString(record.subject, `${fieldName}.subject`),
    description: readNullableString(record.description),
    link: readRequiredString(record.link, `${fieldName}.link`),
    updatedAt: readNullableString(record.updated_at),
    industries: readObjectArray(record.industries),
    coveredTimeframe: optionalRecord(record.covered_timeframe) ?? null,
    coveredGeos: optionalRecord(record.covered_geos) ?? null,
    marketType: readNullableString(record.market_type),
    marketTypeDescription: readNullableString(record.market_type_description),
    raw: record,
  };
}

function normalizeConsumerInsightsSearchResponse(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    results: looseArray(payload.results).map((item, index) =>
      normalizeConsumerInsightResult(item, `results[${index}]`),
    ),
    raw: payload,
  };
}

function normalizeConsumerInsightResult(value: unknown, fieldName: string): Record<string, unknown> {
  const record = readObject(value, fieldName);
  return {
    questionId: readRequiredString(record.question_id, `${fieldName}.question_id`),
    indicator: readRequiredString(record.indicator, `${fieldName}.indicator`),
    label: readRequiredString(record.label, `${fieldName}.label`),
    questionType: readRequiredString(record.question_type, `${fieldName}.question_type`),
    metadata: optionalRecord(record.metadata) ?? {},
    answersSubset: looseArray(record.answers_subset).map((answer, index) =>
      normalizeConsumerInsightAnswer(answer, `${fieldName}.answers_subset[${index}]`),
    ),
    totalAnswers: readRequiredInteger(record.total_answers, `${fieldName}.total_answers`),
    raw: record,
  };
}

function normalizeConsumerInsightAnswer(value: unknown, fieldName: string): Record<string, unknown> {
  const record = readObject(value, fieldName);
  return {
    answerId: readRequiredString(record.answer_id, `${fieldName}.answer_id`),
    label: readRequiredString(record.label, `${fieldName}.label`),
    order: readRequiredInteger(record.order, `${fieldName}.order`),
    code: readRequiredInteger(record.code, `${fieldName}.code`),
    raw: record,
  };
}

function normalizeTeaserImage(value: unknown, fieldName: string): Record<string, unknown> {
  const record = readObject(value, fieldName);
  return {
    width: readRequiredInteger(record.width, `${fieldName}.width`),
    src: readRequiredString(record.src, `${fieldName}.src`),
  };
}

async function readStatistaPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapStatistaError(status: number, payload: unknown, mode: StatistaMode): ProviderRequestError {
  const message = readStatistaErrorMessage(payload) ?? `Statista request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : status, message, payload);
  }
  if (status === 404) {
    return new ProviderRequestError(404, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function readStatistaErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const direct = optionalString(record.message) ?? optionalString(record.error);
  if (direct) {
    return direct;
  }

  const errors = Array.isArray(record.errors) ? record.errors : [];
  for (const error of errors) {
    const errorRecord = optionalRecord(error);
    const message =
      optionalString(errorRecord?.message) ?? optionalString(errorRecord?.detail) ?? optionalString(errorRecord?.title);
    if (message) {
      return message;
    }
  }

  return undefined;
}

function requireObjectPayload(payload: unknown): Record<string, unknown> {
  return readObject(payload, "response");
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Statista returned invalid ${fieldName}`, value);
  }
  return record;
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  return looseArray(value).flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [record] : [];
  });
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `Statista returned invalid ${fieldName}`, value);
  }
  return text;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(502, `Statista returned invalid ${fieldName}`, value);
  }
  return parsed;
}

function readOptionalIntegerString(value: unknown): string | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  return String(readRequiredInteger(value, "query integer"));
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `Statista returned invalid ${fieldName}`, value);
  }
  return value;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}
