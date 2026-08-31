import type { CredentialValidationResult } from "../../core/types.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const deeplApiBaseUrl = "https://api.deepl.com";
export const deeplApiFreeBaseUrl = "https://api-free.deepl.com";
export const deeplTranslatePath = "/v2/translate";
export const deeplLanguagesPath = "/v2/languages";
export const deeplUsagePath = "/v2/usage";

type DeeplRequestMode = "validate" | "execute";
type DeeplLanguageType = "source" | "target";

interface DeeplRequestInput {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  mode: DeeplRequestMode;
}

interface DeeplActionInput {
  actionName: string;
  input: Record<string, unknown>;
  apiKey: string;
}

export async function validateDeeplCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = input.apiKey;
  const payload = await requestDeepl(
    apiKey,
    {
      path: deeplUsagePath,
      mode: "validate",
    },
    fetcher,
  );
  const usage = normalizeDeeplUsagePayload(payload);
  const apiBaseUrl = resolveDeeplApiBaseUrl(apiKey);

  return {
    profile: {
      accountId: apiBaseUrl === deeplApiFreeBaseUrl ? "free_api_key" : "pro_api_key",
      displayName: "DeepL API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl,
      validationEndpoint: deeplUsagePath,
      accountType: apiBaseUrl === deeplApiFreeBaseUrl ? "free" : "pro",
      characterCount: usage.character_count,
      characterLimit: usage.character_limit,
    },
  };
}

export async function executeDeeplAction(input: DeeplActionInput, fetcher: typeof fetch): Promise<unknown> {
  switch (input.actionName) {
    case "list_supported_languages":
      return listSupportedLanguages(input, fetcher);
    case "get_usage":
      return getUsage(input, fetcher);
    case "translate_text":
      return translateText(input, fetcher);
    default:
      throw new ProviderRequestError(400, `unknown deepl action: ${String(input.actionName)}`);
  }
}

function resolveDeeplApiBaseUrl(apiKey: string) {
  return apiKey.endsWith(":fx") ? deeplApiFreeBaseUrl : deeplApiBaseUrl;
}

async function listSupportedLanguages(input: DeeplActionInput, fetcher: typeof fetch) {
  const languageType = optionalString(input.input.type) === "target" ? ("target" as const) : ("source" as const);
  const payload = await requestDeepl(
    input.apiKey,
    {
      path: deeplLanguagesPath,
      query: languageType === "target" ? { type: languageType } : undefined,
      mode: "execute",
    },
    fetcher,
  );

  return {
    type: languageType,
    languages: normalizeDeeplLanguagesPayload(payload, languageType),
  };
}

async function getUsage(input: DeeplActionInput, fetcher: typeof fetch) {
  const payload = await requestDeepl(
    input.apiKey,
    {
      path: deeplUsagePath,
      mode: "execute",
    },
    fetcher,
  );

  return {
    usage: normalizeDeeplUsagePayload(payload),
  };
}

async function translateText(input: DeeplActionInput, fetcher: typeof fetch) {
  const payload = await requestDeepl(
    input.apiKey,
    {
      method: "POST",
      path: deeplTranslatePath,
      body: buildTranslateBody(input.input),
      mode: "execute",
    },
    fetcher,
  );

  return {
    translations: normalizeDeeplTranslationsPayload(payload),
  };
}

