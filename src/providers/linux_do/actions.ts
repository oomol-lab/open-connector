import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "linux_do";

const limitNote = "The feed returns a fixed number of items; this truncates the parsed result locally.";
const notFoundNote =
  "Returns 404 when the target is private or not accessible anonymously; a 404 does not necessarily mean the resource does not exist.";
const rateLimitNote = "On a 429/rate-limit error, retry later or fetch the endpoint URL directly from a local network.";

const rawObjectSchema = s.looseObject("The raw parsed RSS item.");

const feedMetaSchema = s.object("RSS channel metadata.", {
  title: s.nullableString("The feed title, or null when Linux DO omits it."),
  link: s.nullableString("The feed link, or null when Linux DO omits it."),
  description: s.nullableString("The feed description, or null when Linux DO omits it."),
});

const topicSummarySchema = s.object(
  "A Linux DO topic parsed from a Discourse RSS feed.",
  {
    id: s.nullableInteger("The numeric topic ID parsed from the link/guid, or null."),
    title: s.nullableString("The topic title, or null."),
    url: s.nullableString("The Linux DO web URL for the topic, or null."),
    author: s.nullableString("The topic author (dc:creator), or null."),
    category: s.nullableString("The category name, or null when absent in the feed."),
    excerpt: s.nullableString("Plain-text excerpt of the first post, or null."),
    descriptionHtml: s.nullableString("Rendered HTML description from the feed, or null."),
    pubDate: s.nullableString("Publication timestamp (ISO 8601), or null."),
    pinned: s.nullableBoolean("Whether the topic is pinned, or null when omitted."),
    closed: s.nullableBoolean("Whether the topic is closed, or null when omitted."),
    archived: s.nullableBoolean("Whether the topic is archived, or null when omitted."),
    raw: rawObjectSchema,
  },
  {
    optional: [
      "id",
      "title",
      "url",
      "author",
      "category",
      "excerpt",
      "descriptionHtml",
      "pubDate",
      "pinned",
      "closed",
      "archived",
    ],
  },
);

const postSummarySchema = s.object(
  "A Linux DO post parsed from a Discourse RSS feed.",
  {
    id: s.nullableInteger("The numeric post ID parsed from the guid, or null."),
    topicId: s.nullableInteger("The numeric topic ID parsed from the link, or null."),
    postNumber: s.nullableInteger("The post number within the topic, or null."),
    title: s.nullableString("The topic title for this post, or null."),
    url: s.nullableString("The Linux DO web URL for the post, or null."),
    author: s.nullableString("The post author (dc:creator), or null."),
    excerpt: s.nullableString("Plain-text excerpt of the post, or null."),
    contentHtml: s.nullableString("Rendered HTML content from the feed, or null."),
    pubDate: s.nullableString("Publication timestamp (ISO 8601), or null."),
    raw: rawObjectSchema,
  },
  {
    optional: ["id", "topicId", "postNumber", "title", "url", "author", "excerpt", "contentHtml", "pubDate"],
  },
);

const badgeGrantSchema = s.object(
  "A Linux DO badge grant parsed from a badge RSS feed.",
  {
    grantee: s.nullableString("The display name/username granted the badge, or null."),
    username: s.nullableString("The username parsed from the grant guid, or null."),
    grantedAt: s.nullableString("When the badge was granted, or null."),
    grantedBy: s.nullableString("Who granted the badge, or null."),
    url: s.nullableString("The grant URL, or null."),
    raw: rawObjectSchema,
  },
  { optional: ["grantee", "username", "grantedAt", "grantedBy", "url"] },
);

const topicListOutputSchema = s.object("Output from listing Linux DO topics from an RSS feed.", {
  feed: feedMetaSchema,
  topics: s.array("The topic summaries.", topicSummarySchema),
  count: s.integer("The number of topics returned."),
});

const postListOutputSchema = s.object("Output from listing Linux DO posts from an RSS feed.", {
  feed: feedMetaSchema,
  posts: s.array("The post summaries.", postSummarySchema),
  count: s.integer("The number of posts returned."),
});

const badgeListOutputSchema = s.object("Output from listing Linux DO badge grants.", {
  feed: feedMetaSchema,
  grants: s.array("The badge grants.", badgeGrantSchema),
  count: s.integer("The number of grants returned."),
});

const limitInput = s.integer(`The maximum number of items to return. ${limitNote}`, {
  minimum: 1,
  maximum: 100,
});

