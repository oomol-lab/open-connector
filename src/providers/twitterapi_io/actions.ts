import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "twitterapi_io" as const;

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const cursor = s.string("The pagination cursor. Use an empty string or omit it for the first page.");
const tweetId = nonEmptyString("The Tweet ID.");
const userName = nonEmptyString("The X screen name without the @ prefix.");
const userId = nonEmptyString("The numeric X user ID, passed as a string to preserve precision.");
const unixTime = s.integer("A Unix timestamp in seconds.");
const queryType = s.stringEnum("The search result ordering.", ["Latest", "Top"]);
const replyQueryType = s.stringEnum("The reply result ordering.", ["Relevance", "Latest", "Likes"]);
const rawObject = s.looseObject("Additional upstream fields returned by twitterapi.io.");
const tweetFilterRuleId = nonEmptyString("The twitterapi.io tweet filter rule ID.");
const tweetFilterRuleTag = s.string("A custom tag that identifies the tweet filter rule.", {
  minLength: 1,
  maxLength: 255,
});
const tweetFilterRuleValue = s.string("The Twitter search rule used to filter Tweets.", {
  minLength: 1,
  maxLength: 255,
});
const tweetFilterRuleIntervalSeconds = s.number("The interval, in seconds, used to check matching Tweets.", {
  minimum: 0.05,
  maximum: 86400,
});
const monitorUserEntryId = nonEmptyString("The twitterapi.io monitor entry ID returned by list_monitored_tweet_users.");

const userSchema = s.looseObject("A twitterapi.io user object.", {
  type: s.string("The upstream object type."),
  id: s.string("The unique identifier of the user."),
  userName: s.string("The X screen name of the user."),
  name: s.string("The display name of the user."),
  url: s.string("The x.com profile URL."),
  description: s.string("The user's profile description."),
  location: s.string("The user's self-declared location."),
  profilePicture: s.string("The URL of the user's profile image."),
  coverPicture: s.string("The URL of the user's cover image."),
  followers: s.integer("The number of followers."),
  following: s.integer("The number of accounts followed by the user."),
  isBlueVerified: s.boolean("Whether the user has X Blue verification."),
  verifiedType: s.string("The verification type, when present."),
  canDm: s.boolean("Whether the user can receive direct messages."),
  createdAt: s.string("The upstream account creation timestamp."),
  favouritesCount: s.integer("The number of favorites."),
  mediaCount: s.integer("The number of media posts."),
  statusesCount: s.integer("The number of status updates."),
  unavailable: s.boolean("Whether the account is unavailable."),
  unavailableReason: s.string("The reason the account is unavailable."),
});

const tweetSchema = s.looseObject("A twitterapi.io Tweet object.", {
  type: s.string("The upstream object type."),
  id: s.string("The unique identifier of the Tweet."),
  url: s.string("The x.com URL of the Tweet."),
  text: s.string("The text content of the Tweet."),
  source: s.string("The client or source that posted the Tweet."),
  retweetCount: s.integer("The number of retweets."),
  replyCount: s.integer("The number of replies."),
  likeCount: s.integer("The number of likes."),
  quoteCount: s.integer("The number of quotes."),
  viewCount: s.integer("The number of views."),
  bookmarkCount: s.integer("The number of bookmarks."),
  createdAt: s.string("The upstream Tweet creation timestamp."),
  lang: s.string("The language code of the Tweet."),
  isReply: s.boolean("Whether the Tweet is a reply."),
  inReplyToId: s.string("The Tweet ID being replied to."),
  conversationId: s.string("The conversation ID."),
  inReplyToUserId: s.string("The user ID being replied to."),
  inReplyToUsername: s.string("The screen name being replied to."),
  author: userSchema,
  entities: rawObject,
  quoted_tweet: s.nullable(rawObject),
  retweeted_tweet: s.nullable(rawObject),
});

const statusFields = {
  status: s.string("The upstream request status."),
  message: s.string("The upstream status or error message."),
  msg: s.string("The upstream status or error message."),
};

