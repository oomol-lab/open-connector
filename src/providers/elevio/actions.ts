import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "elevio";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const idInput = s.positiveInteger("The Elevio numeric resource ID.");
const pageInput = s.positiveInteger("The page number to request.");
const epochMillisInput = s.nonNegativeInteger("Epoch millisecond timestamp used by Elevio filters.");
const tagsInput = s.array(
  "Article tags to filter by. Elevio receives each value as a repeated tag[] query parameter.",
  nonEmptyString("One article tag."),
);
const stringArray = (description: string, itemDescription: string) => s.array(description, s.string(itemDescription));

const smartGroupSchema = s.looseObject("An Elevio smart group reference.", {
  id: s.integer("The smart group ID."),
  name: s.string("The smart group name."),
});

const categoryTranslationSchema = s.looseObject("An Elevio category translation.", {
  id: s.integer("The translation ID."),
  language_id: s.string("The translation language code."),
  title: s.string("The translated category title."),
});

const categorySchema = s.looseObject("An Elevio category resource.", {
  id: s.integer("The Elevio category ID."),
  parent_category_id: s.nullable(s.integer("The parent category ID.")),
  source: s.string("The source that created the category."),
  external_id: s.nullable(s.string("The category identifier in the source system.")),
  order: s.integer("Sort order for displaying the category."),
  access: s.string("Deprecated Elevio access level for the category."),
  restriction: s.string("Direct access restriction for the category."),
  discoverable: s.boolean("Whether articles in the category are searchable and listable."),
  is_internal: s.boolean("Whether the category is internal only."),
  access_emails: stringArray("Deprecated email allow-list values returned by Elevio.", "One allowed email address."),
  access_domains: stringArray("Deprecated domain allow-list values returned by Elevio.", "One allowed domain."),
  access_groups: stringArray("Deprecated group allow-list values returned by Elevio.", "One allowed group."),
  smart_groups: s.array("Smart groups attached to the category.", smartGroupSchema),
  translations: s.array("Translations available for the category.", categoryTranslationSchema),
  created_at: s.string("Timestamp when the category was created."),
  updated_at: s.string("Timestamp when the category was last updated."),
});

const userSchema = s.looseObject("An Elevio user reference.", {
  id: s.integer("The Elevio user ID."),
  name: s.string("The user display name."),
  gravatar: s.string("The user Gravatar URL."),
  email: s.email("The user email address."),
});

const articleTranslationSchema = s.looseObject("An Elevio article translation.", {
  id: s.integer("The translation ID."),
  title: s.string("The translated article title."),
  body: s.string("The translated article body."),
  summary: s.string("The translated article summary."),
  machine_summary: s.string("Deprecated machine-generated article summary."),
  language_id: s.string("The translation language code."),
  keywords: stringArray("Language-specific translation keywords.", "One translation keyword."),
  tags: stringArray("Language-specific translation tags.", "One translation tag."),
  created_at: s.string("Timestamp when the translation was created."),
  updated_at: s.string("Timestamp when the translation was last updated."),
});

const articleSchema = s.looseObject("An Elevio article resource.", {
  id: s.integer("The Elevio article ID."),
  title: s.string("The article title derived from the default translation."),
  order: s.integer("Sort order for displaying the article."),
  creator: userSchema,
  author: userSchema,
  source: s.string("The source that created the article."),
  external_id: s.nullable(s.string("The article identifier in the source system.")),
  editor_version: s.string("The Elevio editor version used for the article."),
  notes: s.string("Internal notes for contributors."),
  keywords: stringArray("Global article keywords.", "One global article keyword."),
  category_id: s.integer("The category ID that contains the article."),
  access: s.string("Deprecated Elevio access level for the article."),
  restriction: s.string("Direct access restriction for the article."),
  discoverable: s.boolean("Whether the article is searchable and listable."),
  is_internal: s.boolean("Whether the article is internal only."),
  access_emails: stringArray("Deprecated email allow-list values returned by Elevio.", "One allowed email address."),
  access_domains: stringArray("Deprecated domain allow-list values returned by Elevio.", "One allowed domain."),
  access_groups: stringArray("Deprecated group allow-list values returned by Elevio.", "One allowed group."),
  smart_groups: s.array("Smart groups attached to the article.", smartGroupSchema),
  status: s.string("The article publication status."),
  last_publisher: userSchema,
  last_published_at: s.string("Timestamp when the article was last published."),
  contributors: s.array("Users who contributed to the article.", userSchema),
  created_at: s.string("Timestamp when the article was created."),
  updated_at: s.string("Timestamp when the article was last updated."),
  tags: stringArray("Tags associated with the article.", "One article tag."),
  translations: s.array("Translations available for the article.", articleTranslationSchema),
});

