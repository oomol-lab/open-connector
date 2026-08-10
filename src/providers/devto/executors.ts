import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { DevtoActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "devto";
const devtoApiBaseUrl = "https://dev.to/api";

type QueryValue = string | number | boolean | undefined;
type DevtoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const devtoActionHandlers: Record<DevtoActionName, DevtoActionHandler> = {
  list_articles(input, context) {
    return devtoGet("/articles", mapListArticlesQuery(input), context);
  },
  list_latest_articles(input, context) {
    return devtoGet("/articles/latest", paginationQuery(input), context);
  },
  get_article(input, context) {
    return devtoGet(`/articles/${encodePathSegment(input.articleId)}`, {}, context);
  },
  get_article_by_path(input, context) {
    return devtoGet(`/articles/${encodePathSegment(input.username)}/${encodePathSegment(input.slug)}`, {}, context);
  },
  list_organization_articles(input, context) {
    return devtoGet(
      `/organizations/${encodePathSegment(input.organizationUsername)}/articles`,
      paginationQuery(input),
      context,
    );
  },
  get_organization(input, context) {
    return devtoGet(`/organizations/${encodePathSegment(input.organizationUsername)}`, {}, context);
  },
  list_videos(input, context) {
    return devtoGet("/videos", paginationQuery(input), context);
  },
  list_tags(input, context) {
    return devtoGet("/tags", paginationQuery(input), context);
  },
  get_current_user(_input, context) {
    return devtoGet("/users/me", {}, context);
  },
  list_my_articles(input, context) {
    return devtoGet(mapMyArticlesPath(input.status), paginationQuery(input), context);
  },
  create_article(input, context) {
    return devtoMutate("POST", "/articles", buildArticleBody(input), context);
  },
  update_article(input, context) {
    return devtoMutate("PUT", `/articles/${encodePathSegment(input.articleId)}`, buildArticleBody(input), context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, devtoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ApiKeyProviderContext = { apiKey: input.apiKey, fetcher, signal };
    const payload = optionalRecord(await devtoGet("/users/me", {}, context)) ?? {};
    const accountId = readOptionalId(payload.id) ?? "devto:token";
    const username = optionalString(payload.username);
    const name = optionalString(payload.name);
    return {
      profile: {
        accountId,
        displayName: username ?? name ?? accountId,
      },
      grantedScopes: [],
      metadata: {
        username,
        name,
        type_of: payload.type_of,
        validationEndpoint: "/users/me",
      },
    };
  },
};

function paginationQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    page: optionalNumber(input.page),
    per_page: optionalNumber(input.perPage),
  });
}

function mapMyArticlesPath(status: unknown): string {
  switch (status) {
    case "published":
      return "/articles/me/published";
    case "unpublished":
      return "/articles/me/unpublished";
    case "all":
      return "/articles/me/all";
    case "default":
    default:
      return "/articles/me";
  }
}

function mapListArticlesQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    page: optionalNumber(input.page),
    per_page: optionalNumber(input.perPage),
    tag: optionalString(input.tag),
    tags: normalizeTags(input.tags),
    tags_exclude: normalizeTags(input.tagsExclude),
    username: optionalString(input.username),
    state: optionalString(input.state),
    top: optionalNumber(input.top),
    collection_id: optionalNumber(input.collectionId),
  });
}

function buildArticleBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    article: compactObject({
      title: optionalString(input.title),
      body_markdown: optionalString(input.bodyMarkdown),
      published: optionalBoolean(input.published),
      series: nullableString(input.series),
      main_image: nullableString(input.mainImage),
      canonical_url: nullableString(input.canonicalUrl),
      description: optionalString(input.description),
      tags: normalizeTags(input.tags),
      organization_id: nullableFiniteNumber(input.organizationId),
    }),
  };
}

async function devtoGet(
  path: string,
  query: Record<string, QueryValue>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const response = await context.fetcher(buildUrl(path, query), {
    method: "GET",
    headers: devtoHeaders(context.apiKey),
    signal: context.signal,
  });
  return readDevtoResponse(response);
}

async function devtoMutate(
  method: "POST" | "PUT",
  path: string,
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const response = await context.fetcher(`${devtoApiBaseUrl}${path}`, {
    method,
    headers: devtoHeaders(context.apiKey),
    body: JSON.stringify(body),
    signal: context.signal,
  });
  return readDevtoResponse(response);
}

async function readDevtoResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    const message = readErrorMessage(text) ?? `devto request failed with ${response.status}`;
    if (response.status === 401 || response.status === 403) {
      throw new ProviderRequestError(response.status, message);
    }
    if (response.status === 400 || response.status === 404 || response.status === 422) {
      throw new ProviderRequestError(400, message);
    }
    if (response.status === 429) {
      throw new ProviderRequestError(429, message);
    }
    throw new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
  }
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, `devto returned invalid JSON with ${response.status}: ${text.slice(0, 200)}`);
  }
}

function devtoHeaders(apiKey: string): Record<string, string> {
  return {
    "api-key": apiKey,
    accept: "application/vnd.forem.api-v1+json",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

function buildUrl(path: string, query: Record<string, QueryValue>): string {
  const url = new URL(`${devtoApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function normalizeTags(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(",");
  }
  return typeof value === "string" ? value : undefined;
}

function nullableString(value: unknown): string | null | undefined {
  return value === null ? null : optionalString(value);
}

function nullableFiniteNumber(value: unknown): number | null | undefined {
  return value === null ? null : optionalNumber(value);
}

function readOptionalId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }
  return optionalString(value);
}

function readErrorMessage(text: string): string | undefined {
  if (!text) {
    return undefined;
  }
  try {
    const payload = optionalRecord(JSON.parse(text));
    return optionalString(payload?.error) ?? optionalString(payload?.message);
  } catch {
    return text;
  }
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://dev.to/api",
  auth: { type: "api_key_header", name: "api-key" },
});
