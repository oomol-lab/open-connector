import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { DiscourseActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalBoolean, optionalInteger, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

export const discourseDefaultRequestTimeoutMs = 30_000;

type DiscourseHttpMethod = "GET" | "POST";
type DiscoursePhase = "validate" | "execute";
type DiscourseQueryValue = string | number | boolean | undefined;

interface DiscourseCredential {
  baseUrl: string;
  apiKey: string;
  apiUsername: string;
}

interface DiscourseActionContext {
  credential: DiscourseCredential;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type DiscourseActionHandler = (input: Record<string, unknown>, context: DiscourseActionContext) => Promise<unknown>;

export const discourseActionHandlers: Record<DiscourseActionName, DiscourseActionHandler> = {
  async list_latest_topics(input: Record<string, unknown>, context: DiscourseActionContext): Promise<unknown> {
    const payload = await requestDiscourseJson({
      credential: context.credential,
      path: "/latest.json",
      method: "GET",
      query: compactObject({
        order: optionalString(input.order),
        ascending: optionalBoolean(input.ascending) === true ? true : undefined,
        per_page: optionalInteger(input.perPage),
      }),
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });

    return normalizeTopicListPayload(payload);
  },

  async list_categories(input: Record<string, unknown>, context: DiscourseActionContext): Promise<unknown> {
    const payload = await requestDiscourseJson({
      credential: context.credential,
      path: "/categories.json",
      method: "GET",
      query: compactObject({
        include_subcategories: optionalBoolean(input.includeSubcategories) === true ? true : undefined,
      }),
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });

    const record = requirePayloadObject(payload, "Discourse category list response");
    const categoryList = requirePayloadObject(record.category_list, "Discourse category_list response");

    return {
      categories: readPayloadObjectArray(categoryList.categories, "Discourse categories").map(normalizeCategorySummary),
      raw: record,
    };
  },

  async list_category_topics(input: Record<string, unknown>, context: DiscourseActionContext): Promise<unknown> {
    const slug = requireInputString(input.slug, "slug");
    const categoryId = requireInputPositiveInteger(input.categoryId, "categoryId");
    const payload = await requestDiscourseJson({
      credential: context.credential,
      path: `/c/${encodeURIComponent(slug)}/${categoryId}.json`,
      method: "GET",
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
      notFoundAsInvalidInput: true,
    });

    return normalizeTopicListPayload(payload);
  },

  async get_topic(input: Record<string, unknown>, context: DiscourseActionContext): Promise<unknown> {
    const topicId = requireInputPositiveInteger(input.topicId, "topicId");
    const payload = await requestDiscourseJson({
      credential: context.credential,
      path: `/t/${topicId}.json`,
      method: "GET",
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
      notFoundAsInvalidInput: true,
    });

    return {
      topic: normalizeTopicDetail(payload),
    };
  },

  async search(input: Record<string, unknown>, context: DiscourseActionContext): Promise<unknown> {
    const payload = await requestDiscourseJson({
      credential: context.credential,
      path: "/search.json",
      method: "GET",
      query: compactObject({
        q: requireInputString(input.query, "query"),
        page: optionalInteger(input.page),
      }),
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });

    const record = requirePayloadObject(payload, "Discourse search response");
    return {
      posts: readOptionalPayloadObjectArray(record.posts).map(normalizePostSummary),
      topics: readOptionalPayloadObjectArray(record.topics).map(normalizeTopicSummary),
      users: readOptionalPayloadObjectArray(record.users).map(normalizeUserSummary),
      categories: readOptionalPayloadObjectArray(record.categories).map(normalizeCategorySummary),
      groupedSearchResult: readOptionalPayloadObject(record.grouped_search_result) ?? {},
      raw: record,
    };
  },

  async create_topic(input: Record<string, unknown>, context: DiscourseActionContext): Promise<unknown> {
    const payload = await requestDiscourseJson({
      credential: context.credential,
      path: "/posts.json",
      method: "POST",
      body: compactObject({
        title: requireInputString(input.title, "title"),
        raw: requireInputRaw(input.raw),
        category: optionalInteger(input.categoryId),
        embed_url: optionalString(input.embedUrl),
        external_id: optionalString(input.externalId),
        auto_track: optionalBoolean(input.autoTrack),
        created_at: optionalString(input.createdAt),
      }),
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });

    return normalizeCreatedPostPayload(payload);
  },

  async create_post(input: Record<string, unknown>, context: DiscourseActionContext): Promise<unknown> {
    const payload = await requestDiscourseJson({
      credential: context.credential,
      path: "/posts.json",
      method: "POST",
      body: compactObject({
        topic_id: requireInputPositiveInteger(input.topicId, "topicId"),
        raw: requireInputRaw(input.raw),
        reply_to_post_number: optionalInteger(input.replyToPostNumber),
        created_at: optionalString(input.createdAt),
      }),
      phase: "execute",
      fetcher: context.fetcher,
      signal: context.signal,
    });

    return normalizeCreatedPostPayload(payload);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<DiscourseActionContext>({
  service: "discourse",
  handlers: discourseActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<DiscourseActionContext> {
    const credential = await requireApiKeyCredential(context, "discourse");
    return {
      credential: {
        baseUrl: normalizeDiscourseBaseUrl(credential.values.baseUrl ?? credential.metadata.baseUrl),
        apiKey: credential.apiKey,
        apiUsername: requireCredentialField(
          credential.values.apiUsername ?? credential.metadata.apiUsername,
          "apiUsername",
        ),
      },
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, "discourse");
    const discourseCredential: DiscourseCredential = {
      baseUrl: normalizeDiscourseBaseUrl(credential.values.baseUrl ?? credential.metadata.baseUrl),
      apiKey: credential.apiKey,
      apiUsername: requireCredentialField(
        credential.values.apiUsername ?? credential.metadata.apiUsername,
        "apiUsername",
      ),
    };
    const url = createProviderProxyUrl(discourseCredential.baseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("api-key", discourseCredential.apiKey);
    headers.set("api-username", discourseCredential.apiUsername);
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateDiscourseCredential(
      {
        ...input.values,
        apiKey: input.apiKey,
      },
      fetcher,
      signal,
    );
  },
};

async function validateDiscourseCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credential = resolveCredentialInput(input);
  const validationPath = `/u/${encodeURIComponent(credential.apiUsername)}.json`;
  const payload = await requestDiscourseJson({
    credential,
    path: validationPath,
    method: "GET",
    phase: "validate",
    fetcher,
    signal,
    notFoundAsInvalidInput: true,
  });
  const user = normalizeValidationUser(payload);
  const host = new URL(credential.baseUrl).host;
  const username = user.username ?? credential.apiUsername;
  const labelName = user.name ? `${user.name} (${username})` : username;

  return {
    profile: {
      accountId: `discourse:${hashValue(`${host}:${username}`).slice(0, 16)}`,
      displayName: `${labelName} @ ${host}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      baseUrl: credential.baseUrl,
      apiUsername: username,
      validationEndpoint: validationPath,
      userId: user.id ?? undefined,
      name: user.name ?? undefined,
    }),
  };
}

export function normalizeDiscourseBaseUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, "baseUrl is required");
  }

  let url: URL;
  try {
    url = assertPublicHttpUrl(value.trim(), {
      fieldName: "baseUrl",
      createError: (message) => new ProviderRequestError(400, message),
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(400, "baseUrl must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must use https");
  }

  if (url.username || url.password) {
    throw new ProviderRequestError(400, "baseUrl must not include credentials");
  }

  return url.origin;
}

function resolveCredentialInput(input: Record<string, string>): DiscourseCredential {
  return {
    baseUrl: normalizeDiscourseBaseUrl(input.baseUrl),
    apiKey: requireCredentialField(input.apiKey, "apiKey"),
    apiUsername: requireCredentialField(input.apiUsername, "apiUsername"),
  };
}

async function requestDiscourseJson(input: {
  credential: DiscourseCredential;
  path: string;
  method: DiscourseHttpMethod;
  query?: Record<string, DiscourseQueryValue>;
  body?: Record<string, unknown>;
  phase: DiscoursePhase;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  notFoundAsInvalidInput?: boolean;
}) {
  const timeout = createProviderTimeout(input.signal, discourseDefaultRequestTimeoutMs);

  try {
    const response = await input.fetcher(buildDiscourseUrl(input.credential.baseUrl, input.path, input.query), {
      method: input.method,
      headers: buildDiscourseHeaders(input.credential, input.body !== undefined),
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
      signal: timeout.signal,
    });
    const payload = await readDiscoursePayload(response);
    if (!response.ok) {
      throw mapDiscourseHttpError({
        status: response.status,
        payload,
        phase: input.phase,
        notFoundAsInvalidInput: input.notFoundAsInvalidInput,
      });
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout()) {
      throw new ProviderRequestError(
        504,
        `Discourse ${input.path} request timed out after ${Math.ceil(discourseDefaultRequestTimeoutMs / 1000)} seconds`,
      );
    }

    const message = error instanceof Error && error.message.trim() ? error.message : "request failed";
    throw new ProviderRequestError(502, `Discourse ${input.path} request failed: ${message}`);
  } finally {
    timeout.cleanup();
  }
}

function buildDiscourseUrl(baseUrl: string, path: string, query?: Record<string, DiscourseQueryValue>) {
  const url = new URL(path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildDiscourseHeaders(credential: DiscourseCredential, hasBody: boolean) {
  const headers = new Headers({
    accept: "application/json",
    "api-key": credential.apiKey,
    "api-username": credential.apiUsername,
    "user-agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readDiscoursePayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Discourse returned invalid JSON");
    }
    return text;
  }
}

function mapDiscourseHttpError(input: {
  status: number;
  payload: unknown;
  phase: DiscoursePhase;
  notFoundAsInvalidInput?: boolean;
}) {
  const message = readDiscourseErrorMessage(input.payload) ?? `Discourse request failed with status ${input.status}`;

  if (input.status === 401 || input.status === 403) {
    return new ProviderRequestError(input.phase === "validate" ? 400 : 401, message);
  }

  if (input.status === 404 && input.notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message);
  }

  if (input.status === 400 || input.status === 422) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(input.status >= 500 ? 502 : input.status || 502, message);
}

function readDiscourseErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = readOptionalPayloadObject(payload);
  if (!record) {
    return undefined;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    const message = errors
      .map((item) => String(item))
      .join("; ")
      .trim();
    if (message) {
      return message;
    }
  }

  for (const key of ["error", "message", "error_type"] as const) {
    const value = optionalString(record[key]);
    if (value?.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function normalizeTopicListPayload(payload: unknown) {
  const record = requirePayloadObject(payload, "Discourse topic list response");
  const topicList = requirePayloadObject(record.topic_list, "Discourse topic_list response");
  return {
    canCreateTopic: toNullableBoolean(topicList.can_create_topic),
    perPage: toNullableInteger(topicList.per_page),
    moreTopicsUrl: toNullableString(topicList.more_topics_url),
    topics: readPayloadObjectArray(topicList.topics, "Discourse topics").map(normalizeTopicSummary),
    users: readOptionalPayloadObjectArray(record.users).map(normalizeUserSummary),
    raw: record,
  };
}

function normalizeTopicSummary(value: unknown) {
  const record = requirePayloadObject(value, "Discourse topic");
  return {
    id: requirePayloadInteger(record.id, "Discourse topic id"),
    title: requirePayloadString(record.title, "Discourse topic title"),
    fancyTitle: toNullableString(record.fancy_title),
    slug: toNullableString(record.slug),
    postsCount: toNullableInteger(record.posts_count),
    replyCount: toNullableInteger(record.reply_count),
    highestPostNumber: toNullableInteger(record.highest_post_number),
    createdAt: toNullableString(record.created_at),
    lastPostedAt: toNullableString(record.last_posted_at),
    bumpedAt: toNullableString(record.bumped_at),
    categoryId: toNullableInteger(record.category_id),
    views: toNullableInteger(record.views),
    likeCount: toNullableInteger(record.like_count),
    pinned: toNullableBoolean(record.pinned),
    closed: toNullableBoolean(record.closed),
    archived: toNullableBoolean(record.archived),
    visible: toNullableBoolean(record.visible),
    lastPosterUsername: toNullableString(record.last_poster_username),
    raw: record,
  };
}

function normalizeCategorySummary(value: unknown) {
  const record = requirePayloadObject(value, "Discourse category");
  return {
    id: requirePayloadInteger(record.id, "Discourse category id"),
    name: requirePayloadString(record.name, "Discourse category name"),
    slug: toNullableString(record.slug),
    color: toNullableString(record.color),
    textColor: toNullableString(record.text_color),
    description: toNullableString(record.description_text ?? record.description),
    topicCount: toNullableInteger(record.topic_count),
    postCount: toNullableInteger(record.post_count),
    position: toNullableInteger(record.position),
    parentCategoryId: toNullableInteger(record.parent_category_id),
    readRestricted: toNullableBoolean(record.read_restricted),
    raw: record,
  };
}

function normalizeTopicDetail(payload: unknown) {
  const record = requirePayloadObject(payload, "Discourse topic response");
  const postStream = readOptionalPayloadObject(record.post_stream);
  return {
    id: requirePayloadInteger(record.id, "Discourse topic id"),
    title: requirePayloadString(record.title, "Discourse topic title"),
    fancyTitle: toNullableString(record.fancy_title),
    slug: toNullableString(record.slug),
    postsCount: toNullableInteger(record.posts_count),
    categoryId: toNullableInteger(record.category_id),
    createdAt: toNullableString(record.created_at),
    posts: readOptionalPayloadObjectArray(postStream?.posts).map(normalizePostSummary),
    details: readOptionalPayloadObject(record.details) ?? {},
    raw: record,
  };
}

function normalizePostSummary(value: unknown) {
  const record = requirePayloadObject(value, "Discourse post");
  return {
    id: requirePayloadInteger(record.id, "Discourse post id"),
    topicId: toNullableInteger(record.topic_id),
    topicSlug: toNullableString(record.topic_slug),
    postNumber: toNullableInteger(record.post_number),
    replyToPostNumber: toNullableInteger(record.reply_to_post_number),
    username: toNullableString(record.username),
    displayUsername: toNullableString(record.display_username),
    name: toNullableString(record.name),
    createdAt: toNullableString(record.created_at),
    updatedAt: toNullableString(record.updated_at),
    cooked: toNullableString(record.cooked),
    postType: toNullableInteger(record.post_type),
    raw: record,
  };
}

function normalizeUserSummary(value: unknown) {
  const record = requirePayloadObject(value, "Discourse user");
  return {
    id: toNullableInteger(record.id),
    username: toNullableString(record.username),
    name: toNullableString(record.name),
    avatarTemplate: toNullableString(record.avatar_template),
    raw: record,
  };
}

function normalizeCreatedPostPayload(payload: unknown) {
  const record = requirePayloadObject(payload, "Discourse created post response");
  return {
    post: normalizePostSummary(record),
    raw: record,
  };
}

function normalizeValidationUser(payload: unknown) {
  const record = requirePayloadObject(payload, "Discourse user response");
  const user = requirePayloadObject(record.user, "Discourse user response user");
  return normalizeUserSummary(user);
}

function requireCredentialField(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function requireInputString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function requireInputRaw(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, "raw is required");
  }
  return value;
}

function requireInputPositiveInteger(value: unknown, fieldName: string) {
  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function requirePayloadObject(value: unknown, fieldName: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readOptionalPayloadObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readPayloadObjectArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`);
  }
  return value.map((item) => requirePayloadObject(item, fieldName));
}

function readOptionalPayloadObjectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => requirePayloadObject(item, "Discourse array item"));
}

function requirePayloadString(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `${fieldName} must be a string`);
  }
  return value;
}

function requirePayloadInteger(value: unknown, fieldName: string) {
  if (!Number.isInteger(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an integer`);
  }
  return value as number;
}

function toNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function toNullableInteger(value: unknown) {
  if (Number.isInteger(value)) {
    return value as number;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsed = Number(trimmed);
    if (trimmed && Number.isInteger(parsed) && String(parsed) === trimmed) {
      return parsed;
    }
  }

  return null;
}

function toNullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
