import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalRawString, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

const service = "predis_ai";
const apiBaseUrl = "https://brain.predis.ai/predis_api/v1";
const createContentPath = "/create_content/";
const getPostsPath = "/get_posts/";
const getTemplatesPath = "/get_templates/";
const requestTimeoutMs = 30_000;
const maxResponseBytes = 10 * 1024 * 1024;
const validationBrandId = "__oomol_validation_brand__";

type PredisAiPhase = "validate" | "execute";

interface PredisAiRequest {
  context: ApiKeyProviderContext;
  path: string;
  method: "GET" | "POST";
  phase: PredisAiPhase;
  query?: URLSearchParams;
  body?: BodyInit;
  acceptInvalidBrand?: boolean;
}

type PredisAiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const predisAiActionHandlers: ProviderActionHandlers<"predis_ai", PredisAiActionHandler> = {
  async list_templates(input, context) {
    const query = buildListQuery(input);
    setQuery(query, "post_type", optionalString(input.postType));
    setQuery(query, "aspect_ratio", optionalString(input.aspectRatio));
    const response = await requestPredisAi({
      context,
      path: getTemplatesPath,
      method: "GET",
      query,
      phase: "execute",
    });
    return normalizeTemplatesPayload(response.payload);
  },
  async list_posts(input, context) {
    const response = await requestPredisAi({
      context,
      path: getPostsPath,
      method: "GET",
      query: buildListQuery(input),
      phase: "execute",
    });
    return normalizePostsPayload(response.payload);
  },
  async create_content(input, context) {
    validateCreateContentInput(input);
    const response = await requestPredisAi({
      context,
      path: createContentPath,
      method: "POST",
      body: buildCreateContentForm(input),
      phase: "execute",
    });
    return normalizeCreateContentPayload(response.payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, predisAiActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_header", name: "Authorization" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const response = await requestPredisAi({
      context: { apiKey: input.apiKey, fetcher, signal },
      path: getTemplatesPath,
      method: "GET",
      query: new URLSearchParams({ brand_id: validationBrandId, items_n: "1" }),
      phase: "validate",
      acceptInvalidBrand: true,
    });
    if (!response.acceptedInvalidBrand) {
      normalizeTemplatesPayload(response.payload);
    }
    return {
      profile: {
        accountId: "predis_ai",
        displayName: "Predis.ai API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        validationEndpoint: getTemplatesPath,
      },
    };
  },
};

function buildListQuery(input: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams({
    brand_id: requiredPredisAiString(input.brandId, "brandId"),
  });
  setQuery(query, "media_type", optionalString(input.mediaType));
  setQuery(query, "page_n", formatInteger(input.pageNumber));
  setQuery(query, "items_n", formatInteger(input.itemsPerPage));
  return query;
}

function buildCreateContentForm(input: Record<string, unknown>): FormData {
  const body = new FormData();
  body.append("brand_id", requiredPredisAiString(input.brandId, "brandId"));
  body.append("text", requiredPredisAiString(input.text, "text"));
  appendForm(body, "post_type", optionalString(input.postType));
  appendForm(body, "model_version", optionalString(input.modelVersion));
  appendForm(body, "n_posts", formatInteger(input.postsCount));
  appendForm(body, "input_language", optionalString(input.inputLanguage));
  appendForm(body, "output_language", optionalString(input.outputLanguage));
  appendForm(body, "media_type", optionalString(input.mediaType));
  appendForm(body, "video_duration", optionalString(input.videoDuration));
  appendJsonForm(body, "template_ids", input.templateIds);
  appendForm(body, "author", optionalString(input.author));
  appendJsonForm(body, "media_urls", input.mediaUrls);
  appendForm(body, "color_palette_type", optionalString(input.colorPaletteType));
  appendJsonForm(body, "brand_details", input.brandDetails);
  appendJsonForm(body, "headlines", input.headlines);
  return body;
}

