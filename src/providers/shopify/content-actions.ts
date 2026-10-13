import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const shopifyIdSchema = (description: string) => s.integer(description, { minimum: 1 });
const limitSchema = s.integer("The maximum number of records to return. Shopify REST supports values from 1 to 250.", {
  minimum: 1,
  maximum: 250,
});
const pageInfoSchema = s.nonEmptyString(
  "The opaque Shopify REST page_info cursor from a previous response pagination value.",
);
const sinceIdSchema = shopifyIdSchema("Return records with Shopify numeric IDs greater than this value.");
const dateTimeFilterSchema = s.nonEmptyString("An ISO 8601 date-time filter accepted by Shopify REST Admin.");
const publishedStatusSchema = s.stringEnum("The Shopify publication status filter.", [
  "published",
  "unpublished",
  "any",
]);
const rawObjectSchema = s.looseObject("The raw object returned by Shopify REST Admin.");
const paginationSchema = s.requiredObject("Shopify REST Link-header pagination cursors.", {
  nextPageInfo: s.nullable(s.string("The page_info cursor for the next page when Shopify returned one.")),
  previousPageInfo: s.nullable(s.string("The page_info cursor for the previous page when Shopify returned one.")),
});
const countSchema = s.nonNegativeInteger("The count returned by Shopify REST Admin.");
const blogSchema = s.looseRequiredObject("A Shopify REST blog object.", {
  id: shopifyIdSchema("The Shopify blog ID."),
  title: s.string("The blog title."),
  handle: s.string("The blog handle."),
  commentable: s.nullableString("The blog comment policy returned by Shopify."),
  tags: s.nullableString("The comma-separated tags from the 200 most recent articles."),
  template_suffix: s.nullableString("The Liquid template suffix used by the blog."),
  feedburner: s.nullableString("The FeedBurner identifier when configured."),
  feedburner_location: s.nullableString("The FeedBurner URL when configured."),
  created_at: s.nullableString("The blog creation timestamp returned by Shopify."),
  updated_at: s.nullableString("The blog update timestamp returned by Shopify."),
  admin_graphql_api_id: s.nullableString("The Shopify Admin GraphQL ID for the blog."),
});
const pageSchema = s.looseRequiredObject("A Shopify REST page object.", {
  id: shopifyIdSchema("The Shopify page ID."),
  title: s.string("The page title."),
  handle: s.string("The page handle."),
  body_html: s.nullableString("The page body HTML returned by Shopify."),
  author: s.nullableString("The page author returned by Shopify."),
  published_at: s.nullableString("The page publication timestamp, or null when hidden."),
  template_suffix: s.nullableString("The Liquid template suffix used by the page."),
  created_at: s.nullableString("The page creation timestamp returned by Shopify."),
  updated_at: s.nullableString("The page update timestamp returned by Shopify."),
  admin_graphql_api_id: s.nullableString("The Shopify Admin GraphQL ID for the page."),
});
const articleSchema = s.looseRequiredObject(
  "A Shopify REST article object.",
  {
    id: shopifyIdSchema("The Shopify article ID."),
    blog_id: shopifyIdSchema("The Shopify blog ID that owns the article."),
    title: s.string("The article title."),
    handle: s.string("The article handle."),
    body_html: s.nullableString("The article body HTML returned by Shopify."),
    summary_html: s.nullableString("The article summary HTML returned by Shopify."),
    author: s.nullableString("The article author returned by Shopify."),
    tags: s.nullableString("The comma-separated article tags returned by Shopify."),
    published_at: s.nullableString("The article publication timestamp, or null when hidden."),
    template_suffix: s.nullableString("The Liquid template suffix used by the article."),
    created_at: s.nullableString("The article creation timestamp returned by Shopify."),
    updated_at: s.nullableString("The article update timestamp returned by Shopify."),
    image: s.nullable(s.looseObject("The article image object returned by Shopify.")),
    admin_graphql_api_id: s.nullableString("The Shopify Admin GraphQL ID for the article."),
  },
  { optional: ["image"] },
);
const listPaginationInput = {
  limit: limitSchema,
  page_info: pageInfoSchema,
};
const dateFilterInput = {
  created_at_min: dateTimeFilterSchema,
  created_at_max: dateTimeFilterSchema,
  updated_at_min: dateTimeFilterSchema,
  updated_at_max: dateTimeFilterSchema,
  published_at_min: dateTimeFilterSchema,
  published_at_max: dateTimeFilterSchema,
};
export const contentActions: ActionDefinition[] = [
  defineProviderAction("shopify", {
    name: "list_blogs",
    operationType: "read",
    description: "List Shopify REST blogs with optional handle filtering and pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Shopify REST blogs.",
      {
        handle: s.nonEmptyString("Filter blogs by Shopify blog handle."),
        since_id: sinceIdSchema,
        ...listPaginationInput,
      },
      { optional: ["handle", "since_id", "limit", "page_info"] },
    ),
    outputSchema: s.requiredObject("The Shopify REST blog list response.", {
      blogs: s.array("Blogs returned by Shopify.", blogSchema),
      pagination: paginationSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "get_blog",
    operationType: "read",
    description: "Retrieve one Shopify REST blog by numeric ID.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input payload for retrieving one Shopify REST blog.", {
      blog_id: shopifyIdSchema("The Shopify blog ID."),
    }),
    outputSchema: s.requiredObject("The Shopify REST blog response.", {
      blog: blogSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "count_blogs",
    operationType: "read",
    description: "Count Shopify REST blogs in the connected shop.",
    requiredScopes: [],
    inputSchema: s.requiredObject("No input is required to count Shopify REST blogs.", {}),
    outputSchema: s.requiredObject("The Shopify REST blog count response.", {
      count: countSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "list_pages",
    operationType: "read",
    description: "List Shopify REST pages with optional filters and pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Shopify REST pages.",
      {
        title: s.nonEmptyString("Retrieve pages with this exact Shopify page title."),
        handle: s.nonEmptyString("Retrieve pages with this Shopify page handle."),
        published_status: publishedStatusSchema,
        since_id: sinceIdSchema,
        ...dateFilterInput,
        ...listPaginationInput,
      },
      {
        optional: [
          "title",
          "handle",
          "published_status",
          "since_id",
          "created_at_min",
          "created_at_max",
          "updated_at_min",
          "updated_at_max",
          "published_at_min",
          "published_at_max",
          "limit",
          "page_info",
        ],
      },
    ),
    outputSchema: s.requiredObject("The Shopify REST page list response.", {
      pages: s.array("Pages returned by Shopify.", pageSchema),
      pagination: paginationSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "get_page",
    operationType: "read",
    description: "Retrieve one Shopify REST page by numeric ID.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input payload for retrieving one Shopify REST page.", {
      page_id: shopifyIdSchema("The Shopify page ID."),
    }),
    outputSchema: s.requiredObject("The Shopify REST page response.", {
      page: pageSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "count_pages",
    operationType: "read",
    description: "Count Shopify REST pages with optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for counting Shopify REST pages.",
      {
        title: s.nonEmptyString("Count pages with this exact Shopify page title."),
        published_status: publishedStatusSchema,
        ...dateFilterInput,
      },
      {
        optional: [
          "title",
          "published_status",
          "created_at_min",
          "created_at_max",
          "updated_at_min",
          "updated_at_max",
          "published_at_min",
          "published_at_max",
        ],
      },
    ),
    outputSchema: s.requiredObject("The Shopify REST page count response.", {
      count: countSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "list_articles",
    operationType: "read",
    description: "List Shopify REST articles in a blog with optional filters and pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Shopify REST articles.",
      {
        blog_id: shopifyIdSchema("The Shopify blog ID."),
        author: s.nonEmptyString("Filter articles by author."),
        handle: s.nonEmptyString("Retrieve an article with this Shopify article handle."),
        tag: s.nonEmptyString("Filter articles by tag."),
        published_status: publishedStatusSchema,
        since_id: sinceIdSchema,
        ...dateFilterInput,
        ...listPaginationInput,
      },
      {
        optional: [
          "author",
          "handle",
          "tag",
          "published_status",
          "since_id",
          "created_at_min",
          "created_at_max",
          "updated_at_min",
          "updated_at_max",
          "published_at_min",
          "published_at_max",
          "limit",
          "page_info",
        ],
      },
    ),
    outputSchema: s.requiredObject("The Shopify REST article list response.", {
      articles: s.array("Articles returned by Shopify.", articleSchema),
      pagination: paginationSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "get_article",
    operationType: "read",
    description: "Retrieve one Shopify REST article by blog ID and article ID.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input payload for retrieving one Shopify REST article.", {
      blog_id: shopifyIdSchema("The Shopify blog ID."),
      article_id: shopifyIdSchema("The Shopify article ID."),
    }),
    outputSchema: s.requiredObject("The Shopify REST article response.", {
      article: articleSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "count_articles",
    operationType: "read",
    description: "Count Shopify REST articles in a blog with optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for counting Shopify REST articles.",
      {
        blog_id: shopifyIdSchema("The Shopify blog ID."),
        published_status: publishedStatusSchema,
        ...dateFilterInput,
      },
      {
        optional: [
          "published_status",
          "created_at_min",
          "created_at_max",
          "updated_at_min",
          "updated_at_max",
          "published_at_min",
          "published_at_max",
        ],
      },
    ),
    outputSchema: s.requiredObject("The Shopify REST article count response.", {
      count: countSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "list_article_tags",
    operationType: "read",
    description: "List Shopify REST article tags across all articles in the connected shop.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Shopify REST article tags.",
      {
        limit: limitSchema,
        popular: s.boolean("Whether Shopify should order tags by popularity."),
      },
      { optional: ["limit", "popular"] },
    ),
    outputSchema: s.requiredObject("The Shopify REST article tags response.", {
      tags: s.array("Article tags returned by Shopify.", s.string("One article tag.")),
    }),
  }),
  defineProviderAction("shopify", {
    name: "list_blog_article_tags",
    operationType: "read",
    description: "List Shopify REST article tags for one blog.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Shopify REST article tags in one blog.",
      {
        blog_id: shopifyIdSchema("The Shopify blog ID."),
        limit: limitSchema,
        popular: s.boolean("Whether Shopify should order tags by popularity."),
      },
      { optional: ["limit", "popular"] },
    ),
    outputSchema: s.requiredObject("The Shopify REST blog article tags response.", {
      tags: s.array("Article tags returned by Shopify.", s.string("One article tag.")),
    }),
  }),
  defineProviderAction("shopify", {
    name: "list_article_authors",
    operationType: "read",
    description: "List Shopify REST article authors across the connected shop.",
    requiredScopes: [],
    inputSchema: s.requiredObject("No input is required to list Shopify REST article authors.", {}),
    outputSchema: s.requiredObject("The Shopify REST article authors response.", {
      authors: s.array("Article authors returned by Shopify.", s.string("One article author.")),
    }),
  }),
];
