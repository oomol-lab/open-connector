import type { CredentialValidationResult, ResolvedCredential } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const wordpressValidationPath = "/users/me";

type WordpressRequestPhase = "validate" | "execute";
type WordpressQueryValue = string | number | boolean | readonly (string | number)[] | undefined;
type WordpressActionHandler = ProviderRuntimeHandler<WordpressActionContext>;

interface WordpressRequestOptions extends WordpressConnection {
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: WordpressRequestPhase;
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, WordpressQueryValue>;
  body?: unknown;
  notFoundAsInvalidInput?: boolean;
}

interface WordpressBasicAuth {
  type: "basic";
  applicationPassword: string;
  username: string;
}

interface WordpressOAuthAuth {
  type: "oauth2";
  accessToken: string;
  tokenType: string;
}

interface WordpressConnection {
  apiBaseUrl: string;
  auth: WordpressBasicAuth | WordpressOAuthAuth;
  siteUrl: string;
}

export interface WordpressActionContext extends WordpressConnection {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type WordpressCredential =
  | Extract<ResolvedCredential, { authType: "api_key" }>
  | Extract<ResolvedCredential, { authType: "oauth2" }>;

export const wordpressActionHandlers: ProviderActionHandlers<"wordpress", WordpressActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  list_posts(input, context) {
    return listCollection(input, context, "/posts", "posts", buildPostListQuery(input));
  },
  get_post(input, context) {
    return getResource(input, context, "/posts", "post");
  },
  create_post(input, context) {
    return createResource(context, "/posts", "post", buildPostBody(input));
  },
  update_post(input, context) {
    return updateResource(input, context, "/posts", "post", buildPostBody(input));
  },
  delete_post(input, context) {
    return deleteResource(input, context, "/posts");
  },
  list_pages(input, context) {
    return listCollection(input, context, "/pages", "pages", buildPageListQuery(input));
  },
  get_page(input, context) {
    return getResource(input, context, "/pages", "page");
  },
  create_page(input, context) {
    return createResource(context, "/pages", "page", buildPageBody(input));
  },
  update_page(input, context) {
    return updateResource(input, context, "/pages", "page", buildPageBody(input));
  },
  delete_page(input, context) {
    return deleteResource(input, context, "/pages");
  },
  list_categories(input, context) {
    return listCollection(input, context, "/categories", "categories", buildTermListQuery(input));
  },
  create_category(input, context) {
    return createResource(context, "/categories", "category", buildTermBody(input));
  },
  list_tags(input, context) {
    return listCollection(input, context, "/tags", "tags", buildTermListQuery(input));
  },
  create_tag(input, context) {
    return createResource(context, "/tags", "tag", buildTermBody(input));
  },
  list_comments(input, context) {
    return listCollection(input, context, "/comments", "comments", buildCommentListQuery(input));
  },
  update_comment(input, context) {
    return updateResource(input, context, "/comments", "comment", buildCommentBody(input));
  },
  delete_comment(input, context) {
    return deleteResource(input, context, "/comments");
  },
};

export async function validateWordpressCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const connection = resolveWordpressConnection(input.apiKey, input.values);
  const user = await requestWordpressJson<Record<string, unknown>>({
    ...connection,
    path: wordpressValidationPath,
    query: {
      context: "edit",
    },
    fetcher,
    signal,
    phase: "validate",
  });
  const userId = requireInteger(user.id, "user.id");
  const userName = optionalString(user.name);
  const userSlug = optionalString(user.slug);

  return {
    profile: {
      accountId: `wordpress:${new URL(connection.siteUrl).host}:user:${userId}`,
      displayName:
        userName ||
        userSlug ||
        `${connection.auth.type === "basic" ? connection.auth.username : "WordPress user"} (${new URL(connection.siteUrl).host})`,
    },
    grantedScopes: [],
    metadata: compactObject({
      siteUrl: connection.siteUrl,
      apiBaseUrl: connection.apiBaseUrl,
      validationEndpoint: new URL(pathWithoutLeadingSlash(wordpressValidationPath), `${connection.apiBaseUrl}/`)
        .pathname,
      username: connection.auth.type === "basic" ? connection.auth.username : undefined,
      userId,
      userName,
      userSlug,
    }),
  };
}

