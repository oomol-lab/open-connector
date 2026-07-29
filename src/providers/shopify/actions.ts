import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "shopify" as const;
const contentScope = "content";

const shopifyIdSchema = (description: string) => s.integer(description, { minimum: 1 });
const nullableStringSchema = (description: string) => s.nullable(s.string(description));
const nonEmptyStringSchema = (description: string) => s.string(description, { minLength: 1 });
const limitSchema = s.integer("The maximum number of records to return. Shopify REST supports values from 1 to 250.", {
  minimum: 1,
  maximum: 250,
});
const pageInfoSchema = s.string("The opaque Shopify REST page_info cursor from a previous response pagination value.", {
  minLength: 1,
});
const sinceIdSchema = shopifyIdSchema("Return records with Shopify numeric IDs greater than this value.");
const dateTimeFilterSchema = s.string("An ISO 8601 date-time filter accepted by Shopify REST Admin.", { minLength: 1 });
const publishedStatusSchema = s.stringEnum("The Shopify publication status filter.", [
  "published",
  "unpublished",
  "any",
]);

const rawObjectSchema = s.looseObject("The raw object returned by Shopify REST Admin.");
const paginationSchema = s.object("Shopify REST Link-header pagination cursors.", {
  nextPageInfo: s.nullable(s.string("The page_info cursor for the next page when Shopify returned one.")),
  previousPageInfo: s.nullable(s.string("The page_info cursor for the previous page when Shopify returned one.")),
});
const countSchema = s.nonNegativeInteger("The count returned by Shopify REST Admin.");

const shopSchema = s.looseRequiredObject("A Shopify REST shop object.", {
  id: shopifyIdSchema("The Shopify shop ID."),
  name: s.string("The shop display name."),
  myshopify_domain: s.string("The canonical myshopify.com domain for the shop."),
});

const blogSchema = s.looseRequiredObject("A Shopify REST blog object.", {
  id: shopifyIdSchema("The Shopify blog ID."),
  title: s.string("The blog title."),
  handle: s.string("The blog handle."),
  commentable: nullableStringSchema("The blog comment policy returned by Shopify."),
  tags: nullableStringSchema("The comma-separated tags from the 200 most recent articles."),
  template_suffix: nullableStringSchema("The Liquid template suffix used by the blog."),
  feedburner: nullableStringSchema("The FeedBurner identifier when configured."),
  feedburner_location: nullableStringSchema("The FeedBurner URL when configured."),
  created_at: nullableStringSchema("The blog creation timestamp returned by Shopify."),
  updated_at: nullableStringSchema("The blog update timestamp returned by Shopify."),
  admin_graphql_api_id: nullableStringSchema("The Shopify Admin GraphQL ID for the blog."),
});

const pageSchema = s.looseRequiredObject("A Shopify REST page object.", {
  id: shopifyIdSchema("The Shopify page ID."),
  title: s.string("The page title."),
  handle: s.string("The page handle."),
  body_html: nullableStringSchema("The page body HTML returned by Shopify."),
  author: nullableStringSchema("The page author returned by Shopify."),
  published_at: nullableStringSchema("The page publication timestamp, or null when hidden."),
  template_suffix: nullableStringSchema("The Liquid template suffix used by the page."),
  created_at: nullableStringSchema("The page creation timestamp returned by Shopify."),
  updated_at: nullableStringSchema("The page update timestamp returned by Shopify."),
  admin_graphql_api_id: nullableStringSchema("The Shopify Admin GraphQL ID for the page."),
});

