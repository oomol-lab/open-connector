import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "discourse" as const;

const nonEmptyStringSchema = (description: string) =>
  s.string(description, {
    minLength: 1,
  });

const nullableStringSchema = (description: string) => s.nullable(s.string(description));
const nullableIntegerSchema = (description: string) => s.nullable(s.integer(description));
const nullableBooleanSchema = (description: string) => s.nullable(s.boolean(description));

const discourseUserSummarySchema = s.object("A Discourse user summary.", {
  id: nullableIntegerSchema("The Discourse user identifier when present."),
  username: nullableStringSchema("The Discourse username when present."),
  name: nullableStringSchema("The user's display name when present."),
  avatarTemplate: nullableStringSchema("The Discourse avatar template URL when present."),
  raw: s.looseObject("The raw Discourse user payload."),
});

const discourseTopicSummarySchema = s.object("A Discourse topic summary.", {
  id: s.integer("The Discourse topic identifier."),
  title: s.string("The topic title."),
  fancyTitle: nullableStringSchema("The HTML-formatted topic title when present."),
  slug: nullableStringSchema("The topic slug when present."),
  postsCount: nullableIntegerSchema("The number of posts in the topic when present."),
  replyCount: nullableIntegerSchema("The number of replies in the topic when present."),
  highestPostNumber: nullableIntegerSchema("The highest post number in the topic when present."),
  createdAt: nullableStringSchema("The timestamp when the topic was created when present."),
  lastPostedAt: nullableStringSchema("The timestamp of the latest post when present."),
  bumpedAt: nullableStringSchema("The timestamp when the topic was last bumped when present."),
  categoryId: nullableIntegerSchema("The category identifier for the topic when present."),
  views: nullableIntegerSchema("The topic view count when present."),
  likeCount: nullableIntegerSchema("The topic like count when present."),
  pinned: nullableBooleanSchema("Whether the topic is pinned when present."),
  closed: nullableBooleanSchema("Whether the topic is closed when present."),
  archived: nullableBooleanSchema("Whether the topic is archived when present."),
  visible: nullableBooleanSchema("Whether the topic is visible when present."),
  lastPosterUsername: nullableStringSchema("The username of the latest poster when present."),
  raw: s.looseObject("The raw Discourse topic payload."),
});

const discourseCategorySummarySchema = s.object("A Discourse category summary.", {
  id: s.integer("The Discourse category identifier."),
  name: s.string("The category name."),
  slug: nullableStringSchema("The category slug when present."),
  color: nullableStringSchema("The category color hex value when present."),
  textColor: nullableStringSchema("The category text color hex value when present."),
  description: nullableStringSchema("The plain-text category description when present."),
  topicCount: nullableIntegerSchema("The number of topics in the category when present."),
  postCount: nullableIntegerSchema("The number of posts in the category when present."),
  position: nullableIntegerSchema("The category display position when present."),
  parentCategoryId: nullableIntegerSchema("The parent category identifier when present."),
  readRestricted: nullableBooleanSchema("Whether the category is read-restricted when present."),
  raw: s.looseObject("The raw Discourse category payload."),
});

const discoursePostSummarySchema = s.object("A Discourse post summary.", {
  id: s.integer("The Discourse post identifier."),
  topicId: nullableIntegerSchema("The topic identifier for the post when present."),
  topicSlug: nullableStringSchema("The topic slug for the post when present."),
  postNumber: nullableIntegerSchema("The one-based post number inside the topic when present."),
  replyToPostNumber: nullableIntegerSchema("The post number this post replies to when present."),
  username: nullableStringSchema("The author's username when present."),
  displayUsername: nullableStringSchema("The author's display username when present."),
  name: nullableStringSchema("The author's display name when present."),
  createdAt: nullableStringSchema("The timestamp when the post was created when present."),
  updatedAt: nullableStringSchema("The timestamp when the post was updated when present."),
  cooked: nullableStringSchema("The cooked HTML post body when present."),
  postType: nullableIntegerSchema("The Discourse post type value when present."),
  raw: s.looseObject("The raw Discourse post payload."),
});

const discourseTopicListOutputSchema = s.object("A Discourse topic list response.", {
  canCreateTopic: nullableBooleanSchema("Whether the authenticated user can create a topic."),
  perPage: nullableIntegerSchema("The Discourse per-page value used by the response."),
  moreTopicsUrl: nullableStringSchema("The relative URL for the next topic page when present."),
  topics: s.array("The topics returned by Discourse.", discourseTopicSummarySchema),
  users: s.array("The users referenced by the topic list.", discourseUserSummarySchema),
  raw: s.looseObject("The raw Discourse topic list payload."),
});

const latestTopicOrderSchema = s.stringEnum("The Discourse latest-topics ordering field.", [
  "default",
  "created",
  "activity",
  "views",
  "posts",
  "category",
  "likes",
  "op_likes",
  "posters",
]);

const latestTopicsInputSchema = s.object(
  "Input parameters for listing Discourse latest topics.",
  {
    order: latestTopicOrderSchema,
    ascending: s.boolean("Whether Discourse should sort the latest topics ascending."),
    perPage: s.integer("Maximum number of topics to request from Discourse.", {
      minimum: 1,
      maximum: 100,
    }),
  },
  { optional: ["order", "ascending", "perPage"] },
);

const listCategoriesInputSchema = s.object(
  "Input parameters for listing Discourse categories.",
  {
    includeSubcategories: s.boolean("Whether Discourse should include subcategories."),
  },
  { optional: ["includeSubcategories"] },
);