export const linuxDoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_latest_topics",
    description: `List the latest public topics from Linux DO. RSS endpoint: GET https://linux.do/latest.rss. ${rateLimitNote}`,
    inputSchema: s.object("Input for listing latest Linux DO topics.", { limit: limitInput }, { optional: ["limit"] }),
    outputSchema: topicListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_top_topics",
    description:
      "List public top topics from Linux DO for a time period. RSS endpoint: " +
      `GET https://linux.do/top.rss?period={period} (daily/weekly/monthly/quarterly/yearly/all). ${rateLimitNote}`,
    inputSchema: s.object(
      "Input for listing top Linux DO topics.",
      {
        period: s.stringEnum("The Discourse top-topics period.", [
          "daily",
          "weekly",
          "monthly",
          "quarterly",
          "yearly",
          "all",
        ]),
        limit: limitInput,
      },
      { optional: ["period", "limit"] },
    ),
    outputSchema: topicListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_hot_topics",
    description: `List public hot/trending topics from Linux DO. RSS endpoint: GET https://linux.do/hot.rss. ${rateLimitNote}`,
    inputSchema: s.object("Input for listing hot Linux DO topics.", { limit: limitInput }, { optional: ["limit"] }),
    outputSchema: topicListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_category_topics",
    description: `List topics in a Linux DO category. RSS endpoint: GET https://linux.do/c/{slug}/{id}.rss. ${notFoundNote} ${rateLimitNote}`,
    inputSchema: s.object(
      "Input for listing topics in a Linux DO category.",
      {
        slug: s.nonEmptyString('The category slug, e.g. "develop".'),
        id: s.positiveInteger("The numeric category ID."),
        limit: limitInput,
      },
      { optional: ["limit"] },
    ),
    outputSchema: topicListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tag_topics",
    description: `List topics with a Linux DO tag. RSS endpoint: GET https://linux.do/tag/{tag}.rss. ${notFoundNote} ${rateLimitNote}`,
    inputSchema: s.object(
      "Input for listing topics with a Linux DO tag.",
      {
        tag: s.nonEmptyString('The tag name/slug, e.g. "chatgpt".'),
        limit: limitInput,
      },
      { optional: ["limit"] },
    ),
    outputSchema: topicListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_user_topics",
    description: `List topics created by a Linux DO user. RSS endpoint: GET https://linux.do/u/{username}/activity/topics.rss. ${notFoundNote} ${rateLimitNote}`,
    inputSchema: s.object(
      "Input for listing a Linux DO user's topics.",
      {
        username: s.nonEmptyString("The Linux DO username."),
        limit: limitInput,
      },
      { optional: ["limit"] },
    ),
    outputSchema: topicListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_category_tag_topics",
    description: `List topics with a tag inside a category. RSS endpoint: GET https://linux.do/tags/c/{slug}/{id}/{tag}.rss. ${notFoundNote} ${rateLimitNote}`,
    inputSchema: s.object(
      "Input for listing topics with a tag inside a Linux DO category.",
      {
        categorySlug: s.nonEmptyString('The category slug, e.g. "develop".'),
        categoryId: s.positiveInteger("The numeric category ID."),
        tag: s.nonEmptyString('The tag name/slug, e.g. "chatgpt".'),
        limit: limitInput,
      },
      { optional: ["limit"] },
    ),
    outputSchema: topicListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_latest_posts",
    description: `List the latest public posts across Linux DO. RSS endpoint: GET https://linux.do/posts.rss. ${rateLimitNote}`,
    inputSchema: s.object("Input for listing latest Linux DO posts.", { limit: limitInput }, { optional: ["limit"] }),
    outputSchema: postListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_topic_posts",
    description: `List posts within a Linux DO topic. RSS endpoint: GET https://linux.do/t/{slug}/{id}.rss (slug defaults to "topic"). ${notFoundNote} ${rateLimitNote}`,
    inputSchema: s.object(
      "Input for listing posts within a Linux DO topic.",
      {
        topicId: s.positiveInteger("The numeric topic ID."),
        slug: s.nonEmptyString('The topic slug; defaults to "topic" when omitted.'),
        limit: limitInput,
      },
      { optional: ["slug", "limit"] },
    ),
    outputSchema: postListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_user_posts",
    description: `List posts by a Linux DO user. RSS endpoint: GET https://linux.do/u/{username}/activity.rss. ${notFoundNote} ${rateLimitNote}`,
    inputSchema: s.object(
      "Input for listing a Linux DO user's posts.",
      {
        username: s.nonEmptyString("The Linux DO username."),
        limit: limitInput,
      },
      { optional: ["limit"] },
    ),
    outputSchema: postListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_group_posts",
    description: `List posts by members of a Linux DO group. RSS endpoint: GET https://linux.do/g/{name}/posts.rss. ${notFoundNote} ${rateLimitNote}`,
    inputSchema: s.object(
      "Input for listing a Linux DO group's posts.",
      {
        name: s.nonEmptyString("The Linux DO group name."),
        limit: limitInput,
      },
      { optional: ["limit"] },
    ),
    outputSchema: postListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_group_mentions",
    description: `List posts mentioning a Linux DO group. RSS endpoint: GET https://linux.do/g/{name}/mentions.rss. ${notFoundNote} ${rateLimitNote}`,
    inputSchema: s.object(
      "Input for listing a Linux DO group's mentions.",
      {
        name: s.nonEmptyString("The Linux DO group name."),
        limit: limitInput,
      },
      { optional: ["limit"] },
    ),
    outputSchema: postListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_badge_grants",
    description: `List recent grants of a Linux DO badge. RSS endpoint: GET https://linux.do/badges/{id}.rss. ${notFoundNote} ${rateLimitNote}`,
    inputSchema: s.object(
      "Input for listing Linux DO badge grants.",
      {
        id: s.positiveInteger("The numeric badge ID."),
        limit: limitInput,
      },
      { optional: ["limit"] },
    ),
    outputSchema: badgeListOutputSchema,
  }),
];
