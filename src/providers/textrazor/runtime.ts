import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { TextrazorActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const textrazorApiBaseUrl: string = "https://api.textrazor.com";
const defaultAnalyzeExtractors = [
  "entities",
  "topics",
  "words",
  "phrases",
  "dependency-trees",
  "relations",
  "entailments",
  "senses",
] as const;

type TextrazorContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type TextrazorActionHandler = (input: Record<string, unknown>, context: TextrazorContext) => Promise<unknown>;

export const textrazorActionHandlers: Record<TextrazorActionName, TextrazorActionHandler> = {
  account_info(_input, context) {
    return textrazorAccountInfo(context);
  },
  analyze_content(input, context) {
    return textrazorAnalyzeContent(input, context);
  },
  extract_entities(input, context) {
    return textrazorExtractEntities(input, context);
  },
  classify_text(input, context) {
    return textrazorClassifyText(input, context);
  },
  custom_classifier_manager(input, context) {
    return textrazorCustomClassifierManager(input, context);
  },
  dictionary_manager(input, context) {
    return textrazorDictionaryManager(input, context);
  },
};

export async function validateTextrazorApiKey(context: TextrazorContext): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await textrazorAccountInfo(context, "validate");

  return {
    profile: {
      accountId: "api_key",
      displayName: "TextRazor API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/account/",
      apiBaseUrl: textrazorApiBaseUrl,
      plan: optionalString(payload.plan),
      requestsUsedToday: optionalInteger(payload.requestsUsedToday),
      concurrentRequestLimit: optionalInteger(payload.concurrentRequestLimit),
      concurrentRequestsUsed: optionalInteger(payload.concurrentRequestsUsed),
      planDailyIncludedRequests: optionalInteger(payload.planDailyIncludedRequests),
    }),
  };
}

async function textrazorAccountInfo(context: TextrazorContext, phase: "validate" | "execute" = "execute") {
  const response = await context.fetcher(`${textrazorApiBaseUrl}/account/`, {
    method: "GET",
    headers: textrazorHeaders(context.apiKey),
    signal: context.signal,
  });

  await assertTextrazorResponse(response, phase);
  return readTextrazorJson(response);
}

async function textrazorAnalyzeContent(input: Record<string, unknown>, context: TextrazorContext) {
  const response = await context.fetcher(`${textrazorApiBaseUrl}/`, {
    method: "POST",
    headers: textrazorFormHeaders(context.apiKey),
    body: buildAnalyzeContentForm(input),
    signal: context.signal,
  });

  return readAnalysisResponse(response);
}

async function textrazorExtractEntities(input: Record<string, unknown>, context: TextrazorContext) {
  const response = await context.fetcher(`${textrazorApiBaseUrl}/`, {
    method: "POST",
    headers: textrazorFormHeaders(context.apiKey),
    body: buildExtractEntitiesForm(input),
    signal: context.signal,
  });

  return readAnalysisResponse(response);
}

async function textrazorClassifyText(input: Record<string, unknown>, context: TextrazorContext) {
  const response = await context.fetcher(`${textrazorApiBaseUrl}/`, {
    method: "POST",
    headers: textrazorFormHeaders(context.apiKey),
    body: buildClassifyTextForm(input),
    signal: context.signal,
  });

  return readAnalysisResponse(response);
}

async function textrazorCustomClassifierManager(input: Record<string, unknown>, context: TextrazorContext) {
  const operation = String(input.operation);
  const classifierId = readRequiredInputString(input.classifier_id, "classifier_id");

  switch (operation) {
    case "create_update": {
      const categories = readCategoryInputArray(input.categories);
      const response = await context.fetcher(`${textrazorApiBaseUrl}/categories/${classifierId}`, {
        method: "PUT",
        headers: {
          ...textrazorHeaders(context.apiKey),
          "content-type": "text/csv; charset=utf-8",
        },
        body: serializeClassifierCategories(categories),
        signal: context.signal,
      });
      await assertTextrazorResponse(response, "execute");
      return { success: true, classifierId, categoryCount: categories.length };
    }
    case "delete": {
      const response = await context.fetcher(`${textrazorApiBaseUrl}/categories/${classifierId}`, {
        method: "DELETE",
        headers: textrazorHeaders(context.apiKey),
        signal: context.signal,
      });
      await assertTextrazorResponse(response, "execute");
      return { success: true, classifierId };
    }
    case "get_categories": {
      const url = withQuery(`${textrazorApiBaseUrl}/categories/${classifierId}/_all`, {
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
      });
      const response = await context.fetcher(url, {
        method: "GET",
        headers: textrazorHeaders(context.apiKey),
        signal: context.signal,
      });
      await assertTextrazorResponse(response, "execute");
      return response.json();
    }
    case "get_category": {
      const categoryId = readRequiredInputString(input.category_id, "category_id");
      const response = await context.fetcher(`${textrazorApiBaseUrl}/categories/${classifierId}/${categoryId}`, {
        method: "GET",
        headers: textrazorHeaders(context.apiKey),
        signal: context.signal,
      });
      await assertTextrazorResponse(response, "execute");
      return response.json();
    }
    case "delete_category": {
      const categoryId = readRequiredInputString(input.category_id, "category_id");
      const response = await context.fetcher(`${textrazorApiBaseUrl}/categories/${classifierId}/${categoryId}`, {
        method: "DELETE",
        headers: textrazorHeaders(context.apiKey),
        signal: context.signal,
      });
      await assertTextrazorResponse(response, "execute");
      return { success: true, classifierId, categoryId };
    }
    default:
      throw new ProviderRequestError(400, `unknown custom classifier operation: ${operation}`);
  }
}

