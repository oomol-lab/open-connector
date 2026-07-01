import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ForemActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { foremArticleMutableKeys } from "./actions.ts";

const service = "forem";
const foremDefaultBaseUrl = "https://dev.to";
const foremApiPathPrefix = "/api";
const foremDefaultRequestTimeoutMs = 30_000;

type ForemPhase = "validate" | "execute";
type ForemMethod = "GET" | "POST" | "PUT";
type ForemActionHandler = (input: Record<string, unknown>, context: ForemActionContext) => Promise<unknown>;

interface ForemActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface ForemRequestInput {
  path: string;
  phase: ForemPhase;
  method?: ForemMethod;
  query?: URLSearchParams;
  body?: Record<string, unknown>;
}

export const foremActionHandlers: Record<ForemActionName, ForemActionHandler> = {
  async get_current_user(_input, context) {
    const raw = await requestForemJson<Record<string, unknown>>(context, {
      path: "/users/me",
      phase: "execute",
    });

    return {
      user: raw,
      raw,
    };
  },

  async list_articles(input, context) {
    const raw = await requestForemJson<unknown[]>(context, {
      path: "/articles",
      query: buildForemQuery(input, {
        integerMap: {
          page: "page",
          perPage: "per_page",
          top: "top",
          collectionId: "collection_id",
        },
        stringMap: {
          tag: "tag",
          username: "username",
          state: "state",
        },
        tagListMap: {
          tags: "tags",
          tagsExclude: "tags_exclude",
        },
      }),
      phase: "execute",
    });

    return {
      articles: raw,
      raw,
    };
  },

  async list_my_articles(input, context) {
    const raw = await requestForemJson<unknown[]>(context, {
      path: myArticlesPath(input.scope),
      query: buildPaginationQuery(input),
      phase: "execute",
    });

    return {
      articles: raw,
      raw,
    };
  },

  async get_article(input, context) {
    const raw = await requestForemJson<Record<string, unknown>>(context, {
      path: `/articles/${readRequiredPositiveInteger(input.articleId, "articleId")}`,
      phase: "execute",
    });

    return {
      article: raw,
      raw,
    };
  },

  async get_article_by_path(input, context) {
    const raw = await requestForemJson<Record<string, unknown>>(context, {
      path: `/articles/${encodeURIComponent(readRequiredString(input.username, "username"))}/${encodeURIComponent(
        readRequiredString(input.slug, "slug"),
      )}`,
      phase: "execute",
    });

    return {
      article: raw,
      raw,
    };
  },

  async create_article(input, context) {
    const raw = await requestForemJson<Record<string, unknown>>(context, {
      method: "POST",
      path: "/articles",
      body: buildArticleRequestBody(input),
      phase: "execute",
    });

    return {
      article: raw,
      raw,
    };
  },

  async update_article(input, context) {
    assertMutableArticleFieldPresent(input);
    const raw = await requestForemJson<Record<string, unknown>>(context, {
      method: "PUT",
      path: `/articles/${readRequiredPositiveInteger(input.articleId, "articleId")}`,
      body: buildArticleRequestBody(input),
      phase: "execute",
    });

    return {
      article: raw,
      raw,
    };
  },

  async list_comments(input, context) {
    assertCommentTarget(input);
    const raw = await requestForemJson<unknown[]>(context, {
      path: "/comments",
      query: buildForemQuery(input, {
        integerMap: {
          articleId: "a_id",
          podcastEpisodeId: "p_id",
          page: "page",
          perPage: "per_page",
        },
      }),
      phase: "execute",
    });

    return {
      comments: raw,
      raw,
    };
  },

  async get_comment(input, context) {
    const raw = await requestForemJson<Record<string, unknown>>(context, {
      path: `/comments/${readRequiredPositiveInteger(input.commentId, "commentId")}`,
      phase: "execute",
    });

    return {
      comment: raw,
      raw,
    };
  },

  async list_tags(input, context) {
    const raw = await requestForemJson<unknown[]>(context, {
      path: "/tags",
      query: buildForemQuery(input, {
        integerMap: {
          page: "page",
          perPage: "per_page",
        },
      }),
      phase: "execute",
    });

    return {
      tags: raw,
      raw,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ForemActionContext>({
  service,
  handlers: foremActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ForemActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: normalizeForemBaseUrl(credential.metadata.baseUrl ?? credential.values.baseUrl),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const baseUrl = normalizeForemBaseUrl(input.values.baseUrl);
    const raw = await requestForemJson<Record<string, unknown>>(
      {
        apiKey: input.apiKey,
        baseUrl,
        fetcher,
        signal,
      },
      {
        path: "/users/me",
        phase: "validate",
      },
    );
    const userId = readOptionalNumber(raw.id);
    const username = optionalString(raw.username);
    const email = optionalString(raw.email);
    const name = optionalString(raw.name);

    return {
      profile: {
        accountId: userId === undefined ? "api_key" : `forem:${baseUrl}:${userId}`,
        displayName: email ?? username ?? name ?? "Forem API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        baseUrl,
        apiBaseUrl: buildForemApiBaseUrl(baseUrl),
        validationEndpoint: "/api/users/me",
        userId,
        username,
        email,
        name,
      }),
    };
  },
};

async function requestForemJson<T>(context: ForemActionContext, input: ForemRequestInput): Promise<T> {
  const url = new URL(`${foremApiPathPrefix}${input.path}`, `${context.baseUrl}/`);
  if (input.query) {
    for (const [key, value] of input.query.entries()) {
      url.searchParams.append(key, value);
    }
  }

  const body = input.body ? JSON.stringify(input.body) : undefined;
  const timeoutSignal = AbortSignal.timeout(foremDefaultRequestTimeoutMs);
  const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers: buildForemHeaders(context.apiKey, body !== undefined),
      body,
      signal,
    });
    const payload = await readForemPayload(response);
    if (!response.ok) {
      throw createForemError(response.status, payload, input.phase);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && isAbortError(error)) {
      throw new ProviderRequestError(504, "Forem request timed out", error);
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Forem ${input.phase} request failed: ${error.message}` : "Forem request failed",
      error,
    );
  }
}

function buildForemHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/vnd.forem.api-v1+json",
    "api-key": apiKey,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readForemPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Forem response body is not valid JSON");
  }
}

function createForemError(status: number, payload: unknown, phase: ForemPhase): ProviderRequestError {
  const message = extractForemErrorMessage(payload) ?? `Forem ${phase} request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractForemErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const value of [record.error, record.message, record.detail]) {
    const message = optionalString(value);
    if (message) {
      return message;
    }
  }

  const errors = Array.isArray(record.errors) ? record.errors : undefined;
  const firstError = optionalRecord(errors?.[0]);
  return optionalString(firstError?.message);
}

