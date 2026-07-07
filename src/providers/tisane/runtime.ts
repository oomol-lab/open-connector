import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { TisaneActionName } from "./actions.ts";

import {
  compactObject,
  nullableInteger,
  optionalBooleanOrNull,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const tisaneApiBaseUrl: string = "https://api.tisane.ai";
export const tisaneApiKeyHeader: string = "Ocp-Apim-Subscription-Key";

type TisaneRequestPhase = "validate" | "execute";
type TisaneResponseMode = "json" | "text" | "number";

export const tisaneActionHandlers: Record<TisaneActionName, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  analyze_text(input, context) {
    return executeAnalyzeText(input, context);
  },
  detect_language(input, context) {
    return executeDetectLanguage(input, context);
  },
  list_supported_languages(_input, context) {
    return executeListSupportedLanguages(context);
  },
  extract_text(input, context) {
    return executeExtractText(input, context);
  },
  calculate_similarity(input, context) {
    return executeCalculateSimilarity(input, context);
  },
  transform_text(input, context) {
    return executeTransformText(input, context);
  },
  compare_entities(input, context) {
    return executeCompareEntities(input, context);
  },
};

export async function validateTisaneCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const languages = await requestTisane({
    path: "/languages",
    method: "GET",
    apiKey,
    fetcher,
    signal,
    phase: "validate",
    responseMode: "json",
  });
  if (!Array.isArray(languages)) {
    throw new ProviderRequestError(502, "Tisane languages response must be an array");
  }

  return {
    profile: {
      accountId: "tisane:api_subscription_key",
      displayName: "Tisane API Subscription Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: tisaneApiBaseUrl,
      validationEndpoint: "/languages",
      languageCount: languages.length,
      firstLanguage: getFirstLanguage(languages),
    }),
  };
}

async function executeAnalyzeText(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestTisane({
    path: "/parse",
    method: "POST",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    responseMode: "json",
    body: compactObject({
      language: input.language,
      content: input.content,
      settings: input.settings,
    }),
  });
  const record = requiredRecord(payload, "Tisane analysis response", providerError);

  return {
    text: requiredString(record.text, "Tisane analysis text", providerError),
    language: optionalString(record.language) ?? null,
    topics: Array.isArray(record.topics) ? record.topics : [],
    abuse: objectArray(record.abuse),
    sentenceList: objectArray(record.sentence_list),
    entitiesSummary: objectArray(record.entities_summary),
    sentimentExpressions: objectArray(record.sentiment_expressions),
    memory: optionalRecord(record.memory) ?? null,
    raw: record,
  };
}

async function executeDetectLanguage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestTisane({
    path: "/detectLanguage",
    method: "POST",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    responseMode: "json",
    body: compactObject({
      content: input.content,
      languages: input.languages,
      delimiter: input.delimiter,
    }),
  });
  const record = requiredRecord(payload, "Tisane language detection response", providerError);
  if (!Array.isArray(record.languages)) {
    throw new ProviderRequestError(502, "Tisane language detection response must include a languages array");
  }

  return {
    languages: record.languages.map((item) => {
      const language = requiredRecord(item, "Tisane language segment", providerError);
      return {
        offset: nullableInteger(language.offset) ?? null,
        length: nullableInteger(language.length) ?? null,
        language: requiredString(language.language, "Tisane detected language", providerError),
        score: optionalNumber(language.score) ?? null,
        raw: language,
      };
    }),
    raw: record,
  };
}

async function executeListSupportedLanguages(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestTisane({
    path: "/languages",
    method: "GET",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    responseMode: "json",
  });
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Tisane languages response must be an array");
  }

  return {
    languages: payload.map((item) => {
      const language = requiredRecord(item, "Tisane language", providerError);
      return {
        isoCode: requiredString(language.isoCode, "Tisane language isoCode", providerError),
        name: requiredString(language.name, "Tisane language name", providerError),
        englishName: requiredString(language.englishName, "Tisane language englishName", providerError),
        nativeEncoding: optionalString(language.nativeEncoding) ?? null,
        fontFace: optionalString(language.fontFace) ?? null,
        latin: optionalBooleanOrNull(language.latin),
        rightToLeft: optionalBooleanOrNull(language.rightToLeft),
        raw: language,
      };
    }),
  };
}

