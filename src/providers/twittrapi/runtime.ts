import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import {
  optionalInteger,
  optionalRecord,
  optionalScalarString,
  optionalString,
  optionalStringArray,
  rawStringOrNull,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  parseProviderJsonBodyText,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requiredResponseRecord,
  runProviderRequest,
  setSearchParams,
} from "../provider-runtime.ts";

export const twittrapiApiBaseUrl = "https://api.twittrapi.com";

// The balance endpoint is free and identifies the key's account.
const twittrapiValidationPath = "/balance";

type TwittrapiActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type TwittrapiRequestPhase = "validate" | "execute";
type TwittrapiPageItemField = "tweets" | "users";

interface TwittrapiRequestContext {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface TwittrapiGetRequest {
  path: string;
  query?: Record<string, string | undefined>;
  /** Ask for the flat camelCase response format; the account endpoints do not have one. */
  simple?: boolean;
}

interface TwittrapiPage {
  nextCursor: string | null;
  previousCursor: string | null;
  hasNextPage: boolean;
  items: Record<string, unknown>[];
}

export const twittrapiActionHandlers: ProviderActionHandlers<"twittrapi", TwittrapiActionHandler> = {
  async search_tweets(input, context) {
    const payload = await getTwittrapiJson(
      {
        path: "/search",
        query: {
          searchItem: optionalString(input.query),
          category: optionalString(input.category),
          ...pageQuery(input),
        },
      },
      context,
    );
    return pageOutput(payload, "tweets");
  },
  async search_users(input, context) {
    const payload = await getTwittrapiJson(
      {
        path: "/search",
        query: { searchItem: optionalString(input.query), category: "People", ...pageQuery(input) },
      },
      context,
    );
    return pageOutput(payload, "users");
  },
  async get_tweet(input, context) {
    const payload = await getTwittrapiJson({ path: `/simpletweet/${encodePathSegment(input.tweetId)}` }, context);
    const tweet = readData(payload);
    return { tweet: tweet === null ? null : requiredResponseRecord(tweet, "TwittrAPI tweet") };
  },
  async get_tweet_conversation(input, context) {
    const payload = await getTwittrapiJson(
      {
        path: `/tweet/${encodePathSegment(input.tweetId)}`,
        query: { rankingMode: optionalString(input.rankingMode), cursor: optionalString(input.cursor) },
      },
      context,
    );
    return pageOutput(payload, "tweets");
  },
  async get_tweet_quotes(input, context) {
    const payload = await getTwittrapiJson(
      { path: `/tweet/${encodePathSegment(input.tweetId)}/quotes`, query: pageQuery(input) },
      context,
    );
    return pageOutput(payload, "tweets");
  },
  async get_tweet_retweeters(input, context) {
    const payload = await getTwittrapiJson(
      { path: `/tweet/${encodePathSegment(input.tweetId)}/retweets`, query: pageQuery(input) },
      context,
    );
    return pageOutput(payload, "users");
  },
  async get_user(input, context) {
    const userId = optionalString(input.userId);
    const username = optionalString(input.username);
    if (!userId && !username) {
      throw providerInputError("userId or username is required.");
    }
    const path = userId
      ? `/user/${encodePathSegment(userId)}`
      : `/user/by/username/${encodePathSegment(stripHandlePrefix(username!))}`;
    const payload = await getTwittrapiJson({ path }, context);
    const user = readData(payload);
    return { user: user === null ? null : requiredResponseRecord(user, "TwittrAPI user") };
  },
  async get_users_by_ids(input, context) {
    const payload = await getTwittrapiJson(
      { path: "/user/users/by/ids", query: { ids: optionalStringArray(input.userIds)?.join(",") } },
      context,
    );
    return { users: readTwittrapiPage(payload).items };
  },
  async get_user_tweets(input, context) {
    return pageOutput(await getUserCollection(input, "tweets", context), "tweets");
  },
  async get_user_tweets_and_replies(input, context) {
    return pageOutput(await getUserCollection(input, "tweetsAndReplies", context), "tweets");
  },
  async get_user_followers(input, context) {
    return pageOutput(await getUserCollection(input, "followers", context), "users");
  },
  async get_user_following(input, context) {
    return pageOutput(await getUserCollection(input, "followings", context), "users");
  },
  async get_list_tweets(input, context) {
    const payload = await getTwittrapiJson(
      { path: "/lists/tweets", query: { listId: optionalString(input.listId), ...pageQuery(input) } },
      context,
    );
    return pageOutput(payload, "tweets");
  },
  async get_community_tweets(input, context) {
    const payload = await getTwittrapiJson(
      { path: `/communities/${encodePathSegment(input.communityId)}/tweets`, query: pageQuery(input) },
      context,
    );
    return pageOutput(payload, "tweets");
  },
  async get_trends(input, context) {
    const woeid = optionalString(input.woeid) ?? "1";
    const payload = await getTwittrapiJson({ path: `/trends/${encodePathSegment(woeid)}` }, context);
    return { trends: readTwittrapiPage(payload).items };
  },
};

/**
 * Validate a TwittrAPI key against the free balance endpoint and report the
 * account it belongs to.
 */
export async function validateTwittrapiCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await getTwittrapiJson(
    { path: twittrapiValidationPath, simple: false },
    { apiKey, fetcher, signal },
    "validate",
  );
  const accountId = optionalScalarString(optionalRecord(payload)?.user_id);

