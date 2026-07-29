import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { ShopifyActionName } from "./actions.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const shopifyRestApiVersion = "2026-04";

const credentialHelpUrl = "https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens";
const shopifyContentScope = "content";
const shopPath = "/shop.json";
const contentValidationPath = "/blogs/count.json";

type ShopifyRequestPhase = "validate" | "execute";
type ShopifyActionHandler = ProviderRuntimeHandler<ShopifyActionContext>;

interface ShopifyPagination {
  nextPageInfo: string | null;
  previousPageInfo: string | null;
}

interface ShopifyRestResult {
  payload: unknown;
  pagination: ShopifyPagination;
}

export interface ShopifyActionContext extends ApiKeyProviderContext {
  shopDomain: string;
}

export const shopifyActionHandlers: Record<ShopifyActionName, ShopifyActionHandler> = {
  async get_shop(_input, context) {
    return {
      shop: await getShopifyResource(context, shopPath, "shop"),
    };
  },
  list_blogs(input, context) {
    return listShopifyResources(input, context, {
      path: "/blogs.json",
      resultKey: "blogs",
      queryKeys: ["handle", "since_id", "limit", "page_info"],
    });
  },
  async get_blog(input, context) {
    return {
      blog: await getShopifyResource(context, `/blogs/${readId(input, "blog_id")}.json`, "blog"),
    };
  },
  count_blogs(input, context) {
    return countShopifyResources(input, context, {
      path: "/blogs/count.json",
      queryKeys: [],
    });
  },
  list_pages(input, context) {
    return listShopifyResources(input, context, {
      path: "/pages.json",
      resultKey: "pages",
      queryKeys: [
        "title",
        "handle",
        "published_status",
        "since_id",
        "created_at_min",
        "created_at_max",
        "updated_at_min",
        "updated_at_max",
        "published_at_min",
        "published_at_max",
        "limit",
        "page_info",
      ],
    });
  },
  async get_page(input, context) {
    return {
      page: await getShopifyResource(context, `/pages/${readId(input, "page_id")}.json`, "page"),
    };
  },
  count_pages(input, context) {
    return countShopifyResources(input, context, {
      path: "/pages/count.json",
      queryKeys: [
        "title",
        "published_status",
        "created_at_min",
        "created_at_max",
        "updated_at_min",
        "updated_at_max",
        "published_at_min",
        "published_at_max",
      ],
    });
  },
  list_articles(input, context) {
    return listShopifyResources(input, context, {
      path: `/blogs/${readId(input, "blog_id")}/articles.json`,
      resultKey: "articles",
      queryKeys: [
        "author",
        "handle",
        "tag",
        "published_status",
        "since_id",
        "created_at_min",
        "created_at_max",
        "updated_at_min",
        "updated_at_max",
        "published_at_min",
        "published_at_max",
        "limit",
        "page_info",
      ],
    });
  },
  async get_article(input, context) {
    return {
      article: await getShopifyResource(
        context,
        `/blogs/${readId(input, "blog_id")}/articles/${readId(input, "article_id")}.json`,
        "article",
      ),
    };
  },
  count_articles(input, context) {
    return countShopifyResources(input, context, {
      path: `/blogs/${readId(input, "blog_id")}/articles/count.json`,
      queryKeys: [
        "published_status",
        "created_at_min",
        "created_at_max",
        "updated_at_min",
        "updated_at_max",
        "published_at_min",
        "published_at_max",
      ],
    });
  },
  async list_article_tags(input, context) {
    const { payload } = await requestShopifyRest({
      context,
      path: "/articles/tags.json",
      query: buildArticleTagQuery(input),
      phase: "execute",
    });
    const record = requireRecord(payload, "Shopify article tags response");
    return {
      tags: requireStringArray(record.tags, "tags"),
    };
  },
  async list_blog_article_tags(input, context) {
    const { payload } = await requestShopifyRest({
      context,
      path: `/blogs/${readId(input, "blog_id")}/articles/tags.json`,
      query: buildArticleTagQuery(input),
      phase: "execute",
    });
    const record = requireRecord(payload, "Shopify blog article tags response");
    return {
      tags: requireStringArray(record.tags, "tags"),
    };
  },
  async list_article_authors(_input, context) {
    const { payload } = await requestShopifyRest({
      context,
      path: "/articles/authors.json",
      phase: "execute",
    });
    const record = requireRecord(payload, "Shopify article authors response");
    return {
      authors: requireStringArray(record.authors, "authors"),
    };
  },
};