async function textrazorDictionaryManager(input: Record<string, unknown>, context: TextrazorContext) {
  const operation = String(input.operation);
  const dictionaryId = optionalString(input.dictionary_id);

  switch (operation) {
    case "create": {
      const response = await context.fetcher(`${textrazorApiBaseUrl}/entities/${dictionaryId}`, {
        method: "PUT",
        headers: { ...textrazorHeaders(context.apiKey), "content-type": "application/json" },
        body: JSON.stringify({}),
        signal: context.signal,
      });
      await assertTextrazorResponse(response, "execute");
      return { success: true, dictionaryId };
    }
    case "list": {
      const response = await context.fetcher(`${textrazorApiBaseUrl}/entities/`, {
        method: "GET",
        headers: textrazorHeaders(context.apiKey),
        signal: context.signal,
      });
      await assertTextrazorResponse(response, "execute");
      return response.json();
    }
    case "get": {
      const response = await context.fetcher(`${textrazorApiBaseUrl}/entities/${dictionaryId}`, {
        method: "GET",
        headers: textrazorHeaders(context.apiKey),
        signal: context.signal,
      });
      await assertTextrazorResponse(response, "execute");
      return response.json();
    }
    case "delete": {
      const response = await context.fetcher(`${textrazorApiBaseUrl}/entities/${dictionaryId}`, {
        method: "DELETE",
        headers: textrazorHeaders(context.apiKey),
        signal: context.signal,
      });
      await assertTextrazorResponse(response, "execute");
      return { success: true, dictionaryId };
    }
    case "add_entries": {
      const entries = readDictionaryEntries(input.entries);
      const response = await context.fetcher(`${textrazorApiBaseUrl}/entities/${dictionaryId}/_all`, {
        method: "POST",
        headers: { ...textrazorHeaders(context.apiKey), "content-type": "application/json" },
        body: JSON.stringify(entries),
        signal: context.signal,
      });
      await assertTextrazorResponse(response, "execute");
      return { success: true, dictionaryId, entryCount: entries.length };
    }
    case "get_entries": {
      const url = withQuery(`${textrazorApiBaseUrl}/entities/${dictionaryId}/_all`, {
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
      });
      const response = await context.fetcher(url, {
        method: "GET",
        headers: textrazorHeaders(context.apiKey),
        signal: context.signal,
      });
      await assertTextrazorResponse(response, "execute");
      return response.json();
    }
    case "delete_entries": {
      const deletedEntryIds: string[] = [];
      for (const entryId of readDictionaryEntryIds(input.entries)) {
        const response = await context.fetcher(`${textrazorApiBaseUrl}/entities/${dictionaryId}/${entryId}`, {
          method: "DELETE",
          headers: textrazorHeaders(context.apiKey),
          signal: context.signal,
        });
        await assertTextrazorResponse(response, "execute");
        deletedEntryIds.push(entryId);
      }
      return { success: true, dictionaryId, deletedEntryIds };
    }
    default:
      throw new ProviderRequestError(400, `unknown dictionary operation: ${operation}`);
  }
}

async function readAnalysisResponse(response: Response) {
  await assertTextrazorResponse(response, "execute");
  const payload = await readTextrazorJson(response);
  if (payload.ok === false) {
    const message = optionalString(payload.error) ?? optionalString(payload.message) ?? "textrazor analysis failed";
    throw new ProviderRequestError(400, message);
  }
  return payload;
}

function buildAnalyzeContentForm(input: Record<string, unknown>) {
  const form = new URLSearchParams();
  form.set("text", readRequiredInputString(input.text, "text"));
  form.set("extractors", normalizeExtractorList(input.extractors) ?? defaultAnalyzeExtractors.join(","));
  appendCommonAnalyzeFields(form, input);
  return form.toString();
}

