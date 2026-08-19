import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const jigsawstackApiBaseUrl = "https://api.jigsawstack.com";
const jigsawstackDefaultRequestTimeoutMs = 30_000;
const jigsawstackValidationPath = "/v1/web/search/suggest";
const jigsawstackValidationQuery = "oomol";

type JigsawstackRequestPhase = "validate" | "execute";

interface JigsawstackRequest {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  phase?: JigsawstackRequestPhase;
}

export const jigsawstackActionHandlers: ProviderActionHandlers<
  "jigsawstack",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async search_web(input, context) {
    return normalizeSearchWebResponse(
      await requestJigsawstackJson(context, {
        method: "POST",
        path: "/v1/web/search",
        body: buildSearchWebBody(input),
      }),
    );
  },
  async get_search_suggestions(input, context) {
    return normalizeSearchSuggestionsResponse(
      await requestJigsawstackJson(context, {
        method: "GET",
        path: "/v1/web/search/suggest",
        query: { query: optionalString(input.query) },
      }),
    );
  },
  async translate_text(input, context) {
    return normalizeTranslateTextResponse(
      await requestJigsawstackJson(context, {
        method: "POST",
        path: "/v1/ai/translate",
        body: buildTranslateTextBody(input),
      }),
    );
  },
  async summarize_text(input, context) {
    return normalizeSummarizeTextResponse(
      await requestJigsawstackJson(context, {
        method: "POST",
        path: "/v1/ai/summary",
        body: buildSummarizeTextBody(input),
      }),
    );
  },
  async check_spam(input, context) {
    return normalizeCheckSpamResponse(
      await requestJigsawstackJson(context, {
        method: "POST",
        path: "/v1/validate/spam_check",
        body: { text: input.text },
      }),
    );
  },
  async check_profanity(input, context) {
    return normalizeCheckProfanityResponse(
      await requestJigsawstackJson(context, {
        method: "POST",
        path: "/v1/validate/profanity",
        body: compactObject({
          text: input.text,
          censor_replacement: input.censorReplacement,
        }),
      }),
    );
  },
};

export async function validateJigsawstackCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  await requestJigsawstackJson(
    {
      apiKey: input.apiKey,
      fetcher: options.fetcher,
      signal: options.signal,
    },
    {
      method: "GET",
      path: jigsawstackValidationPath,
      query: { query: jigsawstackValidationQuery },
      phase: "validate",
    },
  );

  return {
    profile: {
      accountId: "jigsawstack",
      displayName: "JigsawStack API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: jigsawstackApiBaseUrl,
      validationEndpoint: jigsawstackValidationPath,
    },
  };
}

function buildSearchWebBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    query: input.query,
    ai_overview: optionalBoolean(input.aiOverview),
    safe_search: input.safeSearch,
    spell_check: optionalBoolean(input.spellCheck),
    byo_urls: input.byoUrls,
    country_code: input.countryCode,
    auto_scrape: optionalBoolean(input.autoScrape),
    max_results: optionalNumber(input.maxResults),
  });
}

function buildTranslateTextBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    text: input.text,
    target_language: input.targetLanguage,
    current_language: input.currentLanguage,
  });
}

function buildSummarizeTextBody(input: Record<string, unknown>): Record<string, unknown> {
  if (input.text === undefined && input.url === undefined && input.fileStoreKey === undefined) {
    throw new ProviderRequestError(400, "one of text, url, or fileStoreKey is required");
  }

  return compactObject({
    text: input.text,
    url: input.url,
    file_store_key: input.fileStoreKey,
    type: input.type,
    max_points: optionalNumber(input.maxPoints),
    max_characters: optionalNumber(input.maxCharacters),
  });
}

async function requestJigsawstackJson(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  request: JigsawstackRequest,
): Promise<Record<string, unknown>> {
  const timeoutHandle = createProviderTimeout(context.signal, jigsawstackDefaultRequestTimeoutMs);

  try {
    const response = await context.fetcher(buildJigsawstackUrl(request.path, request.query), {
      method: request.method ?? "GET",
      headers: jigsawstackHeaders(context.apiKey),
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: timeoutHandle.signal,
    });
    const payload = await readJigsawstackPayload(response);
    if (!response.ok) {
      throw createJigsawstackError(response, payload, request.phase ?? "execute");
    }

    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "JigsawStack returned invalid JSON object");
    }
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "JigsawStack request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `JigsawStack request failed: ${error.message}` : "JigsawStack request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function jigsawstackHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
}

function buildJigsawstackUrl(path: string, query: Record<string, string | undefined> = {}): URL {
  const url = new URL(path, jigsawstackApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readJigsawstackPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "JigsawStack returned invalid JSON");
  }
}

function createJigsawstackError(
  response: Response,
  payload: unknown,
  phase: JigsawstackRequestPhase,
): ProviderRequestError {
  const message =
    extractJigsawstackErrorMessage(payload) ?? `JigsawStack request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }

  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractJigsawstackErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const topLevelMessage = optionalString(record.message);
  if (topLevelMessage) {
    return topLevelMessage;
  }

  const errorString = optionalString(record.error);
  if (errorString) {
    return errorString;
  }

  const errorRecord = optionalRecord(record.error);
  return optionalString(errorRecord?.message);
}

function normalizeSearchWebResponse(record: Record<string, unknown>): Record<string, unknown> {
  return {
    ...baseJigsawstackOutput(record),
    query: optionalString(record.query) ?? null,
    aiOverview: optionalString(record.ai_overview) ?? null,
    spellFixed: optionalBoolean(record.spell_fixed) ?? null,
    isSafe: optionalBoolean(record.is_safe) ?? null,
    results: asObjectArray(record.results),
    links: asStringArray(record.links),
    imageUrls: asStringArray(record.image_urls),
    geoResults: asObjectArray(record.geo_results),
  };
}

function normalizeSearchSuggestionsResponse(record: Record<string, unknown>): Record<string, unknown> {
  return {
    ...baseJigsawstackOutput(record),
    suggestions: asStringArray(record.suggestions),
  };
}

function normalizeTranslateTextResponse(record: Record<string, unknown>): Record<string, unknown> {
  return {
    ...baseJigsawstackOutput(record),
    translatedText: record.translated_text,
  };
}

function normalizeSummarizeTextResponse(record: Record<string, unknown>): Record<string, unknown> {
  return {
    ...baseJigsawstackOutput(record),
    summary: record.summary,
  };
}

function normalizeCheckSpamResponse(record: Record<string, unknown>): Record<string, unknown> {
  return {
    ...baseJigsawstackOutput(record),
    check: record.check,
  };
}

function normalizeCheckProfanityResponse(record: Record<string, unknown>): Record<string, unknown> {
  return {
    ...baseJigsawstackOutput(record),
    message: optionalString(record.message) ?? null,
    cleanText: optionalString(record.clean_text) ?? null,
    profanities: asObjectArray(record.profanities),
    profanitiesFound: optionalBoolean(record.profanities_found) ?? null,
  };
}

function baseJigsawstackOutput(record: Record<string, unknown>): Record<string, unknown> {
  return {
    success: optionalBoolean(record.success) ?? true,
    logId: optionalString(record.log_id) ?? null,
    usage: optionalRecord(record._usage) ?? null,
    raw: record,
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function asObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item),
  );
}
