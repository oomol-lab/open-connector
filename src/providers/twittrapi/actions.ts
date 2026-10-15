import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "twittrapi" as const;

const numericId = (description: string) => s.string(description, { pattern: "^[0-9]{1,30}$" });

const tweetId = numericId("Numeric ID of the post, the last segment of its x.com URL.");
const userId = numericId("Numeric X user ID, sent as a string so large IDs keep their precision.");
const username = s.string("X handle, with or without the leading @.", { pattern: "^@?[A-Za-z0-9_]{2,15}$" });
const cursor = s.string("nextCursor from the previous page. Omit it to start at the first page.", { minLength: 1 });
const count = s.integer(
  "How many items to request per page. X treats this as a hint, so a page can hold more or fewer items.",
  { minimum: 1 },
);

const userCountsSchema = s.looseObject("Profile counters.", {
  followers: s.integer("Accounts following this user."),
  following: s.integer("Accounts this user follows."),
  tweets: s.integer("Posts published by this user, replies included."),
  likes: s.integer("Posts this user has liked."),
  media: s.integer("Posts with photos or videos."),
  listed: s.integer("Public lists that include this user."),
});

const userSchema = s.looseObject("An X account in TwittrAPI's simple format.", {
  id: s.string("Numeric X user ID."),
  username: s.string("Handle without the @."),
  name: s.string("Display name."),
  description: s.string("Profile bio with links expanded."),
  location: s.string("Self-reported location, empty when not set."),
  url: s.nullableString("Website from the profile, expanded."),
  createdAt: s.nullableString("When the account was created."),
  avatarUrl: s.nullableString("Profile picture URL."),
  bannerUrl: s.nullableString("Header image URL."),
  verified: s.boolean("Whether the account has a blue check."),
  verifiedType: s.nullableString("Organization verification type, such as Business or Government."),
  protected: s.boolean("Whether the account's posts are private."),
  counts: userCountsSchema,
  pinnedTweetIds: s.stringArray("IDs of the posts pinned to the profile."),
  isAutomated: s.boolean("Whether the account is labelled as automated."),
});

const tweetCountsSchema = s.looseObject("Engagement counters.", {
  likes: s.integer("Like count."),
  retweets: s.integer("Repost count."),
  replies: s.integer("Reply count."),
  quotes: s.integer("Quote count."),
  bookmarks: s.integer("Bookmark count."),
  views: s.nullableInteger("View count, when X reports one."),
});

const mediaSchema = s.looseObject("A photo, video, or GIF attached to a post.", {
  type: s.string("Media kind, such as photo, video, or animated_gif."),
  url: s.string("Image URL for photos; the highest-bitrate MP4 for videos and GIFs."),
  previewUrl: s.string("Still image, the poster frame for videos."),
  width: s.integer("Width in pixels."),
  height: s.integer("Height in pixels."),
  altText: s.nullableString("Alt text written by the author."),
  durationMs: s.nullableInteger("Video length in milliseconds."),
});

const embeddedTweetSchema = s.looseObject("A related post in the same simple format, or a stub when X hides it.", {
  id: s.string("Numeric ID of the post."),
});

const tweetSchema = s.looseObject("A post in TwittrAPI's simple format.", {
  id: s.string("Numeric ID of the post."),
  url: s.string("Link to the post on x.com."),
  text: s.string("Full text with t.co links replaced by their targets."),
  createdAt: s.nullableString("When the post was published."),
  lang: s.nullableString("Language code detected by X."),
  author: s.nullable(userSchema),
  counts: tweetCountsSchema,
  media: s.array("Attached photos, videos, and GIFs.", mediaSchema),
  urls: s.stringArray("Expanded links found in the text."),
  hashtags: s.stringArray("Hashtags without the #."),
  mentions: s.array(
    "Accounts mentioned in the text.",
    s.looseObject("A mentioned account.", {
      id: s.string("Numeric X user ID."),
      username: s.string("Handle without the @."),
    }),
  ),
  replyTo: s.nullable(
    s.looseObject("The post this one replies to.", {
      tweetId: s.string("ID of the parent post."),
      userId: s.string("User ID of the parent post's author."),
      username: s.string("Handle of the parent post's author."),
    }),
  ),
  quoted: s.nullable(embeddedTweetSchema),
  retweetOf: s.nullable(embeddedTweetSchema),
  conversationId: s.nullableString("ID of the first post in the conversation."),
  isPinned: s.boolean("Whether this is the pinned post on a profile timeline."),
  source: s.nullableString("Client the post was published from."),
  article: s.nullable(s.looseObject("Long-form article attached to the post.")),
});