const paginationFields = {
  has_next_page: s.boolean("Whether another page is available."),
  next_cursor: s.string("The cursor to pass to the next request."),
};

const accountInfoOutputSchema = s.object(
  "Remaining twitterapi.io account credit information.",
  {
    recharge_credits: s.integer("The remaining recharge credits for the API key."),
  },
  { optional: ["recharge_credits"] },
);

const getUserInputSchema = s.object("Input for retrieving a user profile by screen name.", {
  userName,
});

const getUserOutputSchema = s.object(
  "twitterapi.io response containing a single user profile.",
  {
    data: userSchema,
    ...statusFields,
  },
  { optional: ["data", "status", "msg", "message"] },
);

const getUserAboutOutputSchema = s.object(
  "twitterapi.io response containing a user's About profile information.",
  {
    data: rawObject,
    ...statusFields,
  },
  { optional: ["data", "status", "msg", "message"] },
);

const batchGetUsersInputSchema = s.object("Input for retrieving multiple users by X user IDs.", {
  userIds: s.array("The X user IDs to retrieve.", userId, { minItems: 1 }),
});

const usersOutputSchema = s.object(
  "twitterapi.io response containing user objects.",
  {
    users: s.array("The users returned by the endpoint.", userSchema),
    ...paginationFields,
    ...statusFields,
  },
  { optional: ["users", "has_next_page", "next_cursor", "status", "msg", "message"] },
);

const searchUsersInputSchema = s.object(
  "Input for searching X users by keyword.",
  {
    query: nonEmptyString("The keyword to search for."),
    cursor,
  },
  { optional: ["cursor"] },
);

const userTimelineInputSchema = {
  ...s.object(
    "Input for retrieving a user's tweets by user ID or screen name.",
    {
      userId,
      userName,
      cursor,
      includeReplies: s.boolean("Whether to include replies in the returned tweets."),
    },
    { optional: ["userId", "userName", "cursor", "includeReplies"] },
  ),
  anyOf: [{ required: ["userId"] }, { required: ["userName"] }],
};

const userIdTimelineInputSchema = s.object(
  "Input for retrieving a user's profile timeline by user ID.",
  {
    userId,
    cursor,
    includeReplies: s.boolean("Whether to include replies in the returned tweets."),
    includeParentTweet: s.boolean("Whether to include the parent Tweet when a Tweet is a reply."),
  },
  { optional: ["cursor", "includeReplies", "includeParentTweet"] },
);

const tweetPageOutputSchema = s.object(
  "twitterapi.io response containing Tweet objects and pagination metadata.",
  {
    tweets: s.array("The Tweets returned by the endpoint.", tweetSchema),
    ...paginationFields,
    ...statusFields,
  },
  { optional: ["tweets", "has_next_page", "next_cursor", "status", "msg", "message"] },
);

const getTweetsInputSchema = s.object("Input for retrieving Tweets by ID.", {
  tweetIds: s.array("The Tweet IDs to retrieve.", tweetId, { minItems: 1 }),
});

const getArticleInputSchema = s.object("Input for retrieving an X article by Tweet ID.", {
  tweetId,
});

const articleOutputSchema = s.object(
  "twitterapi.io response containing an X article.",
  {
    article: rawObject,
    ...statusFields,
  },
  { optional: ["article", "status", "msg", "message"] },
);

const tweetRepliesLegacyInputSchema = s.object(
  "Input for retrieving replies to an original Tweet with the legacy replies endpoint.",
  {
    tweetId,
    sinceTime: unixTime,
    untilTime: unixTime,
    cursor,
  },
  { optional: ["sinceTime", "untilTime", "cursor"] },
);

const tweetRepliesInputSchema = s.object(
  "Input for retrieving replies to a Tweet.",
  {
    tweetId,
    cursor,
    queryType: replyQueryType,
  },
  { optional: ["cursor", "queryType"] },
);

