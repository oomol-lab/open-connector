import type { ActionDefinition } from "../../core/types.ts";
import type { AisaActionRoute } from "./routes.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const twitterResearchActions: ActionDefinition[] = [
  defineProviderAction("aisa", {
    name: "get_twitter_article",
    description: "Read the full body of an X Article by its post ID.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read the full body of an X Article by its post ID.",
      {
        postId: s.string("The tweet ID of the article.", { minLength: 1 }),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The upstream public X data, including pagination, business status, and additional fields.",
      {
        article: s.looseObject("The returned article value."),
        msg: s.string("The returned msg value."),
        status: s.stringEnum("The returned status value.", ["success", "failed"]),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "search_twitter_community_posts",
    description: "Search public posts across X communities with latest or top ordering and cursor pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Search public posts across X communities with latest or top ordering and cursor pagination.",
      {
        cursor: s.string("Cursor for pagination"),
        query: s.string("Search query (e.g., keyword)", { minLength: 1 }),
        resultType: s.stringEnum("Whether to return Latest or Top community posts. Defaults to Latest.", [
          "Latest",
          "Top",
        ]),
      },
      { optional: ["cursor", "resultType"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public X data, including pagination, business status, and additional fields.",
      {
        has_next_page: s.boolean("The returned has next page value."),
        next_cursor: s.string("The returned next cursor value."),
        tweets: s.array("The returned tweets value.", s.looseObject("One returned entry.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_twitter_community",
    description: "Read an X community description, membership counts, and rules.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read an X community description, membership counts, and rules.",
      {
        communityId: s.string("ID of the community", { minLength: 1 }),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The upstream public X data, including pagination, business status, and additional fields.",
      {
        community_info: s.looseObject("The returned community info value."),
        msg: s.string("The returned msg value."),
        status: s.stringEnum("The returned status value.", ["success", "error"]),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_twitter_community_members",
    description: "List public members of an X community with cursor pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "List public members of an X community with cursor pagination.",
      {
        communityId: s.string("ID of the community", { minLength: 1 }),
        cursor: s.string("Cursor for pagination"),
      },
      { optional: ["cursor"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public X data, including pagination, business status, and additional fields.",
      {
        has_next: s.boolean("The returned has next value."),
        has_next_page: s.boolean("The returned has next page value."),
        members: s.array("The returned members value.", s.looseObject("One returned entry.")),
        msg: s.string("The returned msg value."),
        next_cursor: s.string("The returned next cursor value."),
        status: s.stringEnum("The returned status value.", ["success", "error"]),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_twitter_community_moderators",
    description: "List the moderators of an X community with cursor pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "List the moderators of an X community with cursor pagination.",
      {
        communityId: s.string("ID of the community", { minLength: 1 }),
        cursor: s.string("Cursor for pagination"),
      },
      { optional: ["cursor"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public X data, including pagination, business status, and additional fields.",
      {
        has_next: s.boolean("The returned has next value."),
        has_next_page: s.boolean("The returned has next page value."),
        members: s.array("The returned members value.", s.looseObject("One returned entry.")),
        msg: s.string("The returned msg value."),
        next_cursor: s.string("The returned next cursor value."),
        status: s.stringEnum("The returned status value.", ["success", "error"]),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_twitter_community_posts",
    description: "Read posts in a specific X community with cursor pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read posts in a specific X community with cursor pagination.",
      {
        communityId: s.string("ID of the community", { minLength: 1 }),
        cursor: s.string("Cursor for pagination"),
      },
      { optional: ["cursor"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public X data, including pagination, business status, and additional fields.",
      {
        has_next: s.boolean("The returned has next value."),
        has_next_page: s.boolean("The returned has next page value."),
        msg: s.string("The returned msg value."),
        next_cursor: s.string("The returned next cursor value."),
        status: s.stringEnum("The returned status value.", ["success", "error"]),
        tweets: s.array("The returned tweets value.", s.looseObject("One returned entry.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_twitter_list_followers",
    description: "List subscribers to an X List, distinct from the accounts included in the list.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "List subscribers to an X List, distinct from the accounts included in the list.",
      {
        cursor: s.string("Cursor of the page"),
        listId: s.string("ID of the list", { minLength: 1 }),
      },
      { optional: ["cursor"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public X data, including pagination, business status, and additional fields.",
      {
        followers: s.array("The returned followers value.", s.looseObject("One returned entry.")),
        has_next_page: s.boolean("The returned has next page value."),
        msg: s.string("The returned msg value."),
        next_cursor: s.string("The returned next cursor value."),
        status: s.stringEnum("The returned status value.", ["success", "error"]),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_twitter_list_members",
    description: "List accounts included in a public X List with cursor pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "List accounts included in a public X List with cursor pagination.",
      {
        cursor: s.string("Cursor of the page"),
        listId: s.string("ID of the list", { minLength: 1 }),
      },
      { optional: ["cursor"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public X data, including pagination, business status, and additional fields.",
      {
        has_next_page: s.boolean("The returned has next page value."),
        members: s.array("The returned members value.", s.looseObject("One returned entry.")),
        msg: s.string("The returned msg value."),
        next_cursor: s.string("The returned next cursor value."),
        status: s.stringEnum("The returned status value.", ["success", "error"]),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_twitter_list_posts",
    description: "Read the post timeline of a known public X List with cursor pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read the post timeline of a known public X List with cursor pagination.",
      {
        cursor: s.string("Cursor for paginating through results. Leave empty for the first page."),
        listId: s.string("The list ID to get tweets from. e.g. 1846987139428634858", {
          minLength: 1,
        }),
      },
      { optional: ["cursor"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public X data, including pagination, business status, and additional fields.",
      {
        has_next_page: s.boolean("The returned has next page value."),
        msg: s.string("The returned msg value."),
        next_cursor: s.string("The returned next cursor value."),
        status: s.stringEnum("The returned status value.", ["success", "error"]),
        tweets: s.array("The returned tweets value.", s.looseObject("One returned entry.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_twitter_post_quotes",
    description: "Read quote posts for an X post, with optional time bounds and reply inclusion.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read quote posts for an X post, with optional time bounds and reply inclusion.",
      {
        cursor: s.string("Cursor for pagination."),
        includeReplies: s.boolean("Whether to include replies in the results. Default is True."),
        sinceTimestamp: s.integer("On or after a specified unix timestamp in seconds.", {
          minimum: 0,
        }),
        postId: s.string("The tweet ID to get quotes for.", { minLength: 1 }),
        untilTimestamp: s.integer("Before a specified unix timestamp in seconds.", { minimum: 0 }),
      },
      { optional: ["cursor", "includeReplies", "sinceTimestamp", "untilTimestamp"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public X data, including pagination, business status, and additional fields.",
      {
        has_next_page: s.boolean("The returned has next page value."),
        msg: s.string("The returned msg value."),
        next_cursor: s.string("The returned next cursor value."),
        status: s.string("The returned status value."),
        tweets: s.array("The returned tweets value.", s.looseObject("One returned entry.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_twitter_sorted_replies",
    description: "Read replies to an X post ordered by relevance, recency, or likes.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read replies to an X post ordered by relevance, recency, or likes.",
      {
        cursor: s.string("Cursor for paginating through results. Leave empty for the first page."),
        resultType: s.stringEnum("Sort order for replies. Default is Relevance.", ["Relevance", "Latest", "Likes"]),
        postId: s.string("The tweet ID to get replies for. e.g. 1846987139428634858", {
          minLength: 1,
        }),
      },
      { optional: ["cursor", "resultType"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public X data, including pagination, business status, and additional fields.",
      {
        has_next_page: s.boolean("The returned has next page value."),
        msg: s.string("The returned msg value."),
        next_cursor: s.string("The returned next cursor value."),
        status: s.stringEnum("The returned status value.", ["success", "error"]),
        tweets: s.array("The returned tweets value.", s.looseObject("One returned entry.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_twitter_post_reposters",
    description: "List public accounts that reposted an X post, with cursor pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "List public accounts that reposted an X post, with cursor pagination.",
      {
        cursor: s.string("Cursor for pagination."),
        postId: s.string("The tweet ID to get retweeters for.", { minLength: 1 }),
      },
      { optional: ["cursor"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public X data, including pagination, business status, and additional fields.",
      {
        has_next_page: s.boolean("The returned has next page value."),
        msg: s.string("The returned msg value."),
        next_cursor: s.string("The returned next cursor value."),
        status: s.string("The returned status value."),
        users: s.array("The returned users value.", s.looseObject("One returned entry.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_twitter_follow_relationship",
    description: "Check the public follow relationship between two X usernames in both directions.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Check the public follow relationship between two X usernames in both directions.",
      {
        sourceUsername: s.string("Screen name of the source user.", { minLength: 1 }),
        targetUsername: s.string("Screen name of the target user.", { minLength: 1 }),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The upstream public X data, including pagination, business status, and additional fields.",
      {
        data: s.looseObject("The returned data value."),
        message: s.string("The returned message value."),
        status: s.stringEnum("The returned status value.", ["success", "error"]),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_twitter_user_followers",
    description: "List public followers of an X username with cursor pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "List public followers of an X username with cursor pagination.",
      {
        cursor: s.string("Cursor for pagination"),
        pageSize: s.integer("Number of followers per page", { maximum: 200, minimum: 20 }),
        username: s.string("Screen name of the user", { minLength: 1 }),
      },
      { optional: ["cursor", "pageSize"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public X data, including pagination, business status, and additional fields.",
      {
        code: s.integer("The returned code value."),
        followers: s.array("The returned followers value.", s.looseObject("One returned entry.")),
        has_next_page: s.boolean("The returned has next page value."),
        msg: s.string("The returned msg value."),
        next_cursor: s.nullable(s.string("The returned next cursor value.")),
        status: s.stringEnum("The returned status value.", ["success", "error"]),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_twitter_user_followings",
    description: "List accounts followed by an X username with cursor pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "List accounts followed by an X username with cursor pagination.",
      {
        cursor: s.string("The cursor to paginate through the results. First page is empty."),
        pageSize: s.integer("The number of followings to return per page.", {
          maximum: 200,
          minimum: 20,
        }),
        username: s.string("Screen name of the user.", { minLength: 1 }),
      },
      { optional: ["cursor", "pageSize"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public X data, including pagination, business status, and additional fields.",
      {
        code: s.integer("The returned code value."),
        followings: s.array("The returned followings value.", s.looseObject("One returned entry.")),
        has_next_page: s.boolean("The returned has next page value."),
        msg: s.string("The returned msg value."),
        next_cursor: s.string("The returned next cursor value."),
        status: s.stringEnum("The returned status value.", ["success", "error"]),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "search_twitter_users",
    description: "Find public X profiles by keyword with cursor pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Find public X profiles by keyword with cursor pagination.",
      {
        cursor: s.string("The cursor to paginate through the results. First page is empty."),
        query: s.string("The keyword to search.", { minLength: 1 }),
      },
      { optional: ["cursor"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public X data, including pagination, business status, and additional fields.",
      {
        has_next_page: s.boolean("The returned has next page value."),
        msg: s.string("The returned msg value."),
        next_cursor: s.string("The returned next cursor value."),
        status: s.stringEnum("The returned status value.", ["success", "error"]),
        users: s.array("The returned users value.", s.looseObject("One returned entry.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_twitter_verified_followers",
    description: "List verified accounts following an X user ID with cursor pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "List verified accounts following an X user ID with cursor pagination.",
      {
        cursor: s.string("The cursor to paginate through the results. First page is empty."),
        userId: s.string("User ID of the user.", { minLength: 1 }),
      },
      { optional: ["cursor"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public X data, including pagination, business status, and additional fields.",
      {
        code: s.integer("The returned code value."),
        followers: s.array("The returned followers value.", s.looseObject("One returned entry.")),
        has_next_page: s.boolean("The returned has next page value."),
        msg: s.string("The returned msg value."),
        next_cursor: s.nullable(s.string("The returned next cursor value.")),
        status: s.stringEnum("The returned status value.", ["success", "error"]),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_twitter_user_about",
    description: "Read the public About this account panel, including available location and username-change metadata.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read the public About this account panel, including available location and username-change metadata.",
      {
        username: s.string("The screen name of the user", { minLength: 1 }),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The upstream public X data, including pagination, business status, and additional fields.",
      {
        data: s.looseObject("The returned data value."),
        msg: s.string("The returned msg value."),
        status: s.stringEnum("The returned status value.", ["success", "error"]),
      },
      { required: [] },
    ),
  }),
];

export const twitterResearchRoutes: Record<string, AisaActionRoute> = {
  get_twitter_article: {
    path: "/apis/v1/twitter/article",
    query: {
      postId: "tweet_id",
    },
  },
  search_twitter_community_posts: {
    path: "/apis/v1/twitter/community/get_tweets_from_all_community",
    query: {
      cursor: "cursor",
      query: "query",
      resultType: "queryType",
    },
    fixedQuery: {
      queryType: "Latest",
    },
  },
  get_twitter_community: {
    path: "/apis/v1/twitter/community/info",
    query: {
      communityId: "community_id",
    },
  },
  get_twitter_community_members: {
    path: "/apis/v1/twitter/community/members",
    query: {
      communityId: "community_id",
      cursor: "cursor",
    },
  },
  get_twitter_community_moderators: {
    path: "/apis/v1/twitter/community/moderators",
    query: {
      communityId: "community_id",
      cursor: "cursor",
    },
  },
  get_twitter_community_posts: {
    path: "/apis/v1/twitter/community/tweets",
    query: {
      communityId: "community_id",
      cursor: "cursor",
    },
  },
  get_twitter_list_followers: {
    path: "/apis/v1/twitter/list/followers",
    query: {
      cursor: "cursor",
      listId: "list_id",
    },
  },
  get_twitter_list_members: {
    path: "/apis/v1/twitter/list/members",
    query: {
      cursor: "cursor",
      listId: "list_id",
    },
  },
  get_twitter_list_posts: {
    path: "/apis/v1/twitter/list/tweets_timeline",
    query: {
      cursor: "cursor",
      listId: "listId",
    },
  },
  get_twitter_post_quotes: {
    path: "/apis/v1/twitter/tweet/quotes",
    query: {
      cursor: "cursor",
      includeReplies: "includeReplies",
      sinceTimestamp: "sinceTime",
      postId: "tweetId",
      untilTimestamp: "untilTime",
    },
  },
  get_twitter_sorted_replies: {
    path: "/apis/v1/twitter/tweet/replies/v2",
    query: {
      cursor: "cursor",
      resultType: "queryType",
      postId: "tweetId",
    },
  },
  get_twitter_post_reposters: {
    path: "/apis/v1/twitter/tweet/retweeters",
    query: {
      cursor: "cursor",
      postId: "tweetId",
    },
  },
  get_twitter_follow_relationship: {
    path: "/apis/v1/twitter/user/check_follow_relationship",
    query: {
      sourceUsername: "source_user_name",
      targetUsername: "target_user_name",
    },
  },
  get_twitter_user_followers: {
    path: "/apis/v1/twitter/user/followers",
    query: {
      cursor: "cursor",
      pageSize: "pageSize",
      username: "userName",
    },
  },
  get_twitter_user_followings: {
    path: "/apis/v1/twitter/user/followings",
    query: {
      cursor: "cursor",
      pageSize: "pageSize",
      username: "userName",
    },
  },
  search_twitter_users: {
    path: "/apis/v1/twitter/user/search",
    query: {
      cursor: "cursor",
      query: "query",
    },
  },
  get_twitter_verified_followers: {
    path: "/apis/v1/twitter/user/verifiedFollowers",
    query: {
      cursor: "cursor",
      userId: "user_id",
    },
  },
  get_twitter_user_about: {
    path: "/apis/v1/twitter/user_about",
    query: {
      username: "userName",
    },
  },
};