const listCategoriesOutputSchema = s.object("A Discourse category list response.", {
  categories: s.array("The categories returned by Discourse.", discourseCategorySummarySchema),
  raw: s.looseObject("The raw Discourse category list payload."),
});

const listCategoryTopicsInputSchema = s.object("Input parameters for listing category topics.", {
  slug: nonEmptyStringSchema("The Discourse category slug."),
  categoryId: s.positiveInteger("The Discourse category identifier."),
});

const getTopicInputSchema = s.object("Input parameters for reading one Discourse topic.", {
  topicId: s.positiveInteger("The Discourse topic identifier."),
});

const getTopicOutputSchema = s.object("A Discourse topic detail response.", {
  topic: s.object("The normalized Discourse topic detail.", {
    id: s.integer("The Discourse topic identifier."),
    title: s.string("The topic title."),
    fancyTitle: nullableStringSchema("The HTML-formatted topic title when present."),
    slug: nullableStringSchema("The topic slug when present."),
    postsCount: nullableIntegerSchema("The number of posts in the topic when present."),
    categoryId: nullableIntegerSchema("The category identifier for the topic when present."),
    createdAt: nullableStringSchema("The timestamp when the topic was created when present."),
    posts: s.array("The posts returned for the topic.", discoursePostSummarySchema),
    details: s.looseObject("The raw Discourse topic details object."),
    raw: s.looseObject("The raw Discourse topic payload."),
  }),
});

const searchInputSchema = s.object(
  "Input parameters for searching Discourse.",
  {
    query: nonEmptyStringSchema("The Discourse search query string."),
    page: s.positiveInteger("The one-based search results page."),
  },
  { optional: ["page"] },
);

const searchOutputSchema = s.object("A Discourse search response.", {
  posts: s.array("The posts returned by Discourse search.", discoursePostSummarySchema),
  topics: s.array("The topics returned by Discourse search.", discourseTopicSummarySchema),
  users: s.array("The users returned by Discourse search.", discourseUserSummarySchema),
  categories: s.array("The categories returned by Discourse search.", discourseCategorySummarySchema),
  groupedSearchResult: s.looseObject("The grouped_search_result object returned by Discourse."),
  raw: s.looseObject("The raw Discourse search payload."),
});

const createTopicInputSchema = s.object(
  "Input parameters for creating a Discourse topic.",
  {
    title: nonEmptyStringSchema("The title for the new Discourse topic."),
    raw: nonEmptyStringSchema("The raw Markdown body for the first post."),
    categoryId: s.positiveInteger("The Discourse category identifier for the new topic."),
    embedUrl: s.url("A remote URL to associate with the new topic."),
    externalId: nonEmptyStringSchema("A caller-provided external identifier for the new topic."),
    autoTrack: s.boolean("Whether the author should automatically track the new topic."),
    createdAt: s.dateTime("The explicit creation timestamp for the post."),
  },
  { optional: ["categoryId", "embedUrl", "externalId", "autoTrack", "createdAt"] },
);

const createPostInputSchema = s.object(
  "Input parameters for creating a Discourse reply post.",
  {
    topicId: s.positiveInteger("The Discourse topic identifier to reply to."),
    raw: nonEmptyStringSchema("The raw Markdown body for the reply."),
    replyToPostNumber: s.positiveInteger("The post number to reply to inside the topic."),
    createdAt: s.dateTime("The explicit creation timestamp for the post."),
  },
  { optional: ["replyToPostNumber", "createdAt"] },
);

const createPostOutputSchema = s.object("A Discourse created post response.", {
  post: discoursePostSummarySchema,
  raw: s.looseObject("The raw Discourse created post payload."),
});

export const discourseActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_latest_topics",
    description: "List the latest topics visible to the authenticated Discourse API user.",
    requiredScopes: [],
    followUpActions: ["discourse.get_topic", "discourse.create_post"],
    inputSchema: latestTopicsInputSchema,
    outputSchema: discourseTopicListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_categories",
    description: "List Discourse categories visible to the authenticated API user.",
    requiredScopes: [],
    followUpActions: ["discourse.list_category_topics", "discourse.create_topic"],
    inputSchema: listCategoriesInputSchema,
    outputSchema: listCategoriesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_category_topics",
    description: "List topics for one Discourse category.",
    requiredScopes: [],
    followUpActions: ["discourse.get_topic"],
    inputSchema: listCategoryTopicsInputSchema,
    outputSchema: discourseTopicListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_topic",
    description: "Read one Discourse topic and its returned posts.",
    requiredScopes: [],
    followUpActions: ["discourse.create_post"],
    inputSchema: getTopicInputSchema,
    outputSchema: getTopicOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search",
    description: "Search Discourse content using the official search query syntax.",
    requiredScopes: [],
    followUpActions: ["discourse.get_topic"],
    inputSchema: searchInputSchema,
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_topic",
    description: "Create a new Discourse topic with a first post.",
    requiredScopes: [],
    followUpActions: ["discourse.get_topic"],
    inputSchema: createTopicInputSchema,
    outputSchema: createPostOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_post",
    description: "Create a reply post in an existing Discourse topic.",
    requiredScopes: [],
    followUpActions: ["discourse.get_topic"],
    inputSchema: createPostInputSchema,
    outputSchema: createPostOutputSchema,
  }),
];
