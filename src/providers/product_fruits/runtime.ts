import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  parseProviderJsonBodyText,
} from "../provider-runtime.ts";

export const productFruitsApiBaseUrl = "https://api.productfruits.com";
const productFruitsValidationPath = "/v1/knowledgebase/categories";

interface ProductFruitsRequestOptions {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  mode: "validate" | "execute";
  query?: Record<string, string | undefined>;
}

type ProductFruitsActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const productFruitsActionHandlers: ProviderActionHandlers<"product_fruits", ProductFruitsActionHandler> = {
  list_knowledge_base_categories(_input, context) {
    return requestProductFruitsJson({
      apiKey: context.apiKey,
      path: productFruitsValidationPath,
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  get_knowledge_base_category(input, context) {
    const correlationId = requiredInputString(input.correlationId, "correlationId");
    return requestProductFruitsJson({
      apiKey: context.apiKey,
      path: `/v1/knowledgebase/categories/${encodeURIComponent(correlationId)}`,
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  list_knowledge_base_articles(input, context) {
    const categoryId = input.correlationCategoryId;
    return requestProductFruitsJson({
      apiKey: context.apiKey,
      path: "/v1/knowledgebase/articles",
      query: {
        correlationCategoryId: categoryId === null ? "null" : optionalString(categoryId),
      },
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  get_knowledge_base_article_content(input, context) {
    const correlationId = requiredInputString(input.correlationId, "correlationId");
    const lang = requiredInputString(input.lang, "lang");
    return requestProductFruitsJson({
      apiKey: context.apiKey,
      path: `/v1/knowledge-base/articles/${encodeURIComponent(correlationId)}/content/${encodeURIComponent(lang)}`,
      query: { format: optionalString(input.format) },
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
};

export async function validateProductFruitsCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestProductFruitsJson({
    apiKey,
    path: productFruitsValidationPath,
    fetcher,
    signal,
    mode: "validate",
  });

  return {
    profile: { accountId: "product_fruits", displayName: "Product Fruits API Key" },
    metadata: {
      apiBaseUrl: productFruitsApiBaseUrl,
      validationEndpoint: productFruitsValidationPath,
    },
  };
}

async function requestProductFruitsJson(input: ProductFruitsRequestOptions) {
  return runProviderRequest({ label: "Product Fruits", signal: input.signal }, async (signal) => {
    const url = new URL(input.path, productFruitsApiBaseUrl);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }

    const response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const text = await response.text();
    const payload = parseProviderJsonBodyText(text, {
      emptyBody: null,
      invalidJsonMessage: "Product Fruits returned invalid JSON",
    });

    if (!response.ok) {
      throw createProductFruitsError(response.status, payload, input.mode);
    }
    return requiredResponseRecord(payload, "Product Fruits response");
  });
}

function createProductFruitsError(status: number, payload: unknown, mode: ProductFruitsRequestOptions["mode"]) {
  const record = optionalRecord(payload) ?? {};
  const message =
    optionalString(record.message) ?? optionalString(record.error) ?? `Product Fruits request failed with ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (mode === "validate" && status === 401 && optionalString(record.error) === "AuthenticationMissing") {
    return providerInputError(message);
  }
  if (mode === "execute" && (status === 400 || status === 404)) {
    return providerInputError(message);
  }
  return new ProviderRequestError(status || 500, message);
}