const articleSchema = s.looseRequiredObject(
  "A Shopify REST article object.",
  {
    id: shopifyIdSchema("The Shopify article ID."),
    blog_id: shopifyIdSchema("The Shopify blog ID that owns the article."),
    title: s.string("The article title."),
    handle: s.string("The article handle."),
    body_html: nullableStringSchema("The article body HTML returned by Shopify."),
    summary_html: nullableStringSchema("The article summary HTML returned by Shopify."),
    author: nullableStringSchema("The article author returned by Shopify."),
    tags: nullableStringSchema("The comma-separated article tags returned by Shopify."),
    published_at: nullableStringSchema("The article publication timestamp, or null when hidden."),
    template_suffix: nullableStringSchema("The Liquid template suffix used by the article."),
    created_at: nullableStringSchema("The article creation timestamp returned by Shopify."),
    updated_at: nullableStringSchema("The article update timestamp returned by Shopify."),
    image: s.nullable(s.looseObject("The article image object returned by Shopify.")),
    admin_graphql_api_id: nullableStringSchema("The Shopify Admin GraphQL ID for the article."),
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

export type ShopifyActionName =
  | "get_shop"
  | "list_blogs"
  | "get_blog"
  | "count_blogs"
  | "list_pages"
  | "get_page"
  | "count_pages"
  | "list_articles"
  | "get_article"
  | "count_articles"
  | "list_article_tags"
  | "list_blog_article_tags"
  | "list_article_authors";

export const shopifyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_shop",
    description: "Retrieve the connected Shopify REST Admin shop configuration.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to retrieve the Shopify shop.", {}),
    outputSchema: s.object("The Shopify REST shop response.", {
      shop: shopSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_blogs",
    description: "List Shopify REST blogs with optional handle filtering and pagination.",
    requiredScopes: [contentScope],
    inputSchema: s.object(
      "The input payload for listing Shopify REST blogs.",
      {
        handle: nonEmptyStringSchema("Filter blogs by Shopify blog handle."),
        since_id: sinceIdSchema,
        ...listPaginationInput,
      },
      { optional: ["handle", "since_id", "limit", "page_info"] },
    ),
    outputSchema: s.object("The Shopify REST blog list response.", {
      blogs: s.array("Blogs returned by Shopify.", blogSchema),
      pagination: paginationSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_blog",
    description: "Retrieve one Shopify REST blog by numeric ID.",
    requiredScopes: [contentScope],
    inputSchema: s.object("The input payload for retrieving one Shopify REST blog.", {
      blog_id: shopifyIdSchema("The Shopify blog ID."),
    }),
    outputSchema: s.object("The Shopify REST blog response.", {
      blog: blogSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "count_blogs",
    description: "Count Shopify REST blogs in the connected shop.",
    requiredScopes: [contentScope],
    inputSchema: s.object("No input is required to count Shopify REST blogs.", {}),
    outputSchema: s.object("The Shopify REST blog count response.", {
      count: countSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_pages",
    description: "List Shopify REST pages with optional filters and pagination.",
    requiredScopes: [contentScope],
    inputSchema: s.object(
      "The input payload for listing Shopify REST pages.",
      {
        title: nonEmptyStringSchema("Retrieve pages with this exact Shopify page title."),
        handle: nonEmptyStringSchema("Retrieve pages with this Shopify page handle."),
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
    outputSchema: s.object("The Shopify REST page list response.", {
      pages: s.array("Pages returned by Shopify.", pageSchema),
      pagination: paginationSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_page",
    description: "Retrieve one Shopify REST page by numeric ID.",
    requiredScopes: [contentScope],
    inputSchema: s.object("The input payload for retrieving one Shopify REST page.", {
      page_id: shopifyIdSchema("The Shopify page ID."),
    }),
    outputSchema: s.object("The Shopify REST page response.", {
      page: pageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "count_pages",
    description: "Count Shopify REST pages with optional filters.",
    requiredScopes: [contentScope],
    inputSchema: s.object(
      "The input payload for counting Shopify REST pages.",
      {
        title: nonEmptyStringSchema("Count pages with this exact Shopify page title."),
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
    outputSchema: s.object("The Shopify REST page count response.", {
      count: countSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_articles",
    description: "List Shopify REST articles in a blog with optional filters and pagination.",
    requiredScopes: [contentScope],
    inputSchema: s.object(
      "The input payload for listing Shopify REST articles.",
      {
        blog_id: shopifyIdSchema("The Shopify blog ID."),
        author: nonEmptyStringSchema("Filter articles by author."),
        handle: nonEmptyStringSchema("Retrieve an article with this Shopify article handle."),
        tag: nonEmptyStringSchema("Filter articles by tag."),
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
    outputSchema: s.object("The Shopify REST article list response.", {
      articles: s.array("Articles returned by Shopify.", articleSchema),
      pagination: paginationSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_article",
    description: "Retrieve one Shopify REST article by blog ID and article ID.",
    requiredScopes: [contentScope],
    inputSchema: s.object("The input payload for retrieving one Shopify REST article.", {
      blog_id: shopifyIdSchema("The Shopify blog ID."),
      article_id: shopifyIdSchema("The Shopify article ID."),
    }),
    outputSchema: s.object("The Shopify REST article response.", {
      article: articleSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "count_articles",
    description: "Count Shopify REST articles in a blog with optional filters.",
    requiredScopes: [contentScope],
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
    outputSchema: s.object("The Shopify REST article count response.", {
      count: countSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_article_tags",
    description: "List Shopify REST article tags across all articles in the connected shop.",
    requiredScopes: [contentScope],
    inputSchema: s.object(
      "The input payload for listing Shopify REST article tags.",
      {
        limit: limitSchema,
        popular: s.boolean("Whether Shopify should order tags by popularity."),
      },
      { optional: ["limit", "popular"] },
    ),
    outputSchema: s.object("The Shopify REST article tags response.", {
      tags: s.array("Article tags returned by Shopify.", s.string("One article tag.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_blog_article_tags",
    description: "List Shopify REST article tags for one blog.",
    requiredScopes: [contentScope],
    inputSchema: s.object(
      "The input payload for listing Shopify REST article tags in one blog.",
      {
        blog_id: shopifyIdSchema("The Shopify blog ID."),
        limit: limitSchema,
        popular: s.boolean("Whether Shopify should order tags by popularity."),
      },
      { optional: ["limit", "popular"] },
    ),
    outputSchema: s.object("The Shopify REST blog article tags response.", {
      tags: s.array("Article tags returned by Shopify.", s.string("One article tag.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_article_authors",
    description: "List Shopify REST article authors across the connected shop.",
    requiredScopes: [contentScope],
    inputSchema: s.object("No input is required to list Shopify REST article authors.", {}),
    outputSchema: s.object("The Shopify REST article authors response.", {
      authors: s.array("Article authors returned by Shopify.", s.string("One article author.")),
    }),
  }),
];