const tweetThreadInputSchema = s.object(
  "Input for retrieving the conversation context around a Tweet.",
  {
    tweetId,
    cursor,
  },
  { optional: ["cursor"] },
);

const repliesOutputSchema = s.object(
  "twitterapi.io response containing reply Tweets and pagination metadata.",
  {
    replies: s.array("The reply Tweets returned by the endpoint.", tweetSchema),
    ...paginationFields,
    ...statusFields,
  },
  { optional: ["replies", "has_next_page", "next_cursor", "status", "msg", "message"] },
);

const timedTweetPageInputSchema = s.object(
  "Input for retrieving a paginated Tweet collection with optional time bounds.",
  {
    tweetId,
    sinceTime: unixTime,
    untilTime: unixTime,
    includeReplies: s.boolean("Whether to include replies in the returned Tweets."),
    cursor,
  },
  { optional: ["sinceTime", "untilTime", "includeReplies", "cursor"] },
);

const advancedSearchInputSchema = s.object(
  "Input for advanced Tweet search.",
  {
    query: nonEmptyString("The advanced search query."),
    queryType,
    cursor,
  },
  { optional: ["cursor"] },
);

const mentionsInputSchema = s.object(
  "Input for retrieving Tweets that mention a user.",
  {
    userName,
    sinceTime: unixTime,
    untilTime: unixTime,
    cursor,
  },
  { optional: ["sinceTime", "untilTime", "cursor"] },
);

const retweetersInputSchema = s.object(
  "Input for retrieving users who retweeted a Tweet.",
  {
    tweetId,
    cursor,
  },
  { optional: ["cursor"] },
);

const followersInputSchema = s.object(
  "Input for retrieving a user's followers.",
  {
    userName,
    cursor,
    pageSize: s.integer("The number of users to return per page.", {
      minimum: 20,
      maximum: 200,
    }),
  },
  { optional: ["cursor", "pageSize"] },
);

const followersIdsInputSchema = {
  ...s.object(
    "Input for retrieving follower IDs by user ID or screen name.",
    {
      userName,
      userId,
      count: s.integer("The number of follower IDs to return per page.", {
        minimum: 50,
        maximum: 5000,
      }),
      cursor,
    },
    { optional: ["userName", "userId", "count", "cursor"] },
  ),
  anyOf: [{ required: ["userId"] }, { required: ["userName"] }],
};

const followingInputSchema = s.object(
  "Input for retrieving users followed by a screen name.",
  {
    userName,
    cursor,
    pageSize: s.integer("The number of users to return per page.", {
      minimum: 20,
      maximum: 200,
    }),
  },
  { optional: ["cursor", "pageSize"] },
);

const followersOutputSchema = s.object(
  "twitterapi.io response containing follower users.",
  {
    followers: s.array("The follower users returned by the endpoint.", userSchema),
    ...paginationFields,
    ...statusFields,
  },
  { optional: ["followers", "has_next_page", "next_cursor", "status", "msg", "message"] },
);

const followersIdsOutputSchema = s.object(
  "twitterapi.io response containing follower IDs.",
  {
    ids: s.array("The follower IDs returned by the endpoint.", s.string("A follower user ID.")),
    ...paginationFields,
    code: s.integer("The upstream status code."),
    ...statusFields,
  },
  { optional: ["ids", "has_next_page", "next_cursor", "code", "status", "msg", "message"] },
);

const verifiedFollowersInputSchema = s.object(
  "Input for retrieving verified followers by user ID.",
  {
    userId,
    cursor,
  },
  { optional: ["cursor"] },
);

const followingsOutputSchema = s.object(
  "twitterapi.io response containing followed users.",
  {
    followings: s.array("The followed users returned by the endpoint.", userSchema),
    ...paginationFields,
    ...statusFields,
  },
  { optional: ["followings", "has_next_page", "next_cursor", "status", "msg", "message"] },
);

const checkFollowInputSchema = s.object("Input for checking the relationship between two X users.", {
  sourceUserName: nonEmptyString("The source user's screen name."),
  targetUserName: nonEmptyString("The target user's screen name."),
});