async function executeExtractText(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const text = await requestTisane({
    path: "/helper/extract_text",
    method: "POST",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    responseMode: "text",
    body: input.content,
    contentType: "text/plain",
  });
  return { text: requiredString(text, "Tisane extracted text", providerError) };
}

async function executeCalculateSimilarity(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const similarity = await requestTisane({
    path: "/similarity",
    method: "POST",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    responseMode: "number",
    body: compactObject({
      language1: input.language1,
      content1: input.content1,
      language2: input.language2,
      content2: input.content2,
      settings: input.settings,
    }),
  });
  return { similarity };
}

async function executeTransformText(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const text = await requestTisane({
    path: "/transform",
    method: "POST",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    responseMode: "text",
    body: compactObject({
      from: input.from,
      to: input.to,
      content: input.content,
      settings: input.settings,
    }),
  });
  return { text: requiredString(text, "Tisane transformed text", providerError) };
}

async function executeCompareEntities(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await requestTisane({
    path: "/compare/entities",
    method: "POST",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    responseMode: "json",
    body: input,
  });
  const record = requiredRecord(payload, "Tisane entity comparison response", providerError);
  return compactObject({
    result: requiredString(record.result, "Tisane entity comparison result", providerError),
    differences: Array.isArray(record.differences)
      ? record.differences.map((difference) => String(difference))
      : undefined,
    raw: record,
  });
}

async function requestTisane(input: {
  path: string;
  method: "GET" | "POST";
  apiKey: string;
  fetcher: typeof fetch;
  phase: TisaneRequestPhase;
  responseMode: TisaneResponseMode;
  signal?: AbortSignal;
  body?: unknown;
  contentType?: string;
}): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: input.responseMode === "text" ? "text/plain" : "application/json",
    [tisaneApiKeyHeader]: input.apiKey,
    "user-agent": providerUserAgent,
  };
  let body: BodyInit | undefined;
  if (input.method === "POST") {
    const contentType = input.contentType ?? "application/json";
    headers["content-type"] = contentType;
    body = contentType === "text/plain" ? String(input.body ?? "") : JSON.stringify(input.body);
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(new URL(input.path, tisaneApiBaseUrl), {
      method: input.method,
      headers,
      body,
      signal: input.signal,
    });
    payload = await readTisanePayload(response, input.responseMode);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Tisane request failed: ${error.message}` : "Tisane request failed",
    );
  }

  if (!response.ok) {
    throw createTisaneError(response, payload, input.phase);
  }
  if (input.responseMode === "number" && typeof payload !== "number") {
    throw new ProviderRequestError(502, "Tisane response must be a number");
  }

  return payload;
}

async function readTisanePayload(response: Response, responseMode: TisaneResponseMode): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (responseMode === "text") return text;
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return responseMode === "number" ? (typeof parsed === "number" ? parsed : Number(parsed)) : parsed;
  } catch {
    return responseMode === "number" ? Number(text) : text;
  }
}

function createTisaneError(response: Response, payload: unknown, phase: TisaneRequestPhase): ProviderRequestError {
  const message = extractTisaneErrorMessage(payload) ?? response.statusText ?? "Tisane request failed";
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 400) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function extractTisaneErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const record = optionalRecord(payload);
  if (!record) return undefined;
  return (
    optionalString(record.error) ??
    optionalString(record.message) ??
    optionalString(record.detail) ??
    optionalString(record.title)
  );
}

function objectArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map((item) => optionalRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function getFirstLanguage(languages: unknown[]): string | undefined {
  for (const item of languages) {
    const code = optionalString(optionalRecord(item)?.isoCode);
    if (code) return code;
  }
  return undefined;
}

function providerError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
