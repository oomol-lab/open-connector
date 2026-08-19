import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "helpscout_docs";

const pageInputFields = {
  page: s.positiveInteger("The 1-based page number to request."),
  pageSize: s.positiveInteger("The number of items Help Scout Docs should return per page."),
};

const pageOutputFields = {
  page: s.nullableInteger("The current page number returned by Help Scout Docs."),
  pages: s.nullableInteger("The total number of pages returned by Help Scout Docs."),
  count: s.nullableInteger("The number of items returned on this page."),
};

const siteSchema = s.looseObject("A Help Scout Docs site object returned by the API.");
const collectionSchema = s.looseObject("A Help Scout Docs collection object returned by the API.");
const categorySchema = s.looseObject("A Help Scout Docs category object returned by the API.");
const articleReferenceSchema = s.looseObject("A Help Scout Docs article reference object returned by the API.");
const articleSearchResultSchema = s.looseObject("A Help Scout Docs article search result object returned by the API.");
const articleSchema = s.looseObject("A Help Scout Docs article object returned by the API.");

function pagedOutputSchema(
  name: string,
  itemSchema = s.looseObject(`A Help Scout Docs ${name} object returned by the API.`),
): JsonSchema {
  return s.actionOutput(
    {
      ...pageOutputFields,
      items: s.array(`The Help Scout Docs ${name} objects on this page.`, itemSchema),
    },
    `A paginated list of Help Scout Docs ${name} objects.`,
  );
}

export const helpscoutDocsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_sites",
    description: "List Help Scout Docs sites available to the API key.",
    inputSchema: s.actionInput(pageInputFields, [], "Input parameters for listing Help Scout Docs sites."),
    outputSchema: pagedOutputSchema("site", siteSchema),
  }),
  defineProviderAction(service, {
    name: "list_collections",
    description: "List Help Scout Docs collections available to the API key.",
    inputSchema: s.actionInput(pageInputFields, [], "Input parameters for listing Help Scout Docs collections."),
    outputSchema: pagedOutputSchema("collection", collectionSchema),
  }),
  defineProviderAction(service, {
    name: "list_categories",
    description: "List Help Scout Docs categories in a collection.",
    inputSchema: s.actionInput(
      {
        collectionId: s.nonEmptyString("The Help Scout Docs collection ID whose categories to list."),
        ...pageInputFields,
      },
      ["collectionId"],
      "Input parameters for listing Help Scout Docs categories.",
    ),
    outputSchema: pagedOutputSchema("category", categorySchema),
  }),
  defineProviderAction(service, {
    name: "list_articles",
    description: "List Help Scout Docs articles in a collection or category.",
    inputSchema: s.actionInput(
      {
        collectionId: s.nonEmptyString("The Help Scout Docs collection ID whose articles to list."),
        categoryId: s.nonEmptyString("The Help Scout Docs category ID whose articles to list."),
        ...pageInputFields,
      },
      [],
      "Input parameters for listing Help Scout Docs articles. Provide exactly one of collectionId or categoryId.",
    ),
    outputSchema: pagedOutputSchema("article reference", articleReferenceSchema),
  }),
  defineProviderAction(service, {
    name: "search_articles",
    description: "Search Help Scout Docs articles by query with optional collection and site filters.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString("The search query to run against Help Scout Docs articles."),
        collectionId: s.nonEmptyString("The optional Help Scout Docs collection ID to filter by."),
        siteId: s.nonEmptyString("The optional Help Scout Docs site ID to filter by."),
        visibility: s.stringEnum("The optional collection visibility filter.", ["public", "private"]),
        ...pageInputFields,
      },
      ["query"],
      "Input parameters for searching Help Scout Docs articles.",
    ),
    outputSchema: pagedOutputSchema("article search result", articleSearchResultSchema),
  }),
  defineProviderAction(service, {
    name: "get_article",
    description: "Get a Help Scout Docs article by ID or article number.",
    inputSchema: s.actionInput(
      {
        articleIdOrNumber: s.nonEmptyString("The Help Scout Docs article ID or article number to fetch."),
        draft: s.boolean("Whether to return the draft version when unpublished changes exist."),
      },
      ["articleIdOrNumber"],
      "Input parameters for getting a Help Scout Docs article.",
    ),
    outputSchema: s.actionOutput(
      {
        article: articleSchema,
      },
      "A Help Scout Docs article returned by the API.",
    ),
  }),
];