const checkFollowOutputSchema = s.object(
  "twitterapi.io response containing follow relationship flags.",
  {
    data: s.object(
      "Follow relationship flags.",
      {
        following: s.boolean("Whether the source user follows the target user."),
        followed_by: s.boolean("Whether the source user is followed by the target user."),
      },
      { optional: ["following", "followed_by"] },
    ),
    ...statusFields,
  },
  { optional: ["data", "status", "msg", "message"] },
);

const listTweetsInputSchema = s.object(
  "Input for retrieving Tweets from a list.",
  {
    listId: nonEmptyString("The X List ID."),
    sinceTime: unixTime,
    untilTime: unixTime,
    includeReplies: s.boolean("Whether to include replies in the returned Tweets."),
    cursor,
  },
  { optional: ["sinceTime", "untilTime", "includeReplies", "cursor"] },
);

const listTimelineInputSchema = s.object(
  "Input for retrieving a list timeline.",
  {
    listId: nonEmptyString("The X List ID."),
    cursor,
  },
  { optional: ["cursor"] },
);

const listMembersInputSchema = s.object(
  "Input for retrieving list users.",
  {
    listId: nonEmptyString("The X List ID."),
    cursor,
  },
  { optional: ["cursor"] },
);

const membersOutputSchema = s.object(
  "twitterapi.io response containing member users.",
  {
    members: s.array("The member users returned by the endpoint.", userSchema),
    ...paginationFields,
    ...statusFields,
  },
  { optional: ["members", "has_next_page", "next_cursor", "status", "msg", "message"] },
);

const communityInputSchema = s.object("Input for retrieving information about a community.", {
  communityId: nonEmptyString("The X Community ID."),
});

const communityPageInputSchema = s.object(
  "Input for retrieving a paginated community collection.",
  {
    communityId: nonEmptyString("The X Community ID."),
    cursor,
  },
  { optional: ["cursor"] },
);

const allCommunityTweetsInputSchema = s.object(
  "Input for searching Tweets from all communities by keyword.",
  {
    query: nonEmptyString("The keyword to search for."),
    queryType,
    cursor,
  },
  { optional: ["cursor"] },
);

const communityInfoOutputSchema = s.object(
  "twitterapi.io response containing community information.",
  {
    community_info: rawObject,
    ...statusFields,
  },
  { optional: ["community_info", "status", "msg", "message"] },
);

const trendsInputSchema = s.object(
  "Input for retrieving X trends by WOEID.",
  {
    woeid: s.integer("The Where On Earth ID for the trend location."),
    count: s.integer("The number of trends to return."),
  },
  { optional: ["count"] },
);

const trendsOutputSchema = s.object(
  "twitterapi.io response containing trends.",
  {
    trends: s.array("The trends returned by the endpoint.", rawObject),
    ...statusFields,
  },
  { optional: ["trends", "status", "msg", "message"] },
);

const getSpaceInputSchema = s.object("Input for retrieving Space details.", {
  spaceId: nonEmptyString("The X Space ID."),
});

const detailOutputSchema = s.object(
  "twitterapi.io response containing a single detail object.",
  {
    data: rawObject,
    ...statusFields,
  },
  { optional: ["data", "status", "msg", "message"] },
);

const tweetFilterRuleSchema = s.object(
  "A twitterapi.io Webhook/WebSocket tweet filter rule.",
  {
    rule_id: s.string("The tweet filter rule ID."),
    tag: s.string("The custom tag identifying the rule."),
    value: s.string("The Twitter search rule used to filter Tweets."),
    interval_seconds: s.number("The interval, in seconds, used to check matching Tweets."),
  },
  { optional: ["rule_id", "tag", "value", "interval_seconds"] },
);

const listTweetFilterRulesOutputSchema = s.object(
  "twitterapi.io response containing Webhook/WebSocket tweet filter rules.",
  {
    rules: s.array("The configured tweet filter rules.", tweetFilterRuleSchema),
    ...statusFields,
  },
  { optional: ["rules", "status", "msg", "message"] },
);