export async function validateWordpressOAuthCredential(
  input: Extract<ResolvedCredential, { authType: "oauth2" }>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const connection = resolveWordpressOAuthConnection(input);
  const user = await requestWordpressJson<Record<string, unknown>>({
    ...connection,
    path: wordpressValidationPath,
    query: { context: "edit" },
    fetcher,
    signal,
    phase: "validate",
  });
  const userId = requireInteger(user.id, "user.id");
  const userName = optionalString(user.name);
  const userSlug = optionalString(user.slug);
  const blogId = readWordpressBlogId(input.metadata.blog_id);

  return {
    profile: {
      accountId: `wordpress:blog:${blogId}:user:${userId}`,
      displayName: userName || userSlug || `WordPress blog ${blogId}`,
    },
    grantedScopes: readWordpressScopes(input.metadata.scope),
    metadata: compactObject({
      ...input.metadata,
      siteUrl: connection.siteUrl,
      apiBaseUrl: connection.apiBaseUrl,
      validationEndpoint: new URL(pathWithoutLeadingSlash(wordpressValidationPath), `${connection.apiBaseUrl}/`)
        .pathname,
      userId,
      userName,
      userSlug,
    }),
  };
}

export function createWordpressContext(
  credential: WordpressCredential,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): WordpressActionContext {
  return {
    ...(credential.authType === "oauth2"
      ? resolveWordpressOAuthConnection(credential)
      : resolveWordpressConnection(credential.apiKey, credential.values)),
    fetcher,
    signal,
  };
}

/**
 * Normalizes and SSRF-guards the WordPress site URL. By default only public
 * hosts are allowed; set OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK to opt a
 * deployment into private/LAN instances (reserved/loopback/metadata/IPv6
 * ranges stay blocked regardless).
 */
export function normalizeWordpressSiteUrl(
  value: string | undefined,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const raw = value?.trim();
  if (!raw) {
    throw new ProviderRequestError(400, "siteUrl is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ProviderRequestError(400, "siteUrl must be a valid absolute URL");
  }

  if (parsed.protocol !== "https:" && !allowPrivateNetwork) {
    throw new ProviderRequestError(400, "siteUrl must use https");
  }

  parsed.search = "";
  parsed.hash = "";

  let pathname = trimTrailingSlash(parsed.pathname);
  for (const suffix of ["/wp-json/wp/v2", "/wp-json"]) {
    if (pathname.toLowerCase().endsWith(suffix)) {
      pathname = pathname.slice(0, pathname.length - suffix.length) || "/";
      break;
    }
  }
  pathname = trimTrailingSlash(pathname);
  parsed.pathname = pathname === "/" ? "/" : pathname;

  const normalized = `${parsed.origin}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  assertPublicHttpUrl(normalized, {
    fieldName: "siteUrl",
    allowPrivateNetwork,
    createError: (message) => new ProviderRequestError(400, message),
  });
  return normalized;
}

export function buildWordpressApiBaseUrl(siteUrl: string): string {
  return new URL("wp-json/wp/v2", `${normalizeWordpressSiteUrl(siteUrl)}/`).toString();
}

export function buildWordpressOAuthApiBaseUrl(blogId: string): string {
  return `https://public-api.wordpress.com/wp/v2/sites/${encodeURIComponent(blogId)}`;
}

export function buildWordpressAuthorization(context: WordpressConnection): string {
  if (context.auth.type === "oauth2") {
    return `${context.auth.tokenType} ${context.auth.accessToken}`;
  }
  return buildBasicAuthorization(context.auth.username, context.auth.applicationPassword);
}

function resolveWordpressConnection(apiKey: string, values: Record<string, string>): WordpressConnection {
  const siteUrl = normalizeWordpressSiteUrl(values.siteUrl);
  return {
    apiBaseUrl: buildWordpressApiBaseUrl(siteUrl),
    auth: {
      type: "basic",
      applicationPassword: apiKey,
      username: requiredTrimmedString(values.username, "username"),
    },
    siteUrl,
  };
}

function resolveWordpressOAuthConnection(
  credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
): WordpressConnection {
  const blogId = readWordpressBlogId(credential.metadata.blog_id);
  return {
    apiBaseUrl: buildWordpressOAuthApiBaseUrl(blogId),
    auth: {
      type: "oauth2",
      accessToken: credential.accessToken,
      tokenType: credential.tokenType || "Bearer",
    },
    siteUrl: readWordpressBlogUrl(credential.metadata.blog_url),
  };
}

async function getCurrentUser(context: WordpressActionContext): Promise<unknown> {
  const payload = await requestWordpressJson<Record<string, unknown>>({
    ...context,
    path: wordpressValidationPath,
    query: {
      context: "edit",
    },
    phase: "execute",
  });
  return { user: payload };
}

async function listCollection(
  input: Record<string, unknown>,
  context: WordpressActionContext,
  path: string,
  outputKey: string,
  query: Record<string, WordpressQueryValue>,
): Promise<unknown> {
  assertNoIncludeExcludeOverlap(input);
  const response = await requestWordpressResponse({
    ...context,
    path,
    query,
    phase: "execute",
  });
  const payload = await readWordpressResponseJson(response, "execute", false);
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "WordPress list response must be an array", payload);
  }
  return {
    [outputKey]: payload,
    pagination: readPagination(response.headers),
  };
}

