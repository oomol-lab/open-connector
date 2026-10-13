import type { CredentialValidationResult, ResolvedCredential } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalString,
  optionalRawString,
  optionalNumber,
  optionalBoolean,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed, readBoundedResponseBytes } from "../../core/request.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  providerFetch,
  basicAuthorizationHeader,
  parseProviderJsonBodyText,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

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
  formData?: FormData;
  timeoutMs?: number;
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
  get_current_user(input, context) {
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
    return createResource(context, "/categories", "category", buildTermBody(input, true));
  },
  list_tags(input, context) {
    return listCollection(input, context, "/tags", "tags", buildTermListQuery(input));
  },
  create_tag(input, context) {
    return createResource(context, "/tags", "tag", buildTermBody(input, true));
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
  get_category(input, context) {
    return getResource(input, context, "/categories", "category");
  },
  update_category(input, context) {
    return updateResource(input, context, "/categories", "category", buildTermBody(input));
  },
  delete_category(input, context) {
    return deleteResource(input, context, "/categories", true);
  },
  get_tag(input, context) {
    return getResource(input, context, "/tags", "tag");
  },
  update_tag(input, context) {
    return updateResource(input, context, "/tags", "tag", buildTermBody(input));
  },
  delete_tag(input, context) {
    return deleteResource(input, context, "/tags", true);
  },
  get_comment(input, context) {
    return getResource(input, context, "/comments", "comment");
  },
  create_comment(input, context) {
    return createResource(context, "/comments", "comment", buildCommentBody(input));
  },
  list_media(input, context) {
    return listCollection(input, context, "/media", "media", buildMediaListQuery(input));
  },
  get_media(input, context) {
    return getResource(input, context, "/media", "media");
  },
  upload_media(input, context) {
    return uploadMedia(input, context);
  },
  update_media(input, context) {
    return updateResource(input, context, "/media", "media", buildMediaBody(input));
  },
  delete_media(input, context) {
    return deleteResource(input, context, "/media");
  },
  list_users(input, context) {
    return listCollection(input, context, "/users", "users", buildUserListQuery(input));
  },
  get_user(input, context) {
    return getResource(input, context, "/users", "user");
  },
  search(input, context) {
    return listCollection(
      input,
      context,
      "/search",
      "results",
      buildMappedQuery(input, {
        search: "search",
        context: "context",
        page: "page",
        perPage: "per_page",
        type: "type",
        subtype: "subtype",
        include: "include",
        exclude: "exclude",
      }),
    );
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
function normalizeWordpressSiteUrl(
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

function buildWordpressApiBaseUrl(siteUrl: string): string {
  return new URL("wp-json/wp/v2", `${normalizeWordpressSiteUrl(siteUrl)}/`).toString();
}

function buildWordpressOAuthApiBaseUrl(blogId: string): string {
  return `https://public-api.wordpress.com/wp/v2/sites/${encodeURIComponent(blogId)}`;
}

export function buildWordpressAuthorization(context: WordpressConnection): string {
  if (context.auth.type === "oauth2") {
    return `${context.auth.tokenType} ${context.auth.accessToken}`;
  }
  return basicAuthorizationHeader(`${context.auth.username}:${context.auth.applicationPassword}`);
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

async function getCurrentUser(context: WordpressActionContext) {
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
) {
  assertNoIncludeExcludeOverlap(input);
  return runProviderRequest({ label: "WordPress", signal: context.signal }, async (signal) => {
    const response = await requestWordpressResponse({
      ...context,
      path,
      query,
      signal,
      phase: "execute",
    });
    const payload = await readWordpressResponseJson(response, "execute", false);
    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "WordPress list response must be an array", undefined, "provider_error");
    }
    return { [outputKey]: payload, pagination: readPagination(response.headers) };
  });
}

async function getResource(
  input: Record<string, unknown>,
  context: WordpressActionContext,
  collectionPath: string,
  outputKey: string,
) {
  const id = requireInteger(input.id, "id");
  const payload = await requestWordpressJson<Record<string, unknown>>({
    ...context,
    path: `${collectionPath}/${encodeURIComponent(String(id))}`,
    query: {
      context: optionalRawString(input.context),
      password: optionalRawString(input.password),
    },
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
) {
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
) {
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
  permanent = false,
) {
  const id = requireInteger(input.id, "id");
  const payload = await requestWordpressJson<Record<string, unknown>>({
    ...context,
    path: `${collectionPath}/${encodeURIComponent(String(id))}`,
    method: "DELETE",
    query: {
      force: permanent ? true : optionalBoolean(input.force),
    },
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  if (payload.deleted === true) {
    return {
      deleted: true,
      trashed: false,
      previous: optionalRecord(payload.previous) ?? null,
      resource: null,
    };
  }
  if (payload.status === "trash") {
    return { deleted: false, trashed: true, previous: null, resource: payload };
  }
  throw new ProviderRequestError(
    502,
    "WordPress delete response must confirm permanent deletion or return a trashed resource",
    undefined,
    "provider_error",
  );
}

async function uploadMedia(input: Record<string, unknown>, context: WordpressActionContext) {
  const fileUrl = requiredInputString(input.fileUrl, "fileUrl");
  const fileName = resolveUploadFileName(fileUrl, optionalRawString(input.fileName));
  const source = await runProviderRequest(
    { label: "WordPress file download", signal: context.signal, timeoutMs: 15_000 },
    async (signal) => {
      assertPublicHttpUrl(fileUrl, {
        fieldName: "fileUrl",
        createError: (message) => new ProviderRequestError(400, message),
      });
      const response = await providerFetch(fileUrl, { signal });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ProviderRequestError(400, `fileUrl download failed with HTTP ${response.status}`);
      }
      const bytes = await readBoundedResponseBytes(response, {
        maxBytes: optionalInteger(input.maximumBytes) ?? 20 * 1024 * 1024,
        fieldName: "fileUrl",
        signal,
        createError: (message) => new ProviderRequestError(400, message),
      });
      return { bytes, contentType: response.headers.get("content-type") };
    },
  );
  if (source.bytes.byteLength === 0) {
    throw new ProviderRequestError(400, "fileUrl must not contain an empty file", undefined, "invalid_input");
  }
  const form = new FormData();
  const mimeType = optionalRawString(input.mimeType) ?? source.contentType ?? "application/octet-stream";
  form.append("file", new Blob([source.bytes as Uint8Array<ArrayBuffer>], { type: mimeType }), fileName);
  const { meta, ...fields } = buildMediaBody(input);
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, String(value));
  }
  const attachment = await requestWordpressJson<Record<string, unknown>>({
    ...context,
    path: "/media",
    method: "POST",
    formData: form,
    phase: "execute",
    // WordPress generates attachment metadata before responding.
    timeoutMs: 120_000,
  });
  if (meta === undefined) {
    return { media: attachment };
  }
  const attachmentId = optionalNumber(attachment.id);
  if (attachmentId === undefined || !Number.isInteger(attachmentId) || attachmentId <= 0) {
    throw new ProviderRequestError(
      502,
      "WordPress uploaded the file but returned no valid attachment ID; meta fields were not applied",
      undefined,
      "provider_error",
    );
  }
  // Apply nested metadata as JSON after the multipart upload.
  try {
    const media = await requestWordpressJson<Record<string, unknown>>({
      ...context,
      path: `/media/${attachmentId}`,
      method: "POST",
      body: { meta },
      phase: "execute",
    });
    return { media };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw new ProviderRequestError(
        error.status,
        `WordPress attachment ${attachmentId} was uploaded, but applying meta failed: ${error.message}. Use update_media with this ID instead of uploading again.`,
        {
          attachmentId,
          stage: "apply_meta",
          upstreamCode: optionalRawString(optionalRecord(error.details)?.upstreamCode),
        },
        error.code,
      );
    }
    throw error;
  }
}

function resolveUploadFileName(fileUrl: string, explicitName: string | undefined) {
  if (explicitName !== undefined) {
    return explicitName.trim();
  }
  const basename = new URL(fileUrl).pathname.split("/").at(-1);
  if (!basename) {
    throw new ProviderRequestError(
      400,
      "fileName is required when fileUrl has no filename",
      undefined,
      "invalid_input",
    );
  }
  try {
    return decodeURIComponent(basename);
  } catch {
    throw new ProviderRequestError(
      400,
      "fileName is required when the fileUrl filename is not valid URL encoding",
      undefined,
      "invalid_input",
    );
  }
}

async function requestWordpressJson<T>(options: WordpressRequestOptions) {
  return runProviderRequest(
    { label: "WordPress", timeoutMs: options.timeoutMs, signal: options.signal },
    async (signal) => {
      const response = await requestWordpressResponse({ ...options, signal });
      try {
        const payload = await readWordpressResponseJson(response, options.phase, options.notFoundAsInvalidInput);
        return requiredResponseRecord(payload, "WordPress resource response") as T;
      } catch (error) {
        const attachmentId = readHeaderInteger(response.headers, "x-wp-upload-attachment-id");
        if (
          options.formData !== undefined &&
          error instanceof ProviderRequestError &&
          attachmentId !== null &&
          attachmentId > 0
        ) {
          throw new ProviderRequestError(
            error.status,
            `WordPress created attachment ${attachmentId}, but upload processing failed: ${error.message}. Inspect it with get_media before uploading again.`,
            {
              upstreamCode: optionalRawString(optionalRecord(error.details)?.upstreamCode),
              attachmentId,
              stage: "upload_processing",
            },
            error.code,
          );
        }
        throw error;
      }
    },
  );
}

async function requestWordpressResponse(options: WordpressRequestOptions) {
  const apiBaseUrl = options.apiBaseUrl;
  const url = buildWordpressUrl(apiBaseUrl, options.path, options.query);
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
  if (options.formData !== undefined) {
    init.body = options.formData;
  } else if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  return options.fetcher(url, init);
}

function buildWordpressUrl(apiBaseUrl: string, path: string, query: Record<string, WordpressQueryValue> = {}) {
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
) {
  const responseText = await response.text();
  let payload: unknown = null;
  try {
    payload = parseProviderJsonBodyText(responseText, {
      emptyBody: null,
      invalidJsonMessage: "WordPress response must contain valid JSON",
    });
  } catch (error) {
    if (response.ok) throw error;
  }
  if (response.ok) {
    if (payload === null) {
      throw new ProviderRequestError(502, "WordPress response must contain valid JSON", undefined, "provider_error");
    }
    return payload;
  }

  const message =
    readErrorMessage(payload) ||
    (response.statusText ? `WordPress request failed: ${response.statusText}` : "WordPress request failed");

  const errorCode = optionalRawString(optionalRecord(payload)?.code);
  const errorData = errorCode ? { upstreamCode: errorCode } : undefined;
  if (response.status === 429) {
    throw new ProviderRequestError(429, message, errorData, "rate_limited");
  }
  if (
    phase === "validate" &&
    (response.status === 401 || response.status === 403) &&
    errorCode === "rest_not_logged_in"
  ) {
    throw new ProviderRequestError(400, message, errorData, "invalid_input");
  }
  if (response.status === 400 || response.status === 422 || (response.status === 404 && notFoundAsInvalidInput)) {
    throw new ProviderRequestError(400, message, errorData, "invalid_input");
  }
  throw new ProviderRequestError(response.status || 502, message, errorData, "provider_error");
}

function readErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  return optionalRawString((payload as Record<string, unknown>).message);
}

function readPagination(headers: Headers) {
  return {
    total: readHeaderInteger(headers, "x-wp-total"),
    totalPages: readHeaderInteger(headers, "x-wp-totalpages"),
  };
}

function readHeaderInteger(headers: Headers, name: string) {
  const value = headers.get(name);
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function buildPostListQuery(input: Record<string, unknown>) {
  return compactObject({
    search: optionalRawString(input.search)?.trim(),
    status: optionalQueryArray(input.status),
    categories: optionalQueryArray(input.categories),
    tags: optionalQueryArray(input.tags),
    include: optionalQueryArray(input.include),
    exclude: optionalQueryArray(input.exclude),
    author: optionalQueryArray(input.author),
    slug: Array.isArray(input.slug) ? input.slug.map((value) => String(value).trim()) : undefined,
    per_page: optionalInteger(input.perPage),
    page: optionalInteger(input.page),
    order: optionalRawString(input.order),
    orderby: optionalRawString(input.orderby),
  });
}

function buildPageListQuery(input: Record<string, unknown>) {
  return compactObject({
    search: optionalRawString(input.search)?.trim(),
    status: optionalQueryArray(input.status),
    include: optionalQueryArray(input.include),
    exclude: optionalQueryArray(input.exclude),
    parent: optionalQueryArray(input.parent),
    author: optionalQueryArray(input.author),
    slug: Array.isArray(input.slug) ? input.slug.map((value) => String(value).trim()) : undefined,
    per_page: optionalInteger(input.perPage),
    page: optionalInteger(input.page),
    order: optionalRawString(input.order),
    orderby: optionalRawString(input.orderby),
  });
}

function buildTermListQuery(input: Record<string, unknown>) {
  return compactObject({
    search: optionalRawString(input.search)?.trim(),
    include: optionalQueryArray(input.include),
    exclude: optionalQueryArray(input.exclude),
    parent: optionalInteger(input.parent),
    slug: Array.isArray(input.slug) ? input.slug.map((value) => String(value).trim()) : undefined,
    hide_empty: typeof input.hideEmpty === "boolean" ? input.hideEmpty : undefined,
    per_page: optionalInteger(input.perPage),
    page: optionalInteger(input.page),
    order: optionalRawString(input.order),
    orderby: optionalRawString(input.orderby),
  });
}

function buildCommentListQuery(input: Record<string, unknown>) {
  return compactObject({
    search: optionalRawString(input.search)?.trim(),
    status: optionalRawString(input.status),
    post: optionalQueryArray(input.post),
    author: optionalQueryArray(input.author),
    parent: optionalQueryArray(input.parent),
    include: optionalQueryArray(input.include),
    exclude: optionalQueryArray(input.exclude),
    per_page: optionalInteger(input.perPage),
    page: optionalInteger(input.page),
    order: optionalRawString(input.order),
    orderby: optionalRawString(input.orderby),
  });
}

function buildPostBody(input: Record<string, unknown>) {
  return compactObject({
    title: optionalRawString(input.title),
    content: optionalRawString(input.content),
    excerpt: optionalRawString(input.excerpt),
    slug: optionalRawString(input.slug)?.trim(),
    status: optionalRawString(input.status),
    categories: optionalJsonArray(input.categories),
    tags: optionalJsonArray(input.tags),
    featured_media: optionalInteger(input.featuredMedia),
    meta: optionalRecord(input.meta),
  });
}

function buildPageBody(input: Record<string, unknown>) {
  return compactObject({
    title: optionalRawString(input.title),
    content: optionalRawString(input.content),
    excerpt: optionalRawString(input.excerpt),
    slug: optionalRawString(input.slug)?.trim(),
    status: optionalRawString(input.status),
    parent: optionalInteger(input.parent),
    featured_media: optionalInteger(input.featuredMedia),
    menu_order: optionalInteger(input.menuOrder),
    meta: optionalRecord(input.meta),
  });
}

function buildTermBody(input: Record<string, unknown>, creating = false) {
  return compactObject({
    name: optionalRawString(input.name)?.trim(),
    slug: creating ? optionalRawString(input.slug)?.trim() : optionalRawString(input.slug),
    description: optionalRawString(input.description),
    parent: optionalInteger(input.parent),
    meta: optionalRecord(input.meta),
  });
}

function buildCommentBody(input: Record<string, unknown>) {
  return compactObject({
    post: optionalInteger(input.post),
    parent: optionalInteger(input.parent),
    author: optionalInteger(input.author),
    content: optionalRawString(input.content),
    status: optionalRawString(input.status),
    author_name: optionalRawString(input.authorName),
    author_email: optionalRawString(input.authorEmail),
    author_url: optionalRawString(input.authorUrl),
    author_ip: optionalRawString(input.authorIp),
    author_user_agent: optionalRawString(input.authorUserAgent),
    date: optionalRawString(input.date),
    date_gmt: optionalRawString(input.dateGmt),
    meta: optionalRecord(input.meta),
  });
}

function buildMappedQuery(input: Record<string, unknown>, fields: Record<string, string>) {
  const query: Record<string, WordpressQueryValue> = {};
  for (const [inputKey, upstreamKey] of Object.entries(fields)) {
    const value = input[inputKey];
    query[upstreamKey] =
      optionalRawString(value) ?? optionalNumber(value) ?? optionalBoolean(value) ?? optionalQueryArray(value);
  }
  return compactObject(query);
}

function buildMediaListQuery(input: Record<string, unknown>) {
  return buildMappedQuery(
    { ...input, search: optionalRawString(input.search)?.trim() },
    {
      search: "search",
      context: "context",
      page: "page",
      perPage: "per_page",
      order: "order",
      orderby: "orderby",
      after: "after",
      before: "before",
      modifiedAfter: "modified_after",
      modifiedBefore: "modified_before",
      author: "author",
      authorExclude: "author_exclude",
      include: "include",
      exclude: "exclude",
      offset: "offset",
      parent: "parent",
      parentExclude: "parent_exclude",
      searchColumns: "search_columns",
      slug: "slug",
      status: "status",
      mediaType: "media_type",
      mimeType: "mime_type",
    },
  );
}

function buildUserListQuery(input: Record<string, unknown>) {
  return buildMappedQuery(
    { ...input, search: optionalRawString(input.search)?.trim() },
    {
      search: "search",
      context: "context",
      page: "page",
      perPage: "per_page",
      order: "order",
      orderby: "orderby",
      include: "include",
      exclude: "exclude",
      offset: "offset",
      slug: "slug",
      roles: "roles",
      capabilities: "capabilities",
      who: "who",
      hasPublishedPosts: "has_published_posts",
    },
  );
}

function buildMediaBody(input: Record<string, unknown>) {
  return compactObject({
    date: optionalRawString(input.date),
    date_gmt: optionalRawString(input.dateGmt),
    slug: optionalRawString(input.slug),
    status: optionalRawString(input.status),
    title: optionalRawString(input.title),
    author: optionalInteger(input.author),
    comment_status: optionalRawString(input.commentStatus),
    ping_status: optionalRawString(input.pingStatus),
    template: optionalRawString(input.template),
    alt_text: optionalRawString(input.altText),
    caption: optionalRawString(input.caption),
    description: optionalRawString(input.description),
    post: optionalInteger(input.post),
    meta: optionalRecord(input.meta),
  });
}

function optionalQueryArray(value: unknown) {
  return Array.isArray(value) && value.length > 0 ? value.map(String) : undefined;
}

function optionalJsonArray(value: unknown) {
  return Array.isArray(value) ? value : undefined;
}

function serializeQueryValue(value: WordpressQueryValue) {
  return Array.isArray(value) ? value.map(String).join(",") : String(value);
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