const addTweetFilterRuleInputSchema = s.object("Input for adding a Webhook/WebSocket tweet filter rule.", {
  tag: tweetFilterRuleTag,
  value: tweetFilterRuleValue,
  intervalSeconds: tweetFilterRuleIntervalSeconds,
});

const updateTweetFilterRuleInputSchema = s.object(
  "Input for updating a Webhook/WebSocket tweet filter rule.",
  {
    ruleId: tweetFilterRuleId,
    tag: tweetFilterRuleTag,
    value: tweetFilterRuleValue,
    intervalSeconds: tweetFilterRuleIntervalSeconds,
    isEffect: s.integer("Whether the rule is effective. Use 1 for effective and 0 for inactive.", {
      minimum: 0,
      maximum: 1,
    }),
  },
  { optional: ["isEffect"] },
);

const deleteTweetFilterRuleInputSchema = s.object("Input for deleting a Webhook/WebSocket tweet filter rule.", {
  ruleId: tweetFilterRuleId,
});

const addTweetFilterRuleOutputSchema = s.object(
  "twitterapi.io response for adding a Webhook/WebSocket tweet filter rule.",
  {
    rule_id: s.string("The ID of the added tweet filter rule."),
    ...statusFields,
  },
  { optional: ["rule_id", "status", "msg", "message"] },
);

const mutationStatusOutputSchema = s.object(
  "twitterapi.io response for a mutation request.",
  {
    ...statusFields,
  },
  { optional: ["status", "msg", "message"] },
);

const monitoredTweetUserSchema = s.object(
  "A twitterapi.io monitored user entry for real-time Tweets.",
  {
    id_for_user: s.string("The monitor entry ID used to remove the user."),
    x_user_id: s.integer("The numeric X user ID."),
    x_user_name: s.string("The X user display name."),
    x_user_screen_name: s.string("The X screen name."),
    is_monitor_tweet: s.integer("Whether Tweet monitoring is enabled for the user."),
    is_monitor_profile: s.integer("Whether profile monitoring is enabled for the user."),
    monitor_tweet_config_status: s.integer("The Tweet monitoring configuration status."),
    monitor_profile_config_status: s.integer("The profile monitoring configuration status."),
    created_at: s.string("The upstream timestamp when the monitor entry was created."),
  },
  {
    optional: [
      "id_for_user",
      "x_user_id",
      "x_user_name",
      "x_user_screen_name",
      "is_monitor_tweet",
      "is_monitor_profile",
      "monitor_tweet_config_status",
      "monitor_profile_config_status",
      "created_at",
    ],
  },
);

const listMonitoredTweetUsersOutputSchema = s.object(
  "twitterapi.io response containing users monitored for real-time Tweets.",
  {
    data: s.array("The monitored user entries.", monitoredTweetUserSchema),
    ...statusFields,
  },
  { optional: ["data", "status", "msg", "message"] },
);

const addMonitoredTweetUserInputSchema = s.object("Input for adding an X user to real-time Tweet monitoring.", {
  xUserName: userName,
});

const removeMonitoredTweetUserInputSchema = s.object("Input for removing an X user from real-time Tweet monitoring.", {
  idForUser: monitorUserEntryId,
});

function defineTwitterApiAction(input: {
  name: string;
  operationType: ProviderActionDefinition["operationType"];
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}): ProviderActionDefinition {
  return defineProviderAction(service, {
    name: input.name,
    operationType: input.operationType,
    description: input.description,
    requiredScopes: [],
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
  });
}

