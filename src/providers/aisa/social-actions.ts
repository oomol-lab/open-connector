import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aisa";
const socialOutput = s.looseObject("The public Twitter data returned by AIsa.");
const cursor = s.string("The cursor returned by the previous page.");
const getTwitterUserAction = defineProviderAction(service, {
  name: "get_twitter_user",
  operationType: "read",
  description: "Get a public Twitter profile by username through AIsa.",
  requiredScopes: [],
  inputSchema: s.object(
    "A Twitter username for public profile lookup.",
    {
      username: s.string("The Twitter username without the @ prefix."),
    },
    { optional: [] },
  ),
  outputSchema: socialOutput,
});
const getTwitterUsersAction = defineProviderAction(service, {
  name: "get_twitter_users",
  operationType: "read",
  description: "Get public Twitter profiles for multiple user IDs.",
  requiredScopes: [],
  inputSchema: s.object(
    "Twitter user IDs for a batch profile lookup.",
    {
      userIds: s.array("The Twitter user IDs to retrieve.", s.string("A Twitter user ID."), {
        minItems: 1,
        uniqueItems: true,
      }),
    },
    { optional: [] },
  ),
  outputSchema: socialOutput,
});
const searchTwitterPostsAction = defineProviderAction(service, {
  name: "search_twitter_posts",
  operationType: "read",
  description: "Search public Twitter posts using X query syntax and cursor pagination.",
  requiredScopes: [],
  inputSchema: s.object(
    "A Twitter search expression, result ordering, and optional cursor.",
    {
      query: s.string("The search expression using supported X query operators."),
      resultType: s.stringEnum("Whether to return recent or top results.", ["Latest", "Top"]),
      cursor,
    },
    { optional: ["cursor"] },
  ),
  outputSchema: socialOutput,
});
const getTwitterPostsAction = defineProviderAction(service, {
  name: "get_twitter_posts",
  operationType: "read",
  description: "Get public Twitter posts by their IDs.",
  requiredScopes: [],
  inputSchema: s.object(
    "Twitter post IDs for a batch lookup.",
    {
      postIds: s.array("The Twitter post IDs to retrieve.", s.string("A Twitter post ID."), {
        minItems: 1,
        uniqueItems: true,
      }),
    },
    { optional: [] },
  ),
  outputSchema: socialOutput,
});
const getTwitterUserTimelineAction = defineProviderAction(service, {
  name: "get_twitter_user_timeline",
  operationType: "read",
  description: "Get a public Twitter user's post timeline.",
  requiredScopes: [],
  inputSchema: s.object(
    "A Twitter user ID and timeline expansion controls.",
    {
      userId: s.string("The Twitter user ID whose timeline should be returned."),
      includeReplies: s.boolean("Whether to include replies."),
      includeParentPost: s.boolean("Whether to include parent posts for replies."),
      cursor,
    },
    { optional: ["includeReplies", "includeParentPost", "cursor"] },
  ),
  outputSchema: socialOutput,
});
const getTwitterUserRecentPostsAction = defineProviderAction(service, {
  name: "get_twitter_user_recent_posts",
  operationType: "read",
  description: "Get a public Twitter user's most recent posts by ID or username.",
  requiredScopes: [],
  inputSchema: s.requireAnyProperty(
    s.object(
      "A Twitter user identity and optional recent-post filters.",
      {
        userId: s.string("The Twitter user ID; omit when using username."),
        username: s.string("The Twitter username; omit when using userId."),
        includeReplies: s.boolean("Whether to include replies."),
        cursor,
      },
      { optional: ["userId", "username", "includeReplies", "cursor"] },
    ),
    ["userId", "username"],
  ),
  outputSchema: socialOutput,
});
const getTwitterMentionsAction = defineProviderAction(service, {
  name: "get_twitter_mentions",
  operationType: "read",
  description: "Get public posts mentioning a Twitter username in an optional time window.",
  requiredScopes: [],
  inputSchema: s.object(
    "A Twitter username, optional Unix-time window, and cursor.",
    {
      username: s.string("The mentioned Twitter username without the @ prefix."),
      sinceTimestamp: s.integer("Return mentions at or after this Unix timestamp."),
      untilTimestamp: s.integer("Return mentions before this Unix timestamp."),
      cursor,
    },
    { optional: ["sinceTimestamp", "untilTimestamp", "cursor"] },
  ),
  outputSchema: socialOutput,
});
const getTwitterPostRepliesAction = defineProviderAction(service, {
  name: "get_twitter_post_replies",
  operationType: "read",
  description: "List public replies to a Twitter post.",
  requiredScopes: [],
  inputSchema: s.object(
    "A Twitter post ID and optional pagination cursor.",
    { postId: s.string("The Twitter post ID whose replies should be returned."), cursor },
    { optional: ["cursor"] },
  ),
  outputSchema: socialOutput,
});
const getTwitterThreadAction = defineProviderAction(service, {
  name: "get_twitter_thread",
  operationType: "read",
  description: "Get the public conversation context surrounding a Twitter post.",
  requiredScopes: [],
  inputSchema: s.object(
    "A Twitter post ID and optional pagination cursor.",
    { postId: s.string("The Twitter post ID whose thread context should be returned."), cursor },
    { optional: ["cursor"] },
  ),
  outputSchema: socialOutput,
});
const getTwitterTrendsAction = defineProviderAction(service, {
  name: "get_twitter_trends",
  operationType: "read",
  description: "Get public Twitter trends for a Where On Earth location.",
  requiredScopes: [],
  inputSchema: s.object(
    "A WOEID and optional result limit for Twitter trends.",
    {
      woeid: s.integer("The Where On Earth ID for the target location."),
      count: s.integer("The maximum number of trends to return.", { minimum: 30 }),
    },
    { optional: ["count"] },
  ),
  outputSchema: socialOutput,
});
export const socialActions: readonly ActionDefinition[] = [
  getTwitterUserAction,
  getTwitterUsersAction,
  searchTwitterPostsAction,
  getTwitterPostsAction,
  getTwitterUserTimelineAction,
  getTwitterUserRecentPostsAction,
  getTwitterMentionsAction,
  getTwitterPostRepliesAction,
  getTwitterThreadAction,
  getTwitterTrendsAction,
];