function buildPaginationQuery(input: Record<string, unknown>): URLSearchParams {
  return buildForemQuery(input, {
    integerMap: {
      page: "page",
      perPage: "per_page",
    },
  });
}

function buildForemQuery(
  input: Record<string, unknown>,
  options: {
    integerMap?: Record<string, string>;
    stringMap?: Record<string, string>;
    tagListMap?: Record<string, string>;
  },
): URLSearchParams {
  const query = new URLSearchParams();
  for (const [inputKey, queryKey] of Object.entries(options.integerMap ?? {})) {
    appendOptionalValue(query, queryKey, input[inputKey]);
  }
  for (const [inputKey, queryKey] of Object.entries(options.stringMap ?? {})) {
    appendOptionalValue(query, queryKey, readOptionalTrimmedString(input[inputKey]));
  }
  for (const [inputKey, queryKey] of Object.entries(options.tagListMap ?? {})) {
    const tags = readOptionalStringList(input[inputKey]);
    appendOptionalValue(query, queryKey, tags ? tags.join(",") : undefined);
  }
  return query;
}

function appendOptionalValue(query: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  query.append(key, String(value));
}

function myArticlesPath(scope: unknown): string {
  switch (scope) {
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

function buildArticleRequestBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    article: compactObject({
      title: readOptionalTrimmedString(input.title),
      body_markdown: readOptionalString(input.bodyMarkdown),
      published: typeof input.published === "boolean" ? input.published : undefined,
      series: readOptionalNullableString(input.series),
      main_image: readOptionalNullableString(input.mainImage),
      canonical_url: readOptionalNullableString(input.canonicalUrl),
      description: readOptionalString(input.description),
      tags: readOptionalStringList(input.tags)?.join(", "),
      organization_id:
        input.organizationId === null ? null : readOptionalPositiveInteger(input.organizationId, "organizationId"),
    }),
  };
}

function normalizeForemBaseUrl(value: unknown): string {
  const raw = optionalString(value) || foremDefaultBaseUrl;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ProviderRequestError(400, "Forem baseUrl must be a valid URL");
  }

  if (parsed.protocol !== "https:") {
    throw new ProviderRequestError(400, "Forem baseUrl must use https");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new ProviderRequestError(400, "Forem baseUrl must not include credentials, query, or hash");
  }

  parsed.pathname = "";
  const normalized = parsed.toString();
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function buildForemApiBaseUrl(baseUrl: string): string {
  return `${baseUrl}${foremApiPathPrefix}`;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  const raw = readOptionalString(value);
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

function readOptionalNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return readOptionalString(value);
}

function readRequiredString(value: unknown, fieldName: string): string {
  const trimmed = readOptionalTrimmedString(value);
  if (!trimmed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return trimmed;
}

function readOptionalStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function readRequiredPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return readRequiredPositiveInteger(value, fieldName);
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function assertMutableArticleFieldPresent(input: Record<string, unknown>): void {
  if (!foremArticleMutableKeys.some((key) => key in input)) {
    throw new ProviderRequestError(400, "at least one article field is required");
  }
}

function assertCommentTarget(input: Record<string, unknown>): void {
  const hasArticleId = "articleId" in input;
  const hasPodcastEpisodeId = "podcastEpisodeId" in input;
  if (hasArticleId === hasPodcastEpisodeId) {
    throw new ProviderRequestError(400, "exactly one of articleId or podcastEpisodeId is required");
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
