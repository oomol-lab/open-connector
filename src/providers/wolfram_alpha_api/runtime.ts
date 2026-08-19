import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const wolframAlphaApiBaseUrl = "https://api.wolframalpha.com";
export const wolframAlphaQueryRecognizerUrl = "https://www.wolframalpha.com/queryrecognizer/query.jsp";

const wolframAlphaDefaultRequestTimeoutMs = 30_000;
const wolframAlphaValidationQuery = "integrate x^2";

type WolframAlphaPhase = "validate" | "execute";
type WolframAlphaMode = "default" | "voice";
type WolframAlphaRecognizerResult = {
  accepted: boolean;
  domain: string | null;
  timingMs: number | null;
  resultSignificanceScore: number | null;
  spellingCorrection: string | null;
  summaryBoxPath: string | null;
};

export const wolframAlphaApiActionHandlers: ProviderActionHandlers<
  "wolfram_alpha_api",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async validate_query(input, context): Promise<unknown> {
    const query = requiredProviderString(input.query, "query");
    const mode = readMode(input.mode);
    const result = await executeRecognizerQuery(
      context.apiKey,
      query,
      mode,
      context.fetcher,
      context.signal,
      "execute",
    );
    return {
      query,
      mode,
      accepted: result.accepted,
      domain: result.domain,
      timingMs: result.timingMs,
      resultSignificanceScore: result.resultSignificanceScore,
      spellingCorrection: result.spellingCorrection,
      summaryBoxPath: result.summaryBoxPath,
    };
  },
  async get_short_answer(input, context): Promise<unknown> {
    const query = requiredProviderString(input.query, "query");
    const answer = await executeTextQuery(
      "/v1/result",
      context.apiKey,
      {
        i: query,
        units: readOptionalString(input.units),
        timeout: readOptionalTimeout(input.timeout),
      },
      context.fetcher,
      context.signal,
      "execute",
    );
    return { query, answer };
  },
  async get_spoken_result(input, context): Promise<unknown> {
    const query = requiredProviderString(input.query, "query");
    const result = await executeTextQuery(
      "/v1/spoken",
      context.apiKey,
      {
        i: query,
        units: readOptionalString(input.units),
        timeout: readOptionalTimeout(input.timeout),
      },
      context.fetcher,
      context.signal,
      "execute",
    );
    return { query, result };
  },
};

export async function validateWolframAlphaApiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const result = await executeRecognizerQuery(
    apiKey,
    wolframAlphaValidationQuery,
    "default",
    fetcher,
    signal,
    "validate",
  );
  return {
    profile: {
      accountId: "wolfram_alpha_appid",
      displayName: "Wolfram|Alpha AppID",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: wolframAlphaApiBaseUrl,
      validationEndpoint: wolframAlphaQueryRecognizerUrl,
      validationQuery: wolframAlphaValidationQuery,
      accepted: result.accepted,
      domain: result.domain ?? undefined,
      summaryBoxPath: result.summaryBoxPath ?? undefined,
    }),
  };
}

async function executeRecognizerQuery(
  apiKey: string,
  query: string,
  mode: WolframAlphaMode,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  phase: WolframAlphaPhase,
): Promise<WolframAlphaRecognizerResult> {
  const url = new URL(wolframAlphaQueryRecognizerUrl);
  url.searchParams.set("appid", apiKey);
  url.searchParams.set("input", query);
  url.searchParams.set("mode", mode);
  url.searchParams.set("output", "json");

  const payload = await executeJsonRequest(url, fetcher, signal, phase);
  const record = optionalRecord(payload);
  const firstQuery = Array.isArray(record?.query) ? optionalRecord(record.query[0]) : undefined;
  if (!firstQuery) {
    throw new ProviderRequestError(502, "Wolfram|Alpha recognizer returned no query result");
  }

  const summaryBox = optionalRecord(firstQuery.summarybox);
  return {
    accepted: readBooleanLike(firstQuery.accepted),
    domain: readNullableString(firstQuery.domain),
    timingMs: readNullableNumber(record?.timing),
    resultSignificanceScore: readNullableNumber(firstQuery.resultsignificancescore),
    spellingCorrection: readNullableString(firstQuery.spellingCorrection),
    summaryBoxPath: readNullableString(summaryBox?.path),
  };
}

async function executeTextQuery(
  path: string,
  apiKey: string,
  params: Record<string, string | undefined>,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  phase: WolframAlphaPhase,
): Promise<string> {
  const url = new URL(path, wolframAlphaApiBaseUrl);
  url.searchParams.set("appid", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const text = await executeRequest(url, fetcher, signal, phase);
  if (!text) {
    throw new ProviderRequestError(502, "Wolfram|Alpha returned an empty response");
  }
  return text;
}

async function executeJsonRequest(
  url: URL,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  phase: WolframAlphaPhase,
): Promise<unknown> {
  const responseText = await executeRequest(url, fetcher, signal, phase);
  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Wolfram|Alpha returned invalid JSON");
  }
}

async function executeRequest(
  url: URL,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  phase: WolframAlphaPhase,
): Promise<string> {
  const timeout = createProviderTimeout(signal, wolframAlphaDefaultRequestTimeoutMs);
  try {
    const response = await fetcher(url, {
      method: "GET",
      headers: { "user-agent": providerUserAgent },
      signal: timeout.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw createWolframAlphaError(response.status, text, phase);
    }
    if (looksLikeCredentialError(text)) {
      throw createWolframAlphaCredentialError(text, phase);
    }
    return text;
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Wolfram|Alpha request timed out after 30 seconds");
    }
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Wolfram|Alpha request failed: ${error.message}` : "Wolfram|Alpha request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function createWolframAlphaError(status: number, body: string, phase: WolframAlphaPhase): ProviderRequestError {
  const message = body.trim() || `Wolfram|Alpha request failed with ${status || 500}`;
  if (phase === "validate") {
    if (status === 400 || status === 401 || status === 403 || looksLikeCredentialError(message)) {
      return new ProviderRequestError(400, message);
    }
    if (status === 429) return new ProviderRequestError(429, message);
    return new ProviderRequestError(status || 500, message);
  }
  if (status === 400 || status === 501) return new ProviderRequestError(400, message);
  if (status === 401 || status === 403 || looksLikeCredentialError(message))
    return new ProviderRequestError(401, message);
  if (status === 429) return new ProviderRequestError(429, message);
  return new ProviderRequestError(status || 500, message);
}

function createWolframAlphaCredentialError(message: string, phase: WolframAlphaPhase): ProviderRequestError {
  return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
}

function requiredProviderString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalString(value: unknown): string | undefined {
  return optionalString(value);
}

function readOptionalTimeout(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ProviderRequestError(400, "timeout must be a positive integer");
  }
  return String(value);
}

function readMode(value: unknown): WolframAlphaMode {
  return value === "voice" ? "voice" : "default";
}

function readBooleanLike(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function readNullableNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readNullableString(value: unknown): string | null {
  return optionalString(value) ?? null;
}

function looksLikeCredentialError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("invalid appid") || normalized.includes("appid missing");
}