const pageFields = {
  nextCursor: s.nullableString("Pass as cursor to fetch the next page. Null on the last page."),
  previousCursor: s.nullableString("Cursor for newer items at the top of the timeline, useful for polling."),
  hasNextPage: s.boolean("Whether another page is available."),
};

const tweetPageSchema = (description: string): JsonSchema =>
  s.object(description, {
    tweets: s.array("Posts on this page.", tweetSchema),
    ...pageFields,
  });

const userPageSchema = (description: string): JsonSchema =>
  s.object(description, {
    users: s.array("Accounts on this page.", userSchema),
    ...pageFields,
  });

const userTimelineInput = (description: string): JsonSchema =>
  s.requireAnyProperty(
    s.object(
      description,
      {
        userId,
        username: s.describe(username, "X handle to use when userId is not known. Ignored when userId is set."),
        count,
        cursor,
      },
      { optional: ["userId", "username", "count", "cursor"] },
    ),
    ["userId", "username"],
  );

export const twittrapiActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_tweets",
    operationType: "read",
    description:
      "Search X posts with the same query syntax as the X search box, including operators such as from:, lang:, and since:.",
    requiredScopes: [],
    inputSchema: s.object(
      "Search query and paging options.",
      {
        query: s.string('Search query, for example `from:nasa lang:en` or `"open source" -is:retweet`.', {
          minLength: 1,
          maxLength: 512,
        }),
        category: s.withDefault(
          s.stringEnum("Which X search tab to read.", ["Top", "Latest", "Photos", "Videos"]),
          "Top",
        ),
        count,
        cursor,
      },
      { optional: ["category", "count", "cursor"] },
    ),
    outputSchema: tweetPageSchema("One page of matching posts."),
  }),
  defineProviderAction(service, {
    name: "search_users",
    operationType: "read",
    description: "Search X accounts by name, handle, or bio keywords, as on the People tab of X search.",
    requiredScopes: [],
    inputSchema: s.object(
      "Search query and paging options.",
      {
        query: s.string("Words to match against account names, handles, and bios.", { minLength: 1, maxLength: 512 }),
        count,
        cursor,
      },
      { optional: ["count", "cursor"] },
    ),
    outputSchema: userPageSchema("One page of matching accounts."),
  }),
  defineProviderAction(service, {
    name: "get_tweet",
    operationType: "read",
    description: "Get one X post by ID with its author, media, and engagement counts, without the reply thread.",
    requiredScopes: [],
    inputSchema: s.object("The post to read.", { tweetId }),
    outputSchema: s.object("The requested post.", {
      tweet: s.looseObject(
        "The post in simple format, or `{ id, unavailable: true }` when X does not return it (deleted, protected, or withheld).",
        {
          id: s.string("Numeric ID of the post."),
          unavailable: s.boolean("Present and true when X did not return the post."),
        },
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_tweet_conversation",
    operationType: "read",
    description:
      "Get the conversation around an X post: the posts it replies to, the post itself, then its replies, one page at a time.",
    requiredScopes: [],
    inputSchema: s.object(
      "The post and reply ordering.",
      {
        tweetId,
        rankingMode: s.withDefault(
          s.stringEnum("How X orders the replies.", ["Relevance", "Recency", "Likes"]),
          "Relevance",
        ),
        cursor,
      },
      { optional: ["rankingMode", "cursor"] },
    ),
    outputSchema: tweetPageSchema("One page of the conversation in display order."),
  }),
  defineProviderAction(service, {
    name: "get_tweet_quotes",
    operationType: "read",
    description: "List posts that quote a given X post.",
    requiredScopes: [],
    inputSchema: s.object(
      "The quoted post and paging options.",
      { tweetId, count, cursor },
      { optional: ["count", "cursor"] },
    ),
    outputSchema: tweetPageSchema("One page of quote posts."),
  }),
  defineProviderAction(service, {
    name: "get_tweet_retweeters",
    operationType: "read",
    description: "List accounts that reposted a given X post.",
    requiredScopes: [],
    inputSchema: s.object(
      "The reposted post and paging options.",
      { tweetId, count, cursor },
      { optional: ["count", "cursor"] },
    ),
    outputSchema: userPageSchema("One page of accounts that reposted the post."),
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Get an X profile by numeric user ID or by handle, including follower and post counts.",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The account to read. Pass userId or username.",
        {
          userId,
          username: s.describe(username, "X handle to look up when userId is not known. Ignored when userId is set."),
        },
        { optional: ["userId", "username"] },
      ),
      ["userId", "username"],
    ),
    outputSchema: s.object("The requested profile.", {
      user: s.describe(s.nullable(userSchema), "The profile, or null when no account has this handle."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_users_by_ids",
    operationType: "read",
    description: "Get up to 500 X profiles in one call by numeric user ID.",
    requiredScopes: [],
    inputSchema: s.object("The accounts to read.", {
      userIds: s.array("Numeric X user IDs.", userId, { minItems: 1, maxItems: 500 }),
    }),
    outputSchema: s.object("The profiles X returned. IDs that X does not return are left out.", {
      users: s.array("Profiles in simple format.", userSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_user_tweets",
    operationType: "read",
    description: "List posts from an X profile timeline, newest first, without replies. A pinned post comes first.",
    requiredScopes: [],
    inputSchema: userTimelineInput("The profile and paging options. Pass userId or username."),
    outputSchema: tweetPageSchema("One page of the profile's posts."),
  }),
  defineProviderAction(service, {
    name: "get_user_tweets_and_replies",
    operationType: "read",
    description: "List posts and replies from an X profile, newest first.",
    requiredScopes: [],
    inputSchema: userTimelineInput("The profile and paging options. Pass userId or username."),
    outputSchema: tweetPageSchema("One page of the profile's posts and replies."),
  }),
  defineProviderAction(service, {
    name: "get_user_followers",
    operationType: "read",
    description: "List accounts that follow an X profile.",
    requiredScopes: [],
    inputSchema: userTimelineInput("The profile and paging options. Pass userId or username."),
    outputSchema: userPageSchema("One page of followers."),
  }),
  defineProviderAction(service, {
    name: "get_user_following",
    operationType: "read",
    description: "List accounts that an X profile follows.",
    requiredScopes: [],
    inputSchema: userTimelineInput("The profile and paging options. Pass userId or username."),
    outputSchema: userPageSchema("One page of followed accounts."),
  }),
  defineProviderAction(service, {
    name: "get_list_tweets",
    operationType: "read",
    description: "List recent posts from the members of an X list, newest first.",
    requiredScopes: [],
    inputSchema: s.object(
      "The list and paging options.",
      {
        listId: s.string("Numeric list ID, the number in an x.com/i/lists/<listId> URL.", { pattern: "^[0-9]+$" }),
        count,
        cursor,
      },
      { optional: ["count", "cursor"] },
    ),
    outputSchema: tweetPageSchema("One page of list posts."),
  }),
  defineProviderAction(service, {
    name: "get_community_tweets",
    operationType: "read",
    description: "List posts shared in an X Community.",
    requiredScopes: [],
    inputSchema: s.object(
      "The community and paging options.",
      {
        communityId: s.string("Numeric community ID, the number in the community URL.", { pattern: "^[0-9]+$" }),
        count,
        cursor,
      },
      { optional: ["count", "cursor"] },
    ),
    outputSchema: tweetPageSchema("One page of community posts."),
  }),
  defineProviderAction(service, {
    name: "get_trends",
    operationType: "read",
    description: "Get the current trending topics on X for a place, identified by its Yahoo WOEID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The place to read trends for.",
      {
        woeid: s.withDefault(
          s.string("Yahoo Where On Earth ID. Use 1 for worldwide or 23424977 for the United States.", {
            pattern: "^[0-9]{1,12}$",
          }),
          "1",
        ),
      },
      { optional: ["woeid"] },
    ),
    outputSchema: s.object("Current trends for the place.", {
      trends: s.array(
        "Trending topics.",
        s.looseObject("A trending topic.", {
          name: s.string("Topic as shown on X."),
          query: s.string("Search query that opens the topic, URL-decoded."),
          url: s.string("Link to the topic's search results on X."),
          tweetVolume: s.nullableInteger("Approximate post volume, when X reports one."),
        }),
      ),
    }),
  }),
];
