import type { CredentialValidationResult, ResolvedCredential } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
import { linkhutOAuthScopes } from "./actions.ts";

const linkhutApiBaseUrl = "https://api.ln.ht/v1";

type LinkhutActionContext = OAuthProviderContext;
type LinkhutActionHandler = (input: Record<string, unknown>, context: LinkhutActionContext) => Promise<unknown>;

export const linkhutActionHandlers: ProviderActionHandlers<"linkhut", LinkhutActionHandler> = {
  add_bookmark(input, context) {
    return linkhutAddBookmark(input, context);
  },
  update_bookmark(input, context) {
    return linkhutUpdateBookmark(input, context);
  },
  delete_bookmark(input, context) {
    return linkhutDeleteBookmark(input, context);
  },
  get_bookmarks(input, context) {
    return linkhutGetBookmarks(input, context);
  },
  get_all_tags(_input, context) {
    return linkhutGetAllTags(context);
  },
};

export async function validateLinkhutCredential(
  credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const response = await linkhutRequestText({
    path: "/posts/get",
    accessToken: credential.accessToken,
    fetcher,
    signal,
    query: {
      format: "xml",
      results: 1,
    },
  });
  const username = extractLinkhutPostsUser(response);
  const grantedScopes = parseScopeString(credential.metadata.scope, linkhutOAuthScopes);

  return {
    profile: {
      accountId: username,
      displayName: username,
      grantedScopes,
    },
    grantedScopes,
    metadata: {
      username,
    },
  };
}

async function linkhutAddBookmark(input: Record<string, unknown>, context: LinkhutActionContext): Promise<unknown> {
  return linkhutRunMutation(
    {
      path: "/posts/add",
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      query: compactObject({
        url: requiredString(input.url, "url"),
        description: requiredString(input.description, "description"),
        tags: optionalString(input.tags),
        extended: optionalString(input.extended),
        shared: toLinkhutFlag(input.shared),
        toread: toLinkhutFlag(input.toread),
        replace: "no",
      }),
    },
    "add_bookmark",
  );
}

async function linkhutUpdateBookmark(input: Record<string, unknown>, context: LinkhutActionContext): Promise<unknown> {
  return linkhutRunMutation(
    {
      path: "/posts/add",
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      query: compactObject({
        url: requiredString(input.url, "url"),
        description: requiredString(input.description, "description"),
        tags: optionalString(input.tags),
        extended: optionalString(input.extended),
        shared: toLinkhutFlag(input.shared),
        toread: toLinkhutFlag(input.toread),
      }),
    },
    "update_bookmark",
  );
}

async function linkhutDeleteBookmark(input: Record<string, unknown>, context: LinkhutActionContext): Promise<unknown> {
  return linkhutRunMutation(
    {
      path: "/posts/delete",
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      query: {
        url: requiredString(input.url, "url"),
      },
    },
    "delete_bookmark",
  );
}

async function linkhutGetBookmarks(input: Record<string, unknown>, context: LinkhutActionContext): Promise<unknown> {
  const payload = await linkhutRequestJson({
    path: "/posts/get",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    query: compactObject({
      format: "json",
      dt: optionalString(input.dt),
      tag: optionalString(input.tag),
      url: optionalString(input.url),
      meta: toLinkhutFlag(input.meta),
    }),
  });

  const posts = requireRecord(payload, "posts response").posts;
  if (!Array.isArray(posts)) {
    throw new ProviderRequestError(502, "malformed linkhut response: posts");
  }
  return {
    bookmarks: posts.map((post) => normalizeLinkhutBookmark(post)),
  };
}

async function linkhutGetAllTags(context: LinkhutActionContext): Promise<unknown> {
  const payload = await linkhutRequestJson({
    path: "/tags/get",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    query: {
      format: "json",
    },
  });
  const tags = requireRecord(payload, "tags response");
  return {
    tags: Object.entries(tags).map(([name, count]) => ({
      name,
      count: requiredInteger(count, `tag count for ${name}`),
    })),
  };
}

async function linkhutRunMutation(
  request: {
    path: string;
    accessToken: string;
    fetcher: typeof fetch;
    signal?: AbortSignal;
    query: Record<string, string | number | undefined>;
  },
  actionName: string,
): Promise<unknown> {
  const payload = await linkhutRequestJson(request);
  const resultCode = optionalString(requireRecord(payload, "mutation response").result_code);
  if (!resultCode) {
    throw new ProviderRequestError(502, "malformed linkhut response: result_code");
  }
  if (resultCode !== "done") {
    throw new ProviderRequestError(502, `linkhut ${actionName} failed: ${resultCode}`);
  }
  return {
    result_code: resultCode,
  };
}

