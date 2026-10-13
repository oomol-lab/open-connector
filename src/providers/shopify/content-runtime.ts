import type { ShopifyContext, ShopifyActionHandler } from "./context.ts";

import { ProviderRequestError, requiredResponseRecord } from "../provider-runtime.ts";
import { buildShopifyApiBaseUrl, requestShopifyJson } from "./client.ts";

interface ShopifyPagination {
  nextPageInfo: string | null;
  previousPageInfo: string | null;
}

interface ShopifyRestResult {
  payload: unknown;
  pagination: ShopifyPagination;
}

export const contentActionHandlers: Record<string, ShopifyActionHandler> = {
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
    });
    const record = requiredResponseRecord(payload, "Shopify article tags response");
    return {
      tags: requireStringArray(record.tags, "tags"),
    };
  },
  async list_blog_article_tags(input, context) {
    const { payload } = await requestShopifyRest({
      context,
      path: `/blogs/${readId(input, "blog_id")}/articles/tags.json`,
      query: buildArticleTagQuery(input),
    });
    const record = requiredResponseRecord(payload, "Shopify blog article tags response");
    return {
      tags: requireStringArray(record.tags, "tags"),
    };
  },
  async list_article_authors(_input, context) {
    const { payload } = await requestShopifyRest({
      context,
      path: "/articles/authors.json",
    });
    const record = requiredResponseRecord(payload, "Shopify article authors response");
    return {
      authors: requireStringArray(record.authors, "authors"),
    };
  },
};

async function getShopifyResource(context: ShopifyContext, path: string, resultKey: string): Promise<unknown> {
  const { payload } = await requestShopifyRest({
    context,
    path,
  });
  return requiredResponseRecord(requiredResponseRecord(payload, `Shopify ${resultKey} response`)[resultKey], resultKey);
}

async function listShopifyResources(
  input: Record<string, unknown>,
  context: ShopifyContext,
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
  });
  const record = requiredResponseRecord(payload, `Shopify ${options.resultKey} response`);
  return {
    [options.resultKey]: requireRecordArray(record[options.resultKey], options.resultKey),
    pagination,
    raw: record,
  };
}

async function countShopifyResources(
  input: Record<string, unknown>,
  context: ShopifyContext,
  options: {
    path: string;
    queryKeys: readonly string[];
  },
): Promise<Record<string, unknown>> {
  const { payload } = await requestShopifyRest({
    context,
    path: options.path,
    query: pickQuery(input, options.queryKeys),
  });
  const record = requiredResponseRecord(payload, "Shopify count response");
  return {
    count: readCount(record.count),
  };
}

async function requestShopifyRest(input: {
  context: ShopifyContext;
  path: string;
  query?: Record<string, string>;
}): Promise<ShopifyRestResult> {
  const url = new URL(input.path.slice(1), buildShopifyApiBaseUrl(input.context.shopDomain) + "/");
  for (const [key, value] of Object.entries(input.query ?? {})) url.searchParams.set(key, value);
  const { response, payload } = await requestShopifyJson(
    input.context.shopDomain,
    input.context.accessToken,
    url,
    { method: "GET", signal: input.context.signal },
    input.context.fetcher,
  );
  return { payload, pagination: readPagination(response.headers.get("link")) };
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

function requireRecordArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} array is missing`);
  }
  return value.map((item) => requiredResponseRecord(item, fieldName));
}

function requireStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} array is missing`);
  }
  return value.map((item) => String(item));
}