  return {
    profile: {
      accountId: accountId ?? "api_key",
      displayName: "TwittrAPI API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: twittrapiApiBaseUrl,
      validationEndpoint: twittrapiValidationPath,
    },
  };
}

// Profile collections take a numeric user ID in the path. With only a handle,
// the API expects -1 there and the handle in the username query parameter.
async function getUserCollection(
  input: Record<string, unknown>,
  collection: "tweets" | "tweetsAndReplies" | "followers" | "followings",
  context: TwittrapiRequestContext,
): Promise<unknown> {
  const userId = optionalString(input.userId);
  const username = optionalString(input.username);
  if (!userId && !username) {
    throw providerInputError("userId or username is required.");
  }

  return getTwittrapiJson(
    {
      path: `/user/${encodePathSegment(userId ?? "-1")}/${collection}`,
      query: { username: userId ? undefined : stripHandlePrefix(username!), ...pageQuery(input) },
    },
    context,
  );
}

async function getTwittrapiJson(
  request: TwittrapiGetRequest,
  context: TwittrapiRequestContext,
  phase: TwittrapiRequestPhase = "execute",
): Promise<unknown> {
  const url = new URL(request.path, twittrapiApiBaseUrl);
  setSearchParams(url, { ...request.query, format: request.simple === false ? undefined : "simple" });

  return runProviderRequest({ signal: context.signal, label: "TwittrAPI" }, async (signal) => {
    const response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
      },
      signal,
    });
    const text = await readProviderTextBody(response, "TwittrAPI response", undefined, signal);
    if (!response.ok) {
      throw createTwittrapiError(response.status, parseErrorBody(text), phase);
    }

    return parseProviderJsonBodyText(text, {
      emptyBody: null,
      invalidJsonMessage: "TwittrAPI returned a response that is not valid JSON",
    });
  });
}

function parseErrorBody(text: string): unknown {
  return parseProviderJsonBodyText(text, {
    emptyBody: null,
    invalidJsonMessage: "TwittrAPI returned an error that is not valid JSON",
    invalidJsonFallback: (raw) => raw.trim().slice(0, 500),
  });
}

function createTwittrapiError(status: number, payload: unknown, phase: TwittrapiRequestPhase): ProviderRequestError {
  const message =
    optionalString(optionalRecord(payload)?.error) ??
    (typeof payload === "string" ? optionalString(payload) : undefined) ??
    `TwittrAPI request failed with status ${status}`;

  // An invalid, unknown, or deactivated key should surface as a field error on
  // the connect form rather than as a reconnect prompt.
  if (phase === "validate" && (status === 401 || status === 404)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 402) {
    return new ProviderRequestError(402, message, payload, "insufficient_credit");
  }

  return new ProviderRequestError(status || 500, message, payload, status === 429 ? "rate_limited" : "provider_error");
}

function readData(payload: unknown): unknown {
  const record = requiredResponseRecord(payload, "TwittrAPI response");
  if (!("data" in record)) {
    throw providerResponseError("TwittrAPI response is missing data.");
  }
  return record.data;
}

function readTwittrapiPage(payload: unknown): TwittrapiPage {
  const record = requiredResponseRecord(payload, "TwittrAPI response");
  if (!Array.isArray(record.data)) {
    throw providerResponseError("TwittrAPI response data must be an array.");
  }

  const nextCursor = rawStringOrNull(record.nextCursor);
  return {
    nextCursor,
    previousCursor: rawStringOrNull(record.previousCursor),
    hasNextPage: typeof record.hasNextPage === "boolean" ? record.hasNextPage : nextCursor !== null,
    items: record.data.map((item) => requiredResponseRecord(item, "TwittrAPI response item")),
  };
}

function pageOutput(payload: unknown, itemField: TwittrapiPageItemField): Record<string, unknown> {
  const page = readTwittrapiPage(payload);
  return {
    [itemField]: page.items,
    nextCursor: page.nextCursor,
    previousCursor: page.previousCursor,
    hasNextPage: page.hasNextPage,
  };
}

function pageQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  const count = optionalInteger(input.count);
  return {
    count: count === undefined ? undefined : String(count),
    cursor: optionalString(input.cursor),
  };
}

function stripHandlePrefix(username: string): string {
  return username.startsWith("@") ? username.slice(1) : username;
}