export async function validateShopifyCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const shopDomain = normalizeShopDomain(optionalString(input.values.shopDomain));
  const context: ShopifyActionContext = {
    apiKey: input.apiKey,
    shopDomain,
    fetcher,
    signal,
  };
  const shopResult = await requestShopifyRest({
    context,
    path: shopPath,
    phase: "validate",
  });
  const shop = requireRecord(requireRecord(shopResult.payload, "Shopify shop response").shop, "shop");
  await requestShopifyRest({
    context,
    path: contentValidationPath,
    phase: "validate",
  });

  return {
    profile: {
      accountId: `shopify:${shopDomain}`,
      displayName: optionalString(shop.name) ?? shopDomain,
    },
    grantedScopes: [shopifyContentScope],
    metadata: compactObject({
      shopDomain,
      apiBaseUrl: buildShopifyRestApiBaseUrl(shopDomain),
      restApiVersion: shopifyRestApiVersion,
      credentialHelpUrl,
      validationEndpoint: shopPath,
      contentScopeValidationEndpoint: contentValidationPath,
      shopId: optionalNumber(shop.id),
      myshopifyDomain: optionalString(shop.myshopify_domain),
    }),
  };
}

async function getShopifyResource(context: ShopifyActionContext, path: string, resultKey: string): Promise<unknown> {
  const { payload } = await requestShopifyRest({
    context,
    path,
    phase: "execute",
  });
  return requireRecord(requireRecord(payload, `Shopify ${resultKey} response`)[resultKey], resultKey);
}

async function listShopifyResources(
  input: Record<string, unknown>,
  context: ShopifyActionContext,
  options: {
    path: string;
    resultKey: string;
    queryKeys: readonly string[];
  },
): Promise<Record<string, unknown>> {
  assertPageInfoFilterBoundary(input);
  const { payload, pagination } = await requestShopifyRest({
    context,
    path: options.path,
    query: pickQuery(input, options.queryKeys),
    phase: "execute",
  });
  const record = requireRecord(payload, `Shopify ${options.resultKey} response`);
  return {
    [options.resultKey]: requireRecordArray(record[options.resultKey], options.resultKey),
    pagination,
    raw: record,
  };
}

async function countShopifyResources(
  input: Record<string, unknown>,
  context: ShopifyActionContext,
  options: {
    path: string;
    queryKeys: readonly string[];
  },
): Promise<Record<string, unknown>> {
  const { payload } = await requestShopifyRest({
    context,
    path: options.path,
    query: pickQuery(input, options.queryKeys),
    phase: "execute",
  });
  const record = requireRecord(payload, "Shopify count response");
  return {
    count: readCount(record.count),
  };
}

async function requestShopifyRest(input: {
  context: ShopifyActionContext;
  path: string;
  query?: Record<string, string>;
  phase: ShopifyRequestPhase;
}): Promise<ShopifyRestResult> {
  const url = buildShopifyRestUrl(input.context.shopDomain, input.path, input.query);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-shopify-access-token": input.context.apiKey,
      },
      signal: input.context.signal,
    });
    payload = await readShopifyPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Shopify REST request failed: ${error.message}` : "Shopify REST request failed",
    );
  }

  if (!response.ok) {
    throw createShopifyRestError(response, payload, input.phase);
  }

  return {
    payload,
    pagination: readPagination(response.headers.get("link")),
  };
}

export function buildShopifyRestApiBaseUrl(shopDomain: string): string {
  return `https://${shopDomain}/admin/api/${shopifyRestApiVersion}`;
}

function buildShopifyRestUrl(shopDomain: string, path: string, query?: Record<string, string>): URL {
  const url = assertPublicHttpUrl(
    new URL(path.startsWith("/") ? path.slice(1) : path, `${buildShopifyRestApiBaseUrl(shopDomain)}/`).toString(),
    {
      fieldName: "shopDomain",
      createError: (message) => new ProviderRequestError(400, message),
    },
  );
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

export function normalizeShopDomain(value: string | undefined): string {
  if (!value) {
    throw new ProviderRequestError(400, "shopDomain is required");
  }

  const trimmed = value.trim();
  let host = trimmed;
  if (trimmed.includes("://")) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new ProviderRequestError(400, "shopDomain must be a myshopify.com domain or URL");
    }
    host = url.hostname;
  } else {
    host = trimmed.split("/")[0] ?? "";
  }

  const normalized = host.toLowerCase();
  if (!isMyshopifyDomain(normalized)) {
    throw new ProviderRequestError(400, "shopDomain must be a myshopify.com domain or URL");
  }
  return normalized;
}