function buildExtractEntitiesForm(input: Record<string, unknown>) {
  const form = new URLSearchParams();
  form.set("text", readRequiredInputString(input.text, "text"));
  form.set("extractors", "entities");
  appendCommonAnalyzeFields(form, input);
  setOptionalBoolean(form, "entities.allowOverlap", input.entities_allow_overlap);
  setOptionalStringList(form, "entities.filterDbpediaTypes", input.entities_filter_dbpedia_types);
  setOptionalStringList(form, "entities.filterFreebaseTypes", input.entities_filter_freebase_types);
  setOptionalStringList(form, "entities.dictionaries", input.entity_dictionaries);
  return form.toString();
}

function buildClassifyTextForm(input: Record<string, unknown>) {
  const form = new URLSearchParams();
  form.set("text", readRequiredInputString(input.text, "text"));
  form.set("extractors", "categories");
  form.set("classifiers", normalizeClassifierList(input.classifiers));
  appendCommonAnalyzeFields(form, input);
  return form.toString();
}

function appendCommonAnalyzeFields(form: URLSearchParams, input: Record<string, unknown>) {
  setOptionalString(form, "cleanup.mode", input.cleanup_mode);
  setOptionalString(form, "languageOverride", input.language_override);
  setOptionalBoolean(form, "cleanup.useMetadata", input.cleanup_use_metadata);
  setOptionalBoolean(form, "cleanup.returnCleaned", input.cleanup_return_cleaned);
}

function normalizeExtractorList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).join(",") : undefined;
}

function normalizeClassifierList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item)).join(",")
    : readRequiredInputString(value, "classifiers");
}

function setOptionalString(form: URLSearchParams, key: string, value: unknown) {
  const stringValue = optionalString(value);
  if (stringValue) {
    form.set(key, stringValue);
  }
}

function setOptionalBoolean(form: URLSearchParams, key: string, value: unknown) {
  if (typeof value === "boolean") {
    form.set(key, String(value));
  }
}

function setOptionalStringList(form: URLSearchParams, key: string, value: unknown) {
  if (Array.isArray(value) && value.length > 0) {
    form.set(key, value.map((item) => String(item)).join(","));
  }
}

function serializeClassifierCategories(categories: Array<{ category_id: string; label?: string; query: string }>) {
  return categories
    .map((category) => [category.category_id, category.label ?? "", category.query].map(escapeCsvValue).join(","))
    .join("\n");
}

function escapeCsvValue(value: string) {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function readCategoryInputArray(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "categories must be an array");
  }
  return value.map((item) => {
    const record = readObject(item);
    return {
      category_id: readRequiredInputString(record.category_id, "category_id"),
      label: optionalString(record.label),
      query: readRequiredInputString(record.query, "query"),
    };
  });
}

function readRawDictionaryEntries(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "entries must be an array");
  }
  return value.map((item) => {
    const record = readObject(item);
    return compactObject({
      id: optionalString(record.id),
      text: optionalString(record.text),
      data: optionalRecord(record.data),
    });
  });
}

function readDictionaryEntries(value: unknown) {
  return readRawDictionaryEntries(value).map((entry) => {
    if (!entry.text) {
      throw new ProviderRequestError(400, "each dictionary entry requires text");
    }
    return entry;
  });
}

function readDictionaryEntryIds(value: unknown) {
  return readRawDictionaryEntries(value).map((entry) => {
    if (!entry.id) {
      throw new ProviderRequestError(400, "delete_entries requires every entry to include id");
    }
    return entry.id;
  });
}

function readObject(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, "object input is required");
  }
  return record;
}

function withQuery(url: string, params: Record<string, number | undefined>) {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      parsed.searchParams.set(key, String(value));
    }
  }
  return parsed.toString();
}

function textrazorHeaders(apiKey: string) {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-textrazor-key": apiKey,
  };
}

function textrazorFormHeaders(apiKey: string) {
  return {
    ...textrazorHeaders(apiKey),
    "content-type": "application/x-www-form-urlencoded; charset=utf-8",
  };
}

async function assertTextrazorResponse(response: Response, mode: "validate" | "execute") {
  if (response.ok) {
    return;
  }

  const error = await readTextrazorError(response);
  if (response.status === 429) {
    throw new ProviderRequestError(429, error.message, error.raw);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, error.message, error.raw);
  }
  if (response.status === 400 || response.status === 422) {
    throw new ProviderRequestError(400, error.message, error.raw);
  }
  throw new ProviderRequestError(response.status || 502, error.message, error.raw);
}

async function readTextrazorJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function readTextrazorError(response: Response) {
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    return {
      message:
        optionalString(payload.error) ??
        optionalString(payload.message) ??
        optionalString(payload.detail) ??
        `textrazor request failed with ${response.status}`,
      raw: payload,
    };
  } catch {
    const text =
      optionalString(await response.text().catch(() => "")) ?? `textrazor request failed with ${response.status}`;
    return { message: text, raw: text };
  }
}

function readRequiredInputString(value: unknown, fieldName: string) {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}