const listArticlesInputSchema = s.object(
  "Query parameters for listing Elevio articles.",
  {
    page: pageInput,
    pageSize: s.positiveInteger("Number of articles per page. Elevio allows up to 500.", { maximum: 500 }),
    status: s.stringEnum("Filter articles by publication status.", ["draft", "published"]),
    fromCreatedAt: epochMillisInput,
    toCreatedAt: epochMillisInput,
    fromPublishedAt: epochMillisInput,
    toPublishedAt: epochMillisInput,
    tags: tagsInput,
  },
  {
    optional: [
      "page",
      "pageSize",
      "status",
      "fromCreatedAt",
      "toCreatedAt",
      "fromPublishedAt",
      "toPublishedAt",
      "tags",
    ],
  },
);

const searchArticlesInputSchema = s.object(
  "Query parameters for searching Elevio articles.",
  {
    languageCode: nonEmptyString("The Elevio language code to search, such as en."),
    query: nonEmptyString("Search keywords to look for in article content."),
    page: pageInput,
    rows: s.positiveInteger("Number of search rows to return. Elevio allows up to 100.", { maximum: 100 }),
    tags: tagsInput,
    userEmail: s.email("Optional user email used for Elevio access filtering."),
    groups: s.array(
      "Optional user groups used for Elevio access filtering.",
      nonEmptyString("One Elevio access group."),
    ),
    hash: nonEmptyString("Optional user hash used for Elevio access filtering."),
    url: nonEmptyString("Optional originating domain or page URL used for Elevio access filtering."),
  },
  { optional: ["page", "rows", "tags", "userEmail", "groups", "hash", "url"] },
);

const idInputSchema = s.object("Input parameters for retrieving an Elevio resource by ID.", {
  id: idInput,
});

const listCategoriesOutputSchema = s.object("Elevio categories list response.", {
  categories: s.array("Categories returned by Elevio.", categorySchema),
});

const getCategoryOutputSchema = s.object("Elevio category lookup response.", {
  category: categorySchema,
});

const listArticlesOutputSchema = s.object(
  "Elevio articles list response with upstream pagination metadata.",
  {
    articles: s.array("Articles returned by Elevio.", articleSchema),
    page_number: s.integer("Current Elevio page number."),
    page_size: s.integer("Current Elevio page size."),
    total_pages: s.integer("Total number of result pages."),
    total_entries: s.integer("Total number of matching articles."),
  },
  { optional: ["page_number", "page_size", "total_pages", "total_entries"] },
);

const getArticleOutputSchema = s.object("Elevio article lookup response.", {
  article: articleSchema,
});

const searchResultSchema = s.looseObject("One Elevio article search result.", {
  id: s.anyOf("The matching article ID returned by Elevio.", [
    s.string("The matching article ID as a string."),
    s.integer("The matching article ID as a number."),
  ]),
  title: s.string("The highlighted article title returned by Elevio."),
});

const searchArticlesOutputSchema = s.object("Elevio article search response.", {
  queryTerm: s.string("The query term Elevio searched for."),
  totalResults: s.integer("Total number of matching search results."),
  totalPages: s.integer("Total number of result pages."),
  currentPage: s.integer("Current result page."),
  count: s.integer("Number of results in this response."),
  results: s.array("Article search results returned by Elevio.", searchResultSchema),
});

export const elevioActions: Array<ProviderActionDefinition<ElevioActionName>> = [
  defineProviderAction(service, {
    name: "list_categories",
    description: "List Elevio knowledge base categories.",
    inputSchema: s.object("Input parameters for listing Elevio categories.", {}),
    outputSchema: listCategoriesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_category",
    description: "Get one Elevio knowledge base category by ID.",
    inputSchema: idInputSchema,
    outputSchema: getCategoryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_articles",
    description: "List Elevio knowledge base articles with optional pagination and filters.",
    inputSchema: listArticlesInputSchema,
    outputSchema: listArticlesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_article",
    description: "Get one Elevio knowledge base article by ID.",
    inputSchema: idInputSchema,
    outputSchema: getArticleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_articles",
    description: "Search Elevio articles in a language with optional access filters.",
    inputSchema: searchArticlesInputSchema,
    outputSchema: searchArticlesOutputSchema,
  }),
];

export type ElevioActionName = "list_categories" | "get_category" | "list_articles" | "get_article" | "search_articles";