async function requestDeepl(apiKey: string, input: DeeplRequestInput, fetcher: typeof fetch) {
  const url = new URL(input.path, resolveDeeplApiBaseUrl(apiKey));
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const headers = new Headers({
    authorization: `DeepL-Auth-Key ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  });
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  const timeout = createProviderTimeout(undefined);

  let response: Response;
  try {
    response = await fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortError(error)) {
      throw new ProviderRequestError(504, `DeepL ${input.path} request timed out after 30 seconds`);
    }
    throw new ProviderRequestError(502, `DeepL ${input.path} request failed`);
  } finally {
    timeout.cleanup();
  }

  const payload = await readDeeplPayload(response);
  if (!response.ok) {
    throw createDeeplHttpError(response.status, payload, input.mode);
  }

  return payload;
}

async function readDeeplPayload(response: Response) {
  const raw = await response.text();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function createDeeplHttpError(status: number, payload: unknown, mode: DeeplRequestMode) {
  const message = extractDeeplErrorMessage(payload) ?? `DeepL request failed with status ${status}`;

  if (status === 400) {
    return new ProviderRequestError(400, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(400, message);
  }
  if (status === 404) {
    return new ProviderRequestError(502, message);
  }
  if (status === 429 || status === 456) {
    return new ProviderRequestError(429, message);
  }

  return new ProviderRequestError(
    502,
    mode === "validate" ? `DeepL credential validation failed: ${message}` : message,
  );
}

function extractDeeplErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage = optionalString(record.message);
  if (directMessage) {
    return directMessage;
  }

  const detail = optionalString(record.detail);
  if (detail) {
    return detail;
  }

  const errorRecord = optionalRecord(record.error);
  const nestedMessage = optionalString(errorRecord?.message);
  if (nestedMessage) {
    return nestedMessage;
  }

  return undefined;
}

function normalizeDeeplLanguagesPayload(payload: unknown, type: DeeplLanguageType) {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "DeepL languages response must be an array");
  }

  return payload.map((item, index) => {
    const record = optionalRecord(item);
    const language = readRequiredString(record?.language, `languages[${index}].language`);
    const name = readRequiredString(record?.name, `languages[${index}].name`);
    const supportsFormality = readOptionalBoolean(record?.supports_formality);

    return compactObject({
      language,
      name,
      supports_formality: type === "target" ? (supportsFormality ?? false) : undefined,
    });
  });
}

function normalizeDeeplUsagePayload(payload: unknown) {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "DeepL usage response must be an object");
  }

  const products = Array.isArray(record.products)
    ? record.products.map((item, index) => normalizeDeeplUsageProduct(item, index))
    : undefined;

  return compactObject({
    character_count: readRequiredInteger(record.character_count, "character_count"),
    character_limit: readRequiredInteger(record.character_limit, "character_limit"),
    api_key_character_count: readOptionalInteger(record.api_key_character_count),
    api_key_character_limit: readOptionalInteger(record.api_key_character_limit),
    document_count: readOptionalInteger(record.document_count),
    document_limit: readOptionalInteger(record.document_limit),
    api_key_document_count: readOptionalInteger(record.api_key_document_count),
    api_key_document_limit: readOptionalInteger(record.api_key_document_limit),
    team_document_count: readOptionalInteger(record.team_document_count),
    team_document_limit: readOptionalInteger(record.team_document_limit),
    start_time: readOptionalIsoDatetime(record.start_time),
    end_time: readOptionalIsoDatetime(record.end_time),
    products,
  });
}

function normalizeDeeplUsageProduct(payload: unknown, index: number) {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `DeepL usage product at index ${index} must be an object`);
  }

  return compactObject({
    product_type: readRequiredString(record.product_type, `products[${index}].product_type`),
    api_key_character_count: readOptionalInteger(record.api_key_character_count),
    api_key_document_count: readOptionalInteger(record.api_key_document_count),
    character_count: readOptionalInteger(record.character_count),
    document_count: readOptionalInteger(record.document_count),
  });
}

function normalizeDeeplTranslationsPayload(payload: unknown) {
  const record = optionalRecord(payload);
  if (!record || !Array.isArray(record.translations)) {
    throw new ProviderRequestError(502, "DeepL translation response missing translations array");
  }

  return record.translations.map((item, index) => {
    const translation = optionalRecord(item);
    if (!translation) {
      throw new ProviderRequestError(502, `DeepL translation at index ${index} must be an object`);
    }

    return compactObject({
      detected_source_language: readOptionalNonEmptyString(translation.detected_source_language),
      text: readRequiredString(translation.text, `translations[${index}].text`),
      billed_characters: readOptionalInteger(translation.billed_characters),
      model_type_used: readOptionalNonEmptyString(translation.model_type_used),
    });
  });
}

function buildTranslateBody(input: Record<string, unknown>) {
  const texts = input.texts;
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new ProviderRequestError(400, "texts must be a non-empty array");
  }

  const normalizedTexts = texts.map((value, index) => readRequiredInputText(value, `texts[${index}]`));

  return compactObject({
    text: normalizedTexts,
    target_lang: readRequiredInputString(input.target_lang, "target_lang"),
    source_lang: readOptionalNonEmptyString(input.source_lang),
    context: readOptionalInputText(input.context),
    formality: readOptionalNonEmptyString(input.formality),
    split_sentences: readOptionalNonEmptyString(input.split_sentences),
    preserve_formatting: readOptionalBoolean(input.preserve_formatting),
    show_billed_characters: readOptionalBoolean(input.show_billed_characters),
  });
}

function readRequiredInputText(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readOptionalInputText(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  return value;
}

function readRequiredInputString(value: unknown, fieldName: string) {
  const text = readOptionalNonEmptyString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readRequiredString(value: unknown, fieldName: string) {
  const text = readOptionalNonEmptyString(value);
  if (!text) {
    throw new ProviderRequestError(502, `DeepL response missing ${fieldName}`);
  }
  return text;
}

function readOptionalNonEmptyString(value: unknown) {
  const text = optionalString(value)?.trim();
  return text ? text : undefined;
}

function readRequiredInteger(value: unknown, fieldName: string) {
  const number = readOptionalInteger(value);
  if (number === undefined) {
    throw new ProviderRequestError(502, `DeepL response missing ${fieldName}`);
  }
  return number;
}

function readOptionalInteger(value: unknown) {
  const number = optionalNumber(value);
  if (number === undefined || !Number.isInteger(number)) {
    return undefined;
  }
  return number;
}

function readOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalIsoDatetime(value: unknown) {
  const text = readOptionalNonEmptyString(value);
  if (!text) {
    return undefined;
  }

  return Number.isNaN(Date.parse(text)) ? undefined : text;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
