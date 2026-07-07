import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { RosetteTextAnalyticsActionName } from "./actions.ts";

import {
  compactObject,
  nullableInteger,
  optionalNumber,
  optionalRecord,
  optionalRawString,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "rosette_text_analytics";
const rosetteTextAnalyticsApiBaseUrl = "https://analytics.babelstreet.com/rest/v1";
const rosetteTextAnalyticsApiKeyHeader = "X-BabelStreetAPI-Key";

type RosetteTextAnalyticsRequestPhase = "validate" | "execute";
type RosetteTextAnalyticsActionHandler = (
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) => Promise<unknown>;

export const rosetteTextAnalyticsActionHandlers: Record<
  RosetteTextAnalyticsActionName,
  RosetteTextAnalyticsActionHandler
> = {
  identify_language(input, context) {
    return executeDocumentEndpoint("language", input, context, normalizeLanguageResult);
  },
  extract_entities(input, context) {
    return executeDocumentEndpoint("entities", input, context, normalizeEntitiesResult);
  },
  analyze_sentiment(input, context) {
    return executeDocumentEndpoint("sentiment", input, context, normalizeSentimentResult);
  },
  identify_categories(input, context) {
    return executeDocumentEndpoint("categories", input, context, normalizeCategoriesResult);
  },
  identify_tokens(input, context) {
    return executeDocumentEndpoint("tokens", input, context, normalizeTokensResult);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, rosetteTextAnalyticsActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: rosetteTextAnalyticsApiBaseUrl,
  auth: { type: "api_key_header", name: rosetteTextAnalyticsApiKeyHeader },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestRosette({
      path: "/ping",
      method: "GET",
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });
    const record = optionalRecord(payload) ?? {};

    return {
      profile: {
        accountId: "api_key",
        displayName: "Rosette Text Analytics API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: rosetteTextAnalyticsApiBaseUrl,
        validationEndpoint: "/ping",
        validationMessage: optionalString(record.message),
      }),
    };
  },
};

async function executeDocumentEndpoint(
  endpoint: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  normalize: (payload: unknown) => unknown,
): Promise<unknown> {
  const payload = await requestRosette({
    path: `/${endpoint}`,
    method: "POST",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    body: compactObject({
      content: input.content,
      contentUri: input.contentUri,
      language: input.language,
      options: input.options,
    }),
  });

  return normalize(payload);
}

interface RosetteRequestInput {
  path: string;
  method: "GET" | "POST";
  apiKey: string;
  fetcher: typeof fetch;
  phase: RosetteTextAnalyticsRequestPhase;
  signal?: AbortSignal;
  body?: unknown;
}

async function requestRosette(input: RosetteRequestInput): Promise<unknown> {
  const url = new URL(`${rosetteTextAnalyticsApiBaseUrl}${input.path}`);
  const headers: Record<string, string> = {
    accept: "application/json",
    [rosetteTextAnalyticsApiKeyHeader]: input.apiKey,
    "user-agent": providerUserAgent,
  };

  let body: BodyInit | undefined;
  if (input.method === "POST") {
    headers["content-type"] = "application/json";
    body = JSON.stringify(input.body);
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers,
      body,
      signal: input.signal,
    });
    payload = await readRosettePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Rosette Text Analytics request failed: ${error.message}`
        : "Rosette Text Analytics request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createRosetteError(response, payload, input.phase);
  }

  return payload;
}

async function readRosettePayload(response: Response): Promise<unknown> {
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

function normalizeLanguageResult(payload: unknown): Record<string, unknown> {
  const record = requireProviderObject(payload, "Rosette language response");
  if (!Array.isArray(record.languageDetections)) {
    throw new ProviderRequestError(502, "Rosette language response must include a languageDetections array");
  }

  return {
    languageDetections: record.languageDetections.map((item) => {
      const detection = requireProviderObject(item, "Rosette language detection");
      return {
        language: requiredProviderString(detection.language, "Rosette language detection language"),
        confidence: nullableNumber(detection.confidence),
        raw: detection,
      };
    }),
    raw: record,
  };
}

function normalizeEntitiesResult(payload: unknown): Record<string, unknown> {
  const record = requireProviderObject(payload, "Rosette entities response");
  const entitiesResponse = Array.isArray(record.entitiesResponse) ? record.entitiesResponse : record.entities;

  return {
    entitiesResponse: objectArray(entitiesResponse).map(normalizeEntity),
    raw: record,
  };
}

function normalizeSentimentResult(payload: unknown): Record<string, unknown> {
  const record = requireProviderObject(payload, "Rosette sentiment response");

  return {
    document: optionalLabelScore(record.document),
    entities: objectArray(record.entities).map(normalizeEntity),
    raw: record,
  };
}

function normalizeCategoriesResult(payload: unknown): Record<string, unknown> {
  const record = requireProviderObject(payload, "Rosette categories response");

  return {
    categories: objectArray(record.categories).map((category) => ({
      label: nullableProviderString(category.label),
      confidence: nullableNumber(category.confidence),
      score: nullableNumber(category.score),
      raw: category,
    })),
    raw: record,
  };
}

function normalizeTokensResult(payload: unknown): Record<string, unknown> {
  const record = requireProviderObject(payload, "Rosette tokens response");
  if (!Array.isArray(record.tokens)) {
    throw new ProviderRequestError(502, "Rosette tokens response must include a tokens array");
  }

  return {
    tokens: record.tokens.map((token) => String(token)),
    raw: record,
  };
}

function normalizeEntity(entity: Record<string, unknown>): Record<string, unknown> {
  return {
    type: nullableProviderString(entity.type),
    mention: nullableProviderString(entity.mention),
    normalized: nullableProviderString(entity.normalized),
    count: nullableInteger(entity.count) ?? null,
    entityId: nullableProviderString(entity.entityId),
    confidence: nullableNumber(entity.confidence),
    linkingConfidence: nullableNumber(entity.linkingConfidence),
    salience: nullableNumber(entity.salience),
    mentionOffsets: objectArray(entity.mentionOffsets),
    raw: entity,
  };
}

function optionalLabelScore(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }

  return {
    label: nullableProviderString(record.label),
    confidence: nullableNumber(record.confidence),
    raw: record,
  };
}

function createRosetteError(
  response: Response,
  payload: unknown,
  phase: RosetteTextAnalyticsRequestPhase,
): ProviderRequestError {
  const message = extractRosetteErrorMessage(payload) ?? response.statusText ?? "Rosette Text Analytics request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }

  if (response.status === 400) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractRosetteErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.message) ??
    optionalRawString(record.error) ??
    optionalRawString(record.detail) ??
    optionalRawString(record.title) ??
    optionalRawString(record.code)
  );
}

function objectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined);
}

function requireProviderObject(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, providerError);
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : (optionalNumber(value) ?? null);
}

function nullableProviderString(value: unknown): string | null {
  return optionalRawString(value) ?? null;
}

function requiredProviderString(value: unknown, fieldName: string): string {
  const result = optionalRawString(value);
  if (result === undefined) {
    throw providerError(`${fieldName} must be a string`);
  }
  return result;
}

function providerError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
