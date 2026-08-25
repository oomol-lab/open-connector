import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const twitterapiIoApiBaseUrl = "https://api.twitterapi.io";

type TwitterApiIoActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const twitterapiIoActionHandlers: ProviderActionHandlers<"twitterapi_io", TwitterApiIoActionHandler> = {
  get_account_info(_input, context) {
    return requestTwitterApiIo({
      path: "/oapi/my/info",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  get_user(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/user/info",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [["userName", input.userName]],
      signal: context.signal,
    });
  },
  get_user_about(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/user_about",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [["userName", input.userName]],
      signal: context.signal,
    });
  },
  batch_get_users(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/user/batch_info_by_ids",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [["userIds", joinStringArray(input.userIds)]],
      signal: context.signal,
    });
  },
  search_users(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/user/search",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [
        ["query", input.query],
        ["cursor", input.cursor],
      ],
      signal: context.signal,
    });
  },
  get_user_last_tweets(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/user/last_tweets",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: userTimelineQuery(input),
      signal: context.signal,
    });
  },
  get_user_timeline(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/user/tweet_timeline",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [
        ["userId", input.userId],
        ["includeReplies", input.includeReplies],
        ["includeParentTweet", input.includeParentTweet],
        ["cursor", input.cursor],
      ],
      signal: context.signal,
    });
  },
  get_user_mentions(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/user/mentions",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [
        ["userName", input.userName],
        ["sinceTime", input.sinceTime],
        ["untilTime", input.untilTime],
        ["cursor", input.cursor],
      ],
      signal: context.signal,
    });
  },
  get_tweets(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/tweets",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [["tweet_ids", joinStringArray(input.tweetIds)]],
      signal: context.signal,
    });
  },
  get_article(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/article",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [["tweet_id", input.tweetId]],
      signal: context.signal,
    });
  },
  advanced_search_tweets(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/tweet/advanced_search",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [
        ["query", input.query],
        ["queryType", input.queryType],
        ["cursor", input.cursor],
      ],
      signal: context.signal,
    });
  },
  get_tweet_replies_legacy(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/tweet/replies",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [
        ["tweetId", input.tweetId],
        ["sinceTime", input.sinceTime],
        ["untilTime", input.untilTime],
        ["cursor", input.cursor],
      ],
      signal: context.signal,
    });
  },
  get_tweet_replies(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/tweet/replies/v2",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [
        ["tweetId", input.tweetId],
        ["cursor", input.cursor],
        ["queryType", input.queryType],
      ],
      signal: context.signal,
    });
  },
  get_tweet_quotes(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/tweet/quotes",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: timedTweetCollectionQuery(input),
      signal: context.signal,
    });
  },
  get_tweet_retweeters(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/tweet/retweeters",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [
        ["tweetId", input.tweetId],
        ["cursor", input.cursor],
      ],
      signal: context.signal,
    });
  },
  get_tweet_thread_context(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/tweet/thread_context",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [
        ["tweetId", input.tweetId],
        ["cursor", input.cursor],
      ],
      signal: context.signal,
    });
  },
  get_user_followers(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/user/followers",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: pagedUserNameQuery(input),
      signal: context.signal,
    });
  },
  get_user_follower_ids(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/user/followers_ids",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [
        ["userName", input.userName],
        ["userId", input.userId],
        ["count", input.count],
        ["cursor", input.cursor],
      ],
      signal: context.signal,
    });
  },
  get_user_verified_followers(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/user/verifiedFollowers",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [
        ["user_id", input.userId],
        ["cursor", input.cursor],
      ],
      signal: context.signal,
    });
  },
  get_user_followings(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/user/followings",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: pagedUserNameQuery(input),
      signal: context.signal,
    });
  },
  check_follow_relationship(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/user/check_follow_relationship",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [
        ["source_user_name", input.sourceUserName],
        ["target_user_name", input.targetUserName],
      ],
      signal: context.signal,
    });
  },
  get_list_tweets(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/list/tweets",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [
        ["listId", input.listId],
        ["sinceTime", input.sinceTime],
        ["untilTime", input.untilTime],
        ["includeReplies", input.includeReplies],
        ["cursor", input.cursor],
      ],
      signal: context.signal,
    });
  },
  get_list_timeline(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/list/tweets_timeline",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [
        ["listId", input.listId],
        ["cursor", input.cursor],
      ],
      signal: context.signal,
    });
  },
  get_list_members(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/list/members",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: listUsersQuery(input),
      signal: context.signal,
    });
  },
  get_list_followers(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/list/followers",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: listUsersQuery(input),
      signal: context.signal,
    });
  },
  search_all_community_tweets(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/community/get_tweets_from_all_community",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [
        ["query", input.query],
        ["queryType", input.queryType],
        ["cursor", input.cursor],
      ],
      signal: context.signal,
    });
  },
  get_community_info(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/community/info",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [["community_id", input.communityId]],
      signal: context.signal,
    });
  },
  get_community_members(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/community/members",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: communityPageQuery(input),
      signal: context.signal,
    });
  },
  get_community_moderators(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/community/moderators",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: communityPageQuery(input),
      signal: context.signal,
    });
  },
  get_community_tweets(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/community/tweets",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: communityPageQuery(input),
      signal: context.signal,
    });
  },
  get_trends(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/trends",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [
        ["woeid", input.woeid],
        ["count", input.count],
      ],
      signal: context.signal,
    });
  },
  get_space(input, context) {
    return requestTwitterApiIo({
      path: "/twitter/spaces/detail",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: [["space_id", input.spaceId]],
      signal: context.signal,
    });
  },
  list_tweet_filter_rules(_input, context) {
    return requestTwitterApiIo({
      path: "/oapi/tweet_filter/get_rules",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  add_tweet_filter_rule(input, context) {
    return requestTwitterApiIo({
      path: "/oapi/tweet_filter/add_rule",
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      body: {
        tag: input.tag,
        value: input.value,
        interval_seconds: input.intervalSeconds,
      },
      signal: context.signal,
    });
  },
  update_tweet_filter_rule(input, context) {
    return requestTwitterApiIo({
      path: "/oapi/tweet_filter/update_rule",
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      body: {
        rule_id: input.ruleId,
        tag: input.tag,
        value: input.value,
        interval_seconds: input.intervalSeconds,
        is_effect: input.isEffect,
      },
      signal: context.signal,
    });
  },
  delete_tweet_filter_rule(input, context) {
    return requestTwitterApiIo({
      path: "/oapi/tweet_filter/delete_rule",
      method: "DELETE",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      body: {
        rule_id: input.ruleId,
      },
      signal: context.signal,
    });
  },
  list_monitored_tweet_users(_input, context) {
    return requestTwitterApiIo({
      path: "/oapi/x_user_stream/get_user_to_monitor_tweet",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  add_monitored_tweet_user(input, context) {
    return requestTwitterApiIo({
      path: "/oapi/x_user_stream/add_user_to_monitor_tweet",
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      body: {
        x_user_name: input.xUserName,
      },
      signal: context.signal,
    });
  },
  remove_monitored_tweet_user(input, context) {
    return requestTwitterApiIo({
      path: "/oapi/x_user_stream/remove_user_to_monitor_tweet",
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      body: {
        id_for_user: input.idForUser,
      },
      signal: context.signal,
    });
  },
};

export async function validateTwitterApiIoCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<{
  profile: {
    accountId: string;
    displayName: string;
    grantedScopes: string[];
  };
  metadata: Record<string, unknown>;
}> {
  const payload = await requestTwitterApiIo({
    path: "/oapi/my/info",
    apiKey,
    fetcher,
    signal,
  });

  const rechargeCredits = typeof payload.recharge_credits === "number" ? payload.recharge_credits : undefined;
  return {
    profile: {
      accountId: "twitterapi_io",
      displayName: "TwitterAPI.io API Key",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: twitterapiIoApiBaseUrl,
      validationEndpoint: "/oapi/my/info",
      rechargeCredits,
    }),
  };
}

function userTimelineQuery(input: Record<string, unknown>): Array<[string, unknown]> {
  return [
    ["userId", input.userId],
    ["userName", input.userName],
    ["cursor", input.cursor],
    ["includeReplies", input.includeReplies],
  ];
}

function timedTweetCollectionQuery(input: Record<string, unknown>): Array<[string, unknown]> {
  return [
    ["tweetId", input.tweetId],
    ["sinceTime", input.sinceTime],
    ["untilTime", input.untilTime],
    ["includeReplies", input.includeReplies],
    ["cursor", input.cursor],
  ];
}

function pagedUserNameQuery(input: Record<string, unknown>): Array<[string, unknown]> {
  return [
    ["userName", input.userName],
    ["cursor", input.cursor],
    ["pageSize", input.pageSize],
  ];
}

function listUsersQuery(input: Record<string, unknown>): Array<[string, unknown]> {
  return [
    ["list_id", input.listId],
    ["cursor", input.cursor],
  ];
}

function communityPageQuery(input: Record<string, unknown>): Array<[string, unknown]> {
  return [
    ["community_id", input.communityId],
    ["cursor", input.cursor],
  ];
}

async function requestTwitterApiIo(input: {
  path: string;
  method?: "GET" | "POST" | "DELETE";
  apiKey: string;
  fetcher: ProviderFetch;
  query?: Array<[string, unknown]>;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const url = new URL(`${twitterapiIoApiBaseUrl}${input.path}`);
  for (const [key, value] of input.query ?? []) {
    appendQueryValue(url, key, value);
  }
  const method = input.method ?? "GET";
  const body = input.body ? compactObject(input.body) : undefined;
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": input.apiKey,
  };
  if (body) {
    headers["content-type"] = "application/json";
  }

  const response = await input.fetcher(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: input.signal,
  });

  const payload = await readTwitterApiIoJson(response);
  const providerError = readTwitterApiIoError(payload);
  if (providerError) {
    throw providerError;
  }

  if (!response.ok) {
    const status = response.status || 500;
    throw new ProviderRequestError(
      status === 429 ? 429 : status,
      buildTwitterApiIoHttpErrorMessage(response.status, payload),
      payload,
    );
  }

  return payload;
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  url.searchParams.set(key, String(value));
}

function joinStringArray(value: unknown): unknown {
  return Array.isArray(value) ? value.join(",") : value;
}

async function readTwitterApiIoJson(response: Response): Promise<Record<string, unknown>> {
  const rawBody = await response.text();
  if (!rawBody) {
    return {};
  }

  try {
    const payload = JSON.parse(rawBody) as unknown;
    return optionalRecord(payload) ?? {};
  } catch (error) {
    const status = response.status === 429 ? 429 : 502;
    const bodySnippet = rawBody.trim().slice(0, 200);
    throw new ProviderRequestError(
      status,
      buildTwitterApiIoInvalidJsonMessage(response.status, rawBody, error instanceof Error ? error.message : undefined),
      { rawBody: bodySnippet },
    );
  }
}

function readTwitterApiIoError(payload: Record<string, unknown>): ProviderRequestError | null {
  const status = payload.status;
  if (status !== "error" && status !== "failed") {
    return null;
  }

  const message = optionalString(payload.msg) ?? optionalString(payload.message) ?? "twitterapi.io request failed";
  const normalizedMessage = message.toLowerCase();
  if (
    normalizedMessage.includes("api key") ||
    normalizedMessage.includes("apikey") ||
    normalizedMessage.includes("unauthorized") ||
    normalizedMessage.includes("invalid key")
  ) {
    return new ProviderRequestError(400, message, payload);
  }
  if (normalizedMessage.includes("rate limit") || normalizedMessage.includes("too many")) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(500, message, payload);
}

function buildTwitterApiIoHttpErrorMessage(status: number, payload: Record<string, unknown>): string {
  const message =
    optionalString(payload.msg) ??
    optionalString(payload.message) ??
    JSON.stringify(compactObject(payload)).slice(0, 200);
  return message
    ? `twitterapi.io request failed with ${status}: ${message}`
    : `twitterapi.io request failed with ${status}`;
}

function buildTwitterApiIoInvalidJsonMessage(status: number, rawBody: string, parseErrorMessage?: string): string {
  const bodySnippet = rawBody.trim().slice(0, 200);
  const parts = [`twitterapi.io request failed with ${status}`];

  if (parseErrorMessage) {
    parts.push(`invalid JSON response: ${parseErrorMessage}`);
  }
  if (bodySnippet) {
    parts.push(`body: ${bodySnippet}`);
  }

  return parts.join("; ");
}