async function linkhutRequestJson(input: {
  path: string;
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  query?: Record<string, string | number | undefined>;
}): Promise<unknown> {
  const response = await input.fetcher(buildLinkhutUrl(input.path, input.query), {
    headers: buildLinkhutHeaders(input.accessToken, "application/json"),
    signal: input.signal,
  });
  await assertLinkhutResponse(response);
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderRequestError(502, "malformed linkhut response: invalid json");
  }
}

async function linkhutRequestText(input: {
  path: string;
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  query?: Record<string, string | number | undefined>;
}): Promise<string> {
  const response = await input.fetcher(buildLinkhutUrl(input.path, input.query), {
    headers: buildLinkhutHeaders(input.accessToken, "application/xml,text/xml"),
    signal: input.signal,
  });
  await assertLinkhutResponse(response);
  return await response.text();
}

function buildLinkhutUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(`${linkhutApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value != null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function buildLinkhutHeaders(accessToken: string, accept: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    accept,
    "user-agent": providerUserAgent,
  };
}

async function assertLinkhutResponse(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  const message = await extractLinkhutErrorMessage(response);
  if (response.status === 401) {
    throw new ProviderRequestError(401, message);
  }
  if (response.status === 429) {
    throw new ProviderRequestError(429, message);
  }
  if (response.status >= 400 && response.status < 500) {
    throw new ProviderRequestError(response.status, message);
  }
  throw new ProviderRequestError(response.status || 502, message);
}

async function extractLinkhutErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return `linkhut request failed with ${response.status}`;
  }
  try {
    const payload = optionalRecord(JSON.parse(text)) ?? {};
    const message =
      optionalString(payload.error_description) ?? optionalString(payload.message) ?? optionalString(payload.error);
    return message ?? text;
  } catch {
    return text;
  }
}

function normalizeLinkhutBookmark(value: unknown): Record<string, unknown> {
  const bookmark = requireRecord(value, "bookmark");
  const url = optionalString(bookmark.href) ?? optionalString(bookmark.url);
  const description = optionalString(bookmark.description);
  const hash = optionalString(bookmark.hash);
  const time = optionalString(bookmark.time);
  if (!url) {
    throw new ProviderRequestError(502, "malformed linkhut response: bookmark url");
  }
  if (!description) {
    throw new ProviderRequestError(502, "malformed linkhut response: bookmark description");
  }
  if (!hash) {
    throw new ProviderRequestError(502, "malformed linkhut response: bookmark hash");
  }
  if (!time) {
    throw new ProviderRequestError(502, "malformed linkhut response: bookmark time");
  }

  return compactObject({
    url,
    hash,
    description,
    extended: optionalString(bookmark.extended),
    tags: optionalString(bookmark.tags),
    time,
    shared: parseLinkhutBoolean(bookmark.shared, "bookmark shared"),
    toread: parseLinkhutBoolean(bookmark.toread, "bookmark toread"),
    meta: bookmark.meta,
  });
}

function extractLinkhutPostsUser(xml: string): string {
  const start = xml.indexOf("<posts");
  if (start < 0) {
    throw new ProviderRequestError(502, "malformed linkhut response: posts root");
  }
  const tagEnd = xml.indexOf(">", start);
  if (tagEnd < 0) {
    throw new ProviderRequestError(502, "malformed linkhut response: posts root");
  }

  const rootTag = xml.slice(start, tagEnd);
  const attributeMarker = 'user="';
  const attributeStart = rootTag.indexOf(attributeMarker);
  if (attributeStart < 0) {
    throw new ProviderRequestError(502, "malformed linkhut response: posts user");
  }

  const valueStart = attributeStart + attributeMarker.length;
  const valueEnd = rootTag.indexOf('"', valueStart);
  if (valueEnd < 0) {
    throw new ProviderRequestError(502, "malformed linkhut response: posts user");
  }

  const username = rootTag.slice(valueStart, valueEnd);
  if (!username) {
    throw new ProviderRequestError(502, "malformed linkhut response: posts user");
  }
  return username;
}

function parseLinkhutBoolean(value: unknown, fieldName: string): boolean {
  if (value === true || value === "yes") {
    return true;
  }
  if (value === false || value === "no") {
    return false;
  }
  throw new ProviderRequestError(502, `malformed linkhut response: ${fieldName}`);
}

function toLinkhutFlag(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === true || value === "yes") {
    return "yes";
  }
  if (value === false || value === "no") {
    return "no";
  }
  return undefined;
}

function parseScopeString(value: unknown, fallbackScopes: string[]): string[] {
  const raw = optionalString(value);
  if (!raw) {
    return [...fallbackScopes];
  }
  return raw
    .split(" ")
    .map((scope) => scope.trim())
    .filter((scope, index, scopes) => scope.length > 0 && scopes.indexOf(scope) === index);
}

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `malformed linkhut response: ${fieldName}`);
  }
  return record;
}

function requiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function requiredInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value)) {
    throw new ProviderRequestError(502, `malformed linkhut response: ${fieldName}`);
  }
  return value as number;
}