export const twitterapiIoActions: ProviderActionDefinition[] = [
  defineTwitterApiAction({
    name: "get_account_info",
    operationType: "read",
    description: "Retrieve twitterapi.io account credit information for the API key.",
    inputSchema: s.object("No input is required for this action.", {}),
    outputSchema: accountInfoOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_user",
    operationType: "read",
    description: "Retrieve an X user profile by screen name.",
    inputSchema: getUserInputSchema,
    outputSchema: getUserOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_user_about",
    operationType: "read",
    description: "Retrieve the X About profile information for a screen name.",
    inputSchema: getUserInputSchema,
    outputSchema: getUserAboutOutputSchema,
  }),
  defineTwitterApiAction({
    name: "batch_get_users",
    operationType: "read",
    description: "Retrieve multiple X user profiles by user ID.",
    inputSchema: batchGetUsersInputSchema,
    outputSchema: usersOutputSchema,
  }),
  defineTwitterApiAction({
    name: "search_users",
    operationType: "read",
    description: "Search X users by keyword.",
    inputSchema: searchUsersInputSchema,
    outputSchema: usersOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_user_last_tweets",
    operationType: "read",
    description: "Retrieve the latest Tweets from a user by user ID or screen name.",
    inputSchema: userTimelineInputSchema,
    outputSchema: tweetPageOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_user_timeline",
    operationType: "read",
    description: "Retrieve a user's profile timeline by user ID.",
    inputSchema: userIdTimelineInputSchema,
    outputSchema: tweetPageOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_user_mentions",
    operationType: "read",
    description: "Retrieve Tweets mentioning a user.",
    inputSchema: mentionsInputSchema,
    outputSchema: tweetPageOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_tweets",
    operationType: "read",
    description: "Retrieve Tweets by Tweet IDs.",
    inputSchema: getTweetsInputSchema,
    outputSchema: tweetPageOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_article",
    operationType: "read",
    description: "Retrieve an X article by Tweet ID.",
    inputSchema: getArticleInputSchema,
    outputSchema: articleOutputSchema,
  }),
  defineTwitterApiAction({
    name: "advanced_search_tweets",
    operationType: "read",
    description: "Run an advanced Twitter search query.",
    inputSchema: advancedSearchInputSchema,
    outputSchema: tweetPageOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_tweet_replies_legacy",
    operationType: "read",
    description: "Retrieve replies to an original Tweet with the legacy replies endpoint.",
    inputSchema: tweetRepliesLegacyInputSchema,
    outputSchema: repliesOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_tweet_replies",
    operationType: "read",
    description: "Retrieve replies to a Tweet with twitterapi.io V2 sorting.",
    inputSchema: tweetRepliesInputSchema,
    outputSchema: repliesOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_tweet_quotes",
    operationType: "read",
    description: "Retrieve quote Tweets for a Tweet.",
    inputSchema: timedTweetPageInputSchema,
    outputSchema: tweetPageOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_tweet_retweeters",
    operationType: "read",
    description: "Retrieve users who retweeted a Tweet.",
    inputSchema: retweetersInputSchema,
    outputSchema: usersOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_tweet_thread_context",
    operationType: "read",
    description: "Retrieve the conversation context around a Tweet.",
    inputSchema: tweetThreadInputSchema,
    outputSchema: repliesOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_user_followers",
    operationType: "read",
    description: "Retrieve followers for a user by screen name.",
    inputSchema: followersInputSchema,
    outputSchema: followersOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_user_follower_ids",
    operationType: "read",
    description: "Retrieve follower IDs for a user by user ID or screen name.",
    inputSchema: followersIdsInputSchema,
    outputSchema: followersIdsOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_user_verified_followers",
    operationType: "read",
    description: "Retrieve verified followers for a user by user ID.",
    inputSchema: verifiedFollowersInputSchema,
    outputSchema: followersOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_user_followings",
    operationType: "read",
    description: "Retrieve users followed by a screen name.",
    inputSchema: followingInputSchema,
    outputSchema: followingsOutputSchema,
  }),
  defineTwitterApiAction({
    name: "check_follow_relationship",
    operationType: "read",
    description: "Check whether one X user follows or is followed by another user.",
    inputSchema: checkFollowInputSchema,
    outputSchema: checkFollowOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_list_tweets",
    operationType: "read",
    description: "Retrieve Tweets from an X List.",
    inputSchema: listTweetsInputSchema,
    outputSchema: tweetPageOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_list_timeline",
    operationType: "read",
    description: "Retrieve timeline Tweets from an X List.",
    inputSchema: listTimelineInputSchema,
    outputSchema: tweetPageOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_list_members",
    operationType: "read",
    description: "Retrieve members of an X List.",
    inputSchema: listMembersInputSchema,
    outputSchema: membersOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_list_followers",
    operationType: "read",
    description: "Retrieve followers of an X List.",
    inputSchema: listMembersInputSchema,
    outputSchema: followersOutputSchema,
  }),
  defineTwitterApiAction({
    name: "search_all_community_tweets",
    operationType: "read",
    description: "Search Tweets from all X Communities by keyword.",
    inputSchema: allCommunityTweetsInputSchema,
    outputSchema: tweetPageOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_community_info",
    operationType: "read",
    description: "Retrieve information about an X Community.",
    inputSchema: communityInputSchema,
    outputSchema: communityInfoOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_community_members",
    operationType: "read",
    description: "Retrieve members of an X Community.",
    inputSchema: communityPageInputSchema,
    outputSchema: membersOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_community_moderators",
    operationType: "read",
    description: "Retrieve moderators of an X Community.",
    inputSchema: communityPageInputSchema,
    outputSchema: membersOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_community_tweets",
    operationType: "read",
    description: "Retrieve Tweets from an X Community.",
    inputSchema: communityPageInputSchema,
    outputSchema: tweetPageOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_trends",
    operationType: "read",
    description: "Retrieve X trends for a WOEID location.",
    inputSchema: trendsInputSchema,
    outputSchema: trendsOutputSchema,
  }),
  defineTwitterApiAction({
    name: "get_space",
    operationType: "read",
    description: "Retrieve details for an X Space.",
    inputSchema: getSpaceInputSchema,
    outputSchema: detailOutputSchema,
  }),
  defineTwitterApiAction({
    name: "list_tweet_filter_rules",
    operationType: "read",
    description: "List Webhook/WebSocket tweet filter rules configured for the API key.",
    inputSchema: s.object("No input is required for this action.", {}),
    outputSchema: listTweetFilterRulesOutputSchema,
  }),
  defineTwitterApiAction({
    name: "add_tweet_filter_rule",
    operationType: "write",
    description: "Add a Webhook/WebSocket tweet filter rule.",
    inputSchema: addTweetFilterRuleInputSchema,
    outputSchema: addTweetFilterRuleOutputSchema,
  }),
  defineTwitterApiAction({
    name: "update_tweet_filter_rule",
    operationType: "write",
    description: "Update a Webhook/WebSocket tweet filter rule.",
    inputSchema: updateTweetFilterRuleInputSchema,
    outputSchema: mutationStatusOutputSchema,
  }),
  defineTwitterApiAction({
    name: "delete_tweet_filter_rule",
    operationType: "destructive",
    description: "Delete a Webhook/WebSocket tweet filter rule.",
    inputSchema: deleteTweetFilterRuleInputSchema,
    outputSchema: mutationStatusOutputSchema,
  }),
  defineTwitterApiAction({
    name: "list_monitored_tweet_users",
    operationType: "read",
    description: "List X users monitored for real-time Tweets.",
    inputSchema: s.object("No input is required for this action.", {}),
    outputSchema: listMonitoredTweetUsersOutputSchema,
  }),
  defineTwitterApiAction({
    name: "add_monitored_tweet_user",
    operationType: "write",
    description: "Add an X user to real-time Tweet monitoring.",
    inputSchema: addMonitoredTweetUserInputSchema,
    outputSchema: mutationStatusOutputSchema,
  }),
  defineTwitterApiAction({
    name: "remove_monitored_tweet_user",
    operationType: "destructive",
    description: "Remove an X user from real-time Tweet monitoring.",
    inputSchema: removeMonitoredTweetUserInputSchema,
    outputSchema: mutationStatusOutputSchema,
  }),
];