async function getResource(
  input: Record<string, unknown>,
  context: WordpressActionContext,
  collectionPath: string,
  outputKey: string,
): Promise<unknown> {
  const id = requireInteger(input.id, "id");
  const payload = await requestWordpressJson<Record<string, unknown>>({
    ...context,
    path: `${collectionPath}/${encodeURIComponent(String(id))}`,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { [outputKey]: payload };
}

async function createResource(
  context: WordpressActionContext,
  path: string,
  outputKey: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const payload = await requestWordpressJson<Record<string, unknown>>({
    ...context,
    path,
    method: "POST",
    body,
    phase: "execute",
  });
  return { [outputKey]: payload };
}

async function updateResource(
  input: Record<string, unknown>,
  context: WordpressActionContext,
  collectionPath: string,
  outputKey: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const id = requireInteger(input.id, "id");
  const payload = await requestWordpressJson<Record<string, unknown>>({
    ...context,
    path: `${collectionPath}/${encodeURIComponent(String(id))}`,
    method: "POST",
    body,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { [outputKey]: payload };
}

async function deleteResource(
  input: Record<string, unknown>,
  context: WordpressActionContext,
  collectionPath: string,
): Promise<unknown> {
  const id = requireInteger(input.id, "id");
  const payload = await requestWordpressJson<Record<string, unknown>>({
    ...context,
    path: `${collectionPath}/${encodeURIComponent(String(id))}`,
    method: "DELETE",
    query: {
      force: typeof input.force === "boolean" ? input.force : undefined,
    },
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return {
    deleted: payload.deleted === true,
    previous: optionalRecord(payload.previous) ?? null,
  };
}

async function requestWordpressJson<T>(options: WordpressRequestOptions): Promise<T> {
  const response = await requestWordpressResponse(options);
  return readWordpressResponseJson(response, options.phase, options.notFoundAsInvalidInput) as Promise<T>;
}

async function requestWordpressResponse(options: WordpressRequestOptions): Promise<Response> {
  const url = buildWordpressUrl(options.apiBaseUrl, options.path, options.query);
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: buildWordpressAuthorization(options),
    "user-agent": providerUserAgent,
  };
  const init: RequestInit = {
    method: options.method ?? "GET",
    headers,
    signal: options.signal,
  };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  try {
    return await options.fetcher(url, init);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `WordPress request failed: ${error.message}` : "WordPress request failed",
    );
  }
}

function buildWordpressUrl(apiBaseUrl: string, path: string, query: Record<string, WordpressQueryValue> = {}): string {
  const url = new URL(pathWithoutLeadingSlash(path), `${apiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, serializeQueryValue(value));
  }
  return url.toString();
}

async function readWordpressResponseJson(
  response: Response,
  phase: WordpressRequestPhase,
  notFoundAsInvalidInput: boolean | undefined,
): Promise<unknown> {
  const payload = (await response.json().catch(() => null)) as unknown;
  if (response.ok) {
    return payload;
  }

  const message =
    readErrorMessage(payload) ||
    (response.statusText ? `WordPress request failed: ${response.statusText}` : "WordPress request failed");

  if (response.status === 429) {
    throw new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, message, payload);
  }
  if (response.status === 400 || response.status === 422 || (response.status === 404 && notFoundAsInvalidInput)) {
    throw new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProviderRequestError(response.status, message, payload);
  }
  throw new ProviderRequestError(response.status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  return optionalString(optionalRecord(payload)?.message);
}

function readPagination(headers: Headers): Record<string, number | null> {
  return {
    total: readHeaderInteger(headers, "x-wp-total"),
    totalPages: readHeaderInteger(headers, "x-wp-totalpages"),
  };
}

function readHeaderInteger(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function buildPostListQuery(input: Record<string, unknown>): Record<string, WordpressQueryValue> {
  return compactObject({
    search: optionalString(input.search),
    status: optionalQueryArray(input.status),
    categories: optionalQueryArray(input.categories),
    tags: optionalQueryArray(input.tags),
    include: optionalQueryArray(input.include),
    exclude: optionalQueryArray(input.exclude),
    author: optionalQueryArray(input.author),
    slug: optionalQueryArray(input.slug),
    per_page: optionalInteger(input.perPage),
    page: optionalInteger(input.page),
    order: optionalString(input.order),
    orderby: optionalString(input.orderby),
  });
}

function buildPageListQuery(input: Record<string, unknown>): Record<string, WordpressQueryValue> {
  return compactObject({
    search: optionalString(input.search),
    status: optionalQueryArray(input.status),
    include: optionalQueryArray(input.include),
    exclude: optionalQueryArray(input.exclude),
    parent: optionalQueryArray(input.parent),
    author: optionalQueryArray(input.author),
    slug: optionalQueryArray(input.slug),
    per_page: optionalInteger(input.perPage),
    page: optionalInteger(input.page),
    order: optionalString(input.order),
    orderby: optionalString(input.orderby),
  });
}

function buildTermListQuery(input: Record<string, unknown>): Record<string, WordpressQueryValue> {
  return compactObject({
    search: optionalString(input.search),
    include: optionalQueryArray(input.include),
    exclude: optionalQueryArray(input.exclude),
    parent: optionalInteger(input.parent),
    slug: optionalQueryArray(input.slug),
    hide_empty: typeof input.hideEmpty === "boolean" ? input.hideEmpty : undefined,
    per_page: optionalInteger(input.perPage),
    page: optionalInteger(input.page),
    order: optionalString(input.order),
    orderby: optionalString(input.orderby),
  });
}

function buildCommentListQuery(input: Record<string, unknown>): Record<string, WordpressQueryValue> {
  return compactObject({
    search: optionalString(input.search),
    status: optionalQueryArray(input.status),
    post: optionalQueryArray(input.post),
    author: optionalQueryArray(input.author),
    parent: optionalQueryArray(input.parent),
    include: optionalQueryArray(input.include),
    exclude: optionalQueryArray(input.exclude),
    per_page: optionalInteger(input.perPage),
    page: optionalInteger(input.page),
    order: optionalString(input.order),
    orderby: optionalString(input.orderby),
  });
}

function buildPostBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    title: optionalString(input.title),
    content: optionalString(input.content),
    excerpt: optionalString(input.excerpt),
    slug: optionalString(input.slug),
    status: optionalString(input.status),
    categories: optionalJsonArray(input.categories),
    tags: optionalJsonArray(input.tags),
    featured_media: optionalInteger(input.featuredMedia),
    meta: optionalRecord(input.meta),
  });
}

function buildPageBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    title: optionalString(input.title),
    content: optionalString(input.content),
    excerpt: optionalString(input.excerpt),
    slug: optionalString(input.slug),
    status: optionalString(input.status),
    parent: optionalInteger(input.parent),
    featured_media: optionalInteger(input.featuredMedia),
    menu_order: optionalInteger(input.menuOrder),
    meta: optionalRecord(input.meta),
  });
}

function buildTermBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    slug: optionalString(input.slug),
    description: optionalString(input.description),
    parent: optionalInteger(input.parent),
    meta: optionalRecord(input.meta),
  });
}

function buildCommentBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    content: optionalString(input.content),
    status: optionalString(input.status),
    author_name: optionalString(input.authorName),
    author_email: optionalString(input.authorEmail),
    author_url: optionalString(input.authorUrl),
  });
}

function optionalQueryArray(value: unknown): readonly (string | number)[] | undefined {
  return Array.isArray(value) && value.length > 0
    ? value.filter((item): item is string | number => typeof item === "string" || typeof item === "number")
    : undefined;
}

function optionalJsonArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) && value.length > 0 ? value : undefined;
}

function serializeQueryValue(value: WordpressQueryValue): string {
  return Array.isArray(value) ? value.map(String).join(",") : String(value);
}

function buildBasicAuthorization(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function readWordpressBlogId(value: unknown): string {
  const blogId = typeof value === "number" && Number.isInteger(value) ? String(value) : optionalString(value)?.trim();
  if (!blogId) {
    throw new ProviderRequestError(400, "WordPress OAuth token response is missing blog_id");
  }
  return blogId;
}

function readWordpressBlogUrl(value: unknown): string {
  const blogUrl = optionalString(value)?.trim();
  if (!blogUrl) {
    throw new ProviderRequestError(400, "WordPress OAuth token response is missing blog_url");
  }
  try {
    return new URL(blogUrl).toString();
  } catch {
    throw new ProviderRequestError(400, "WordPress OAuth token response contains an invalid blog_url");
  }
}

function readWordpressScopes(value: unknown): string[] {
  const scope = optionalString(value);
  return scope ? scope.split(/[\s,]+/).filter(Boolean) : [];
}

function requiredTrimmedString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message)).trim();
}

function requireInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return parsed;
}

function assertNoIncludeExcludeOverlap(input: Record<string, unknown>): void {
  if (!Array.isArray(input.include) || !Array.isArray(input.exclude)) {
    return;
  }
  const include = new Set(input.include.map(String));
  if (input.exclude.some((item) => include.has(String(item)))) {
    throw new ProviderRequestError(400, "include and exclude must not contain the same ID.");
  }
}

function pathWithoutLeadingSlash(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

function trimTrailingSlash(value: string): string {
  let current = value;
  while (current.endsWith("/") && current !== "/") {
    current = current.slice(0, -1);
  }
  return current;
}