function isMyshopifyDomain(host: string): boolean {
  if (!host.endsWith(".myshopify.com") || host.length <= ".myshopify.com".length) {
    return false;
  }
  return host
    .slice(0, -".myshopify.com".length)
    .split(".")
    .every((segment) => isDnsLabel(segment));
}

function isDnsLabel(value: string): boolean {
  if (!value || value.startsWith("-") || value.endsWith("-") || value.length > 63) {
    return false;
  }
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isLowercaseLetter = code >= 97 && code <= 122;
    if (!isDigit && !isLowercaseLetter && char !== "-") {
      return false;
    }
  }
  return true;
}

async function readShopifyPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Shopify REST returned invalid JSON", text);
    }
    return text;
  }
}

function createShopifyRestError(
  response: Response,
  payload: unknown,
  phase: ShopifyRequestPhase,
): ProviderRequestError {
  const detail = extractShopifyErrorMessage(payload);
  const message = detail
    ? `Shopify REST request failed with HTTP ${response.status}: ${detail}`
    : `Shopify REST request failed with HTTP ${response.status}`;
  if (phase === "validate" && isCredentialValidationStatus(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function isCredentialValidationStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}

function extractShopifyErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const errors = record.errors;
  if (typeof errors === "string") {
    return errors;
  }
  if (Array.isArray(errors)) {
    return errors.map((item) => String(item)).join("; ");
  }
  if (optionalRecord(errors)) {
    return Object.entries(errors as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
      .join("; ");
  }
  return optionalString(record.error) ?? optionalString(record.message);
}

function pickQuery(input: Record<string, unknown>, keys: readonly string[]): Record<string, string> {
  const query: Record<string, string> = {};
  for (const key of keys) {
    const value = readQueryValue(input[key]);
    if (value !== undefined) {
      query[key] = value;
    }
  }
  return query;
}

function readQueryValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return String(value);
  }
  return undefined;
}

function buildArticleTagQuery(input: Record<string, unknown>): Record<string, string> {
  const query: Record<string, string> = {};
  const limit = readQueryValue(input.limit);
  if (limit !== undefined) {
    query.limit = limit;
  }
  if (input.popular === true) {
    query.popular = "1";
  }
  return query;
}

function assertPageInfoFilterBoundary(input: Record<string, unknown>): void {
  if (input.page_info === undefined) {
    return;
  }
  for (const key of Object.keys(input)) {
    if (key !== "page_info" && key !== "limit" && key !== "blog_id") {
      throw new ProviderRequestError(400, "page_info cannot be combined with other filters; only limit is allowed");
    }
  }
}

function readPagination(linkHeader: string | null): ShopifyPagination {
  return {
    nextPageInfo: readPageInfoForRel(linkHeader, "next"),
    previousPageInfo: readPageInfoForRel(linkHeader, "previous"),
  };
}

function readPageInfoForRel(linkHeader: string | null, rel: "next" | "previous"): string | null {
  if (!linkHeader) {
    return null;
  }
  for (const item of linkHeader.split(",")) {
    const [urlPart, ...parameterParts] = item.trim().split(";");
    if (!urlPart?.startsWith("<") || !urlPart.endsWith(">")) {
      continue;
    }
    const hasRel = parameterParts.some((part) => {
      const normalized = part.trim().toLowerCase();
      return normalized === `rel="${rel}"` || normalized === `rel=${rel}`;
    });
    if (!hasRel) {
      continue;
    }
    try {
      return new URL(urlPart.slice(1, -1)).searchParams.get("page_info");
    } catch {
      return null;
    }
  }
  return null;
}

function readId(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProviderRequestError(400, `${key} must be a positive integer`);
  }
  return String(value);
}

function readCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ProviderRequestError(502, "Shopify count response is invalid");
  }
  return value;
}

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return record;
}

function requireRecordArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} array is missing`);
  }
  return value.map((item) => requireRecord(item, fieldName));
}

function requireStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} array is missing`);
  }
  return value.map((item) => String(item));
}
