import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BenzingaActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const benzingaApiBaseUrl = "https://api.benzinga.com";
const benzingaDefaultRequestTimeoutMs = 30_000;

type BenzingaPhase = "validate" | "execute";
type BenzingaContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type BenzingaActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const benzingaActionHandlers: Record<BenzingaActionName, BenzingaActionHandler> = {
  async list_news_channels(_input, context) {
    const payload = await requestBenzingaJson({
      path: "/api/v2.1/news/channels",
      context,
      params: {},
      phase: "execute",
    });

    return {
      channels: normalizeArrayPayload(payload),
    };
  },
  async list_earnings(input, context) {
    const payload = await requestBenzingaJson({
      path: "/api/v2.1/calendar/earnings",
      context,
      params: buildCalendarParams(input),
      phase: "execute",
    });

    return {
      earnings: normalizeArrayPayload(payload),
    };
  },
  async list_analyst_ratings(input, context) {
    const payload = await requestBenzingaJson({
      path: "/api/v2.1/calendar/ratings",
      context,
      params: buildCalendarParams(input),
      phase: "execute",
    });

    return {
      ratings: normalizeArrayPayload(payload),
    };
  },
  async get_consensus_ratings(input, context) {
    const payload = await requestBenzingaJson({
      path: "/api/v1/consensus-ratings",
      context,
      params: {
        "parameters[tickers]": readRequiredString(input.symbol, "symbol"),
      },
      phase: "execute",
    });

    return {
      consensusRatings: normalizeArrayPayload(payload),
    };
  },
};

export async function validateBenzingaCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestBenzingaJson({
    path: "/api/v2.1/news/channels",
    context: {
      apiKey,
      fetcher,
      signal,
    },
    params: {},
    phase: "validate",
  });
  const channels = normalizeArrayPayload(payload);

  return {
    profile: {
      accountId: "benzinga-api-key",
      displayName: "Benzinga API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/api/v2.1/news/channels",
      channelCount: channels.length,
    },
  };
}

function buildCalendarParams(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    "parameters[tickers]": optionalString(input.symbol),
    "parameters[date_from]": optionalString(input.dateFrom),
    "parameters[date_to]": optionalString(input.dateTo),
    page: readOptionalNumberString(input.page),
    pagesize: readOptionalNumberString(input.limit),
  });
}

async function requestBenzingaJson(input: {
  path: string;
  context: BenzingaContext;
  params: Record<string, string | undefined>;
  phase: BenzingaPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, benzingaDefaultRequestTimeoutMs);

  try {
    const response = await input.context.fetcher(buildBenzingaUrl(input.path, input.context.apiKey, input.params), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readBenzingaPayload(response, {
      strictJson: response.ok,
    });

    if (!response.ok) {
      throw createBenzingaError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Benzinga request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Benzinga request failed: ${error.message}` : "Benzinga request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildBenzingaUrl(path: string, apiKey: string, params: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${benzingaApiBaseUrl}/`);
  url.searchParams.set("token", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readBenzingaPayload(response: Response, options: { strictJson: boolean }): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!options.strictJson) {
      return text;
    }
    throw new ProviderRequestError(502, "Benzinga returned invalid JSON");
  }
}

function createBenzingaError(status: number, payload: unknown, phase: BenzingaPhase): ProviderRequestError {
  const message = extractBenzingaErrorMessage(payload) ?? `Benzinga request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractBenzingaErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function normalizeArrayPayload(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeRecord(item));
  }

  const record = optionalRecord(payload);
  if (!record) {
    return [];
  }

  const candidateKeys = ["data", "result", "results", "channels", "earnings", "ratings"];
  for (const key of candidateKeys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.map((item) => normalizeRecord(item));
    }
  }

  return [record];
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? { value };
}

function readRequiredString(value: unknown, fieldName: string): string {
  const trimmed = optionalString(value);
  if (!trimmed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return trimmed;
}

function readOptionalNumberString(value: unknown): string | undefined {
  if (typeof value !== "number") {
    return undefined;
  }
  return String(value);
}
