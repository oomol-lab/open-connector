import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRawString, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  providerUserAgent,
  ProviderRequestError,
  requiredResponseRecord,
} from "../provider-runtime.ts";

export const lingvanexTranslationApiBaseUrl = "https://api-gl.lingvanex.com";

const translationPath = "/language/translate/v2";
const requestTimeoutMs = 30_000;

type LingvanexPhase = "validate" | "execute";
type LingvanexQueryValue = string | string[] | undefined;

interface LingvanexRequestInput {
  path: string;
  method: "GET" | "POST";
  query: Record<string, LingvanexQueryValue>;
}

export const lingvanexTranslationApiActionHandlers: ProviderActionHandlers<
  "lingvanex_translation_api",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  translate_text(input, context) {
    return translateText(input, context);
  },
  detect_language(input, context) {
    return detectLanguage(input, context);
  },
  list_languages(input, context) {
    return listLanguages(input, context, "execute");
  },
};

export async function validateLingvanexTranslationApiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const output = await listLanguages(
    {},
    {
      apiKey,
      fetcher,
      signal,
    },
    "validate",
  );

  return {
    profile: {
      accountId: "lingvanex_translation_api:api-key",
      displayName: "Lingvanex Translation API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: lingvanexTranslationApiBaseUrl,
      validationEndpoint: `${translationPath}/languages`,
      languageCount: output.languages.length,
    },
  };
}

async function translateText(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestLingvanexJson(
    {
      path: translationPath,
      method: "POST",
      query: {
        q: readTextInput(input.q, "q"),
        target: readRequiredRawString(input.target, "target"),
        source: optionalRawString(input.source),
        format: optionalRawString(input.format),
        model: optionalRawString(input.model),
      },
    },
    context,
    "execute",
  );
  const root = requiredResponseRecord(payload, "Lingvanex translation response");
  const data = requiredResponseRecord(root.data, "Lingvanex translation response data");
  const translations = readArray(data.translations, "Lingvanex translation response translations").map((value) => {
    const translation = requiredResponseRecord(value, "Lingvanex translation");
    return {
      translatedText: readRequiredRawString(translation.translatedText, "translatedText", 502),
      detectedSourceLanguage: optionalRawString(translation.detectedSourceLanguage) ?? null,
      model: optionalRawString(translation.model) ?? null,
      raw: translation,
    };
  });

  return {
    translations,
    raw: root,
  };
}

async function detectLanguage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestLingvanexJson(
    {
      path: `${translationPath}/detect`,
      method: "POST",
      query: {
        q: readTextInput(input.q, "q"),
      },
    },
    context,
    "execute",
  );
  const root = requiredResponseRecord(payload, "Lingvanex detection response");
  const data = requiredResponseRecord(root.data, "Lingvanex detection response data");
  const detections = readArray(data.detections, "Lingvanex detection response detections").map((group) =>
    readArray(group, "Lingvanex detection candidate group").map((value) => {
      const detection = requiredResponseRecord(value, "Lingvanex detection candidate");
      return {
        language: readRequiredRawString(detection.language, "language", 502),
        isReliable: typeof detection.isReliable == "boolean" ? detection.isReliable : null,
        confidence: typeof detection.confidence == "number" ? detection.confidence : null,
        raw: detection,
      };
    }),
  );

  return {
    detections,
    raw: root,
  };
}

async function listLanguages(
  input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: LingvanexPhase,
): Promise<{
  languages: Array<{ language: string; name: string | null; raw: Record<string, unknown> }>;
  raw: unknown;
}> {
  const payload = await requestLingvanexJson(
    {
      path: `${translationPath}/languages`,
      method: "GET",
      query: {
        target: optionalRawString(input.target),
        model: optionalRawString(input.model),
      },
    },
    context,
    phase,
  );
  const root = requiredResponseRecord(payload, "Lingvanex languages response");
  const data = requiredResponseRecord(root.data, "Lingvanex languages response data");
  const languages = readArray(data.languages, "Lingvanex languages response languages").map((value) => {
    const language = requiredResponseRecord(value, "Lingvanex language");
    return {
      language: readRequiredRawString(language.language, "language", 502),
      name: optionalRawString(language.name) ?? null,
      raw: language,
    };
  });

  return {
    languages,
    raw: root,
  };
}

async function requestLingvanexJson(
  input: LingvanexRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: LingvanexPhase,
): Promise<unknown> {
  const url = new URL(input.path, lingvanexTranslationApiBaseUrl);
  for (const [key, value] of Object.entries(input.query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
    } else if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  url.searchParams.set("key", context.apiKey);

  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    payload = await readLingvanexPayload(response);
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, `Lingvanex request timed out after ${requestTimeoutMs / 1000} seconds`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Lingvanex request failed: ${error.message}` : "Lingvanex request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createLingvanexError(response.status, payload, phase);
  }

  return payload;
}

async function readLingvanexPayload(response: Response): Promise<unknown> {
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

function createLingvanexError(status: number, payload: unknown, phase: LingvanexPhase): ProviderRequestError {
  const message = extractLingvanexErrorMessage(payload) ?? "Lingvanex request failed";

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (status === 400 || status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message);
  }
  if (status === 400) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function extractLingvanexErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? extractLingvanexErrorMessage(record.error);
}

function readTextInput(value: unknown, fieldName: string): string | string[] {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value.map((item, index) => {
      if (typeof item !== "string" || item.trim() === "") {
        throw new ProviderRequestError(400, `${fieldName}[${index}] must be a non-empty string`);
      }
      return item;
    });
  }
  throw new ProviderRequestError(400, `${fieldName} must be a non-empty string or non-empty string array`);
}

function readRequiredRawString(value: unknown, fieldName: string, status = 400): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(status, `${fieldName} is required.`);
  }
  return value;
}

function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }
  return value;
}
