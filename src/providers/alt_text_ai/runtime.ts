import type { CredentialValidationResult } from "../../core/types.ts";

import { compactObject, optionalInteger, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const altTextAiApiBaseUrl = "https://alttext.ai/api/v1";

type RequestPhase = "validate" | "execute";

export interface ActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface RequestOptions {
  method: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

type ActionHandler = (input: Record<string, unknown>, context: ActionContext) => Promise<unknown>;

export const altTextAiActionHandlers: Record<string, ActionHandler> = {
  get_account(_input, context) {
    return fetchJson("/account", { method: "GET" }, context);
  },
  create_image(input, context) {
    const image = compactObject({
      url: input.url,
      asset_id: input.asset_id,
      tags: input.tags,
      metadata: input.metadata,
    });
    return fetchJson(
      "/images",
      {
        method: "POST",
        body: compactObject({
          image,
          ecomm: input.ecomm,
          lang: input.lang,
          max_chars: input.max_chars,
          overwrite: input.overwrite,
          gpt_prompt: input.gpt_prompt,
          model_name: input.model_name,
          timeout_secs: input.timeout_secs,
          keywords: input.keywords,
          negative_keywords: input.negative_keywords,
          keyword_source: input.keyword_source,
        }),
      },
      context,
    );
  },
  async list_images(input, context) {
    const result = await fetchResponseJson(
      "/images",
      {
        method: "GET",
        query: compactObject({
          page: input.page,
          limit: input.limit,
          url: input.url,
        }),
      },
      context,
      "execute",
    );

    return {
      images: readImages(result.payload),
      pagination: readPagination(result.response.headers),
    };
  },
  get_image(input, context) {
    return fetchJson(
      `/images/${encodeURIComponent(requiredInputString(input.asset_id, "asset_id"))}`,
      { method: "GET" },
      context,
    );
  },
  async search_images(input, context) {
    const result = await fetchResponseJson(
      "/images/search",
      {
        method: "GET",
        query: compactObject({
          q: input.query,
          page: input.page,
          limit: input.limit,
        }),
      },
      context,
      "execute",
    );

    return {
      images: readImages(result.payload),
      pagination: readPagination(result.response.headers),
    };
  },
  delete_image(input, context) {
    return fetchJson(
      `/images/${encodeURIComponent(requiredInputString(input.asset_id, "asset_id"))}`,
      { method: "DELETE" },
      context,
    );
  },
  scrape_page(input, context) {
    if (input.url === undefined && input.html === undefined) {
      throw new ProviderRequestError(400, "url or html is required");
    }

    return fetchJson(
      "/images/page_scrape",
      {
        method: "POST",
        body: compactObject({
          page_scrape: compactObject({
            url: input.url,
            html: input.html,
          }),
          keywords: input.keywords,
          negative_keywords: input.negative_keywords,
          lang: input.lang,
          include_existing: typeof input.include_existing === "boolean" ? input.include_existing : undefined,
        }),
      },
      context,
    );
  },
};

export async function validateAltTextAiCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = {
    apiKey: requiredInputString(input.apiKey, "apiKey"),
    fetcher,
    signal,
  };
  const payload = await fetchJson("/account", { method: "GET" }, context, "validate");
  const account = requiredRecord(
    payload,
    "AltText.ai account",
    () => new ProviderRequestError(502, "AltText.ai returned invalid account payload"),
  );
  const accountName = optionalString(account.name);

  return {
    profile: {
      accountId: accountName ?? "alt_text_ai_api_key",
      displayName: accountName ?? "AltText.ai API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: altTextAiApiBaseUrl,
      validationEndpoint: "/account",
      usage: optionalInteger(account.usage),
      usageLimit: optionalInteger(account.usage_limit),
    }),
  };
}

async function fetchJson(
  path: string,
  options: RequestOptions,
  context: ActionContext,
  phase: RequestPhase = "execute",
): Promise<unknown> {
  const result = await fetchResponseJson(path, options, context, phase);
  return result.payload;
}

async function fetchResponseJson(
  path: string,
  options: RequestOptions,
  context: ActionContext,
  phase: RequestPhase,
): Promise<{ response: Response; payload: unknown }> {
  const url = buildUrl(path);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(`${key}[]`, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: options.method,
      headers: headers(context.apiKey, options.body ? { "content-type": "application/json" } : {}),
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `AltText.ai request failed: ${error.message}` : "AltText.ai request failed",
    );
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    throw createError(response, payload, phase);
  }

  return { response, payload };
}

function headers(apiKey: string, extraHeaders: Record<string, string>): HeadersInit {
  return {
    "X-API-Key": apiKey,
    accept: "application/json",
    "user-agent": providerUserAgent,
    ...extraHeaders,
  };
}

function buildUrl(path: string): URL {
  const baseUrl = altTextAiApiBaseUrl.endsWith("/") ? altTextAiApiBaseUrl : `${altTextAiApiBaseUrl}/`;
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(relativePath, baseUrl);
}

async function readPayload(response: Response): Promise<unknown> {
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

function createError(response: Response, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? response.statusText ?? "AltText.ai request failed";

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const directError = optionalString(record.error);
  if (directError) {
    return directError;
  }

  const errors = record.errors;
  if (!errors || typeof errors !== "object" || Array.isArray(errors)) {
    return undefined;
  }

  for (const value of Object.values(errors)) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value)) {
      const message = value.find((item) => typeof item === "string" && item.trim());
      if (typeof message === "string") {
        return message.trim();
      }
    }
  }

  return undefined;
}

function readImages(payload: unknown): unknown[] {
  const record = requiredRecord(
    payload,
    "AltText.ai images",
    () => new ProviderRequestError(502, "AltText.ai returned invalid images payload"),
  );
  const images = record.images;
  if (!Array.isArray(images)) {
    throw new ProviderRequestError(502, "AltText.ai response missing images array");
  }
  return images;
}

function readPagination(headers: Headers): Record<string, unknown> {
  return {
    currentPage: readNullableHeaderInteger(headers, "current-page"),
    pageItems: readNullableHeaderInteger(headers, "page-items"),
    totalPages: readNullableHeaderInteger(headers, "total-pages"),
    totalCount: readNullableHeaderInteger(headers, "total-count"),
    link: headers.get("link"),
  };
}

function readNullableHeaderInteger(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