async function requestPredisAi(input: PredisAiRequest): Promise<{ payload: unknown; acceptedInvalidBrand: boolean }> {
  const url = new URL(input.path.replace(/^\/+/, ""), `${apiBaseUrl}/`);
  for (const [key, value] of input.query ?? []) {
    url.searchParams.append(key, value);
  }
  const timeout = createProviderTimeout(input.context.signal, requestTimeoutMs);
  try {
    const response = await input.context.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        Authorization: input.context.apiKey,
        "user-agent": providerUserAgent,
      },
      body: input.body,
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      if (input.acceptInvalidBrand && response.status === 400 && hasInvalidBrandError(payload)) {
        return { payload, acceptedInvalidBrand: true };
      }
      throw createPredisAiError(response.status, payload, input.phase);
    }
    return { payload, acceptedInvalidBrand: false };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortError(error)) {
      throw new ProviderRequestError(504, "Predis.ai request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Predis.ai request failed: ${error.message}` : "Predis.ai request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function normalizeTemplatesPayload(payload: unknown): Record<string, unknown> {
  const record = requireResponseObject(payload, "templates response");
  return {
    templates: Array.isArray(record.templates) ? record.templates.map(normalizeTemplate) : [],
    totalPages: readNullableInteger(record.total_pages),
    errors: readErrors(record.errors),
    raw: record,
  };
}

function normalizePostsPayload(payload: unknown): Record<string, unknown> {
  const record = requireResponseObject(payload, "posts response");
  return {
    posts: Array.isArray(record.posts) ? record.posts.map(normalizePost) : [],
    totalPages: readNullableInteger(record.total_pages),
    errors: readErrors(record.errors),
    raw: record,
  };
}

function normalizeCreateContentPayload(payload: unknown): Record<string, unknown> {
  const record = requireResponseObject(payload, "create content response");
  return {
    postIds: readStrings(record.post_ids),
    postStatus: optionalString(record.post_status) ?? null,
    errors: readErrors(record.errors),
    raw: record,
  };
}

function normalizeTemplate(value: unknown): Record<string, unknown> {
  const record = requireResponseObject(value, "template");
  return {
    templateId: optionalString(record.template_id) ?? null,
    mediaType: optionalString(record.media_type) ?? null,
    raw: record,
  };
}

function normalizePost(value: unknown): Record<string, unknown> {
  const record = requireResponseObject(value, "post");
  return {
    postId: optionalString(record.post_id) ?? null,
    urls: readStrings(record.urls),
    caption: optionalString(record.caption) ?? null,
    mediaType: optionalString(record.media_type) ?? null,
    raw: record,
  };
}

function requireResponseObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Predis.ai ${label} was not an object`);
  }
  return record;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Predis.ai response", maxResponseBytes);
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Predis.ai returned invalid JSON");
  }
}

function createPredisAiError(status: number, payload: unknown, phase: PredisAiPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Predis.ai request failed with HTTP ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function readErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const direct = optionalString(record?.message) ?? optionalString(record?.detail);
  if (direct) {
    return direct;
  }
  for (const error of Array.isArray(record?.errors) ? record.errors : []) {
    const errorRecord = optionalRecord(error);
    const detail = optionalString(errorRecord?.detail);
    const solution = optionalString(errorRecord?.solution);
    if (detail) {
      return solution ? `${detail}: ${solution}` : detail;
    }
  }
  return undefined;
}

function hasInvalidBrandError(payload: unknown): boolean {
  return readErrorMessage(payload)?.toLowerCase().includes("brand_id") === true;
}

function readErrors(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = optionalRecord(item);
        return record ? [record] : [];
      })
    : [];
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readNullableInteger(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function formatInteger(value: unknown): string | undefined {
  const valueAsInteger = optionalInteger(value);
  return valueAsInteger === undefined ? undefined : String(valueAsInteger);
}

function setQuery(query: URLSearchParams, name: string, value: string | undefined): void {
  if (value !== undefined) {
    query.set(name, value);
  }
}

function appendForm(body: FormData, name: string, value: string | undefined): void {
  if (value !== undefined) {
    body.append(name, value);
  }
}

function appendJsonForm(body: FormData, name: string, value: unknown): void {
  if (value !== undefined) {
    body.append(name, JSON.stringify(value));
  }
}

function validateCreateContentInput(input: Record<string, unknown>): void {
  const text = requiredPredisAiString(input.text, "text");
  if (countWords(text) < 3) {
    throw new ProviderRequestError(400, "text must contain at least 3 words");
  }
  if (
    optionalString(input.mediaType) === undefined &&
    (!Array.isArray(input.templateIds) || input.templateIds.length === 0)
  ) {
    throw new ProviderRequestError(400, "create_content requires mediaType or templateIds");
  }
}

function countWords(value: string): number {
  let count = 0;
  let inWord = false;
  for (const character of value.trim()) {
    if (!character.trim()) {
      inWord = false;
    } else if (!inWord) {
      count += 1;
      inWord = true;
    }
  }
  return count;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function requiredPredisAiString(value: unknown, fieldName: string): string {
  const text = optionalRawString(value);
  if (!text?.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}
