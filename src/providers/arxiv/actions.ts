import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "arxiv";

const arxivIdSchema = s.nonEmptyString("The arXiv identifier to fetch, such as 2301.00001 or 2301.00001v1.");
const searchQuerySchema = s.nonEmptyString(
  "The arXiv search query, using the official query syntax such as all:graphene or au:del_maestro.",
);
const categorySchema = s.nonEmptyString(
  "The arXiv category term to query, such as cs.AI, cs.LG, math.CO, or physics.optics.",
);
const authorSchema = s.nonEmptyString("The author name to search for in arXiv author fields.");
const titleSchema = s.nonEmptyString("The title text to search for in arXiv title fields.");
const abstractQuerySchema = s.nonEmptyString("The text to search for in arXiv abstract fields.");

const startSchema = s.integer("The zero-based result offset to request.", {
  minimum: 0,
  maximum: 30000,
});
const maxResultsSchema = s.integer("The maximum number of papers to return.", {
  minimum: 1,
  maximum: 100,
});
const sortBySchema = s.stringEnum("The arXiv sort field.", [
  "relevance",
  "lastUpdatedDate",
  "submittedDate",
]);
const sortOrderSchema = s.stringEnum("The arXiv sort direction.", ["ascending", "descending"]);

const paperSchema = s.object("A normalized arXiv paper.", {
  id: s.string("The versioned arXiv identifier, such as 2301.00001v1."),
  baseId: s.string("The arXiv identifier without the version suffix."),
  version: s.nullable(s.integer("The arXiv version number when present.")),
  title: s.string("The paper title."),
  summary: s.string("The paper abstract text."),
  publishedAt: s.dateTime("The paper publication timestamp from arXiv."),
  updatedAt: s.dateTime("The paper update timestamp from arXiv."),
  authors: s.array("The paper authors.", s.string("One author name.")),
  categories: s.array("The arXiv category terms assigned to the paper.", s.string("One category.")),
  primaryCategory: s.nullable(s.string("The primary arXiv category term.")),
  abstractUrl: s.url("The arXiv abstract page URL."),
  pdfUrl: s.nullable(s.url("The arXiv PDF URL when arXiv provides one.")),
  doi: s.nullable(s.string("The DOI returned by arXiv when present.")),
  journalRef: s.nullable(s.string("The journal reference returned by arXiv when present.")),
  comment: s.nullable(s.string("The author comment returned by arXiv when present.")),
});

const searchOutputSchema = s.object("The response returned by an arXiv query.", {
  totalResults: s.integer("The total number of results reported by arXiv."),
  startIndex: s.integer("The zero-based start index reported by arXiv."),
  itemsPerPage: s.integer("The result page size reported by arXiv."),
  papers: s.array("The normalized arXiv papers returned by the query.", paperSchema),
});

const searchOptionsSchema = {
  start: startSchema,
  maxResults: maxResultsSchema,
  sortBy: sortBySchema,
  sortOrder: sortOrderSchema,
};

const allFieldsInputSchema = s.object(
  "Input parameters for searching arXiv papers across structured fields.",
  {
    query: s.nonEmptyString("The text to search for across all arXiv fields."),
    author: authorSchema,
    title: titleSchema,
    abstractQuery: abstractQuerySchema,
    category: categorySchema,
    ...searchOptionsSchema,
  },
  {
    optional: [
      "query",
      "author",
      "title",
      "abstractQuery",
      "category",
      "start",
      "maxResults",
      "sortBy",
      "sortOrder",
    ],
  },
);
allFieldsInputSchema.anyOf = [
  { required: ["query"] },
  { required: ["author"] },
  { required: ["title"] },
  { required: ["abstractQuery"] },
  { required: ["category"] },
];

export const arxivActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_papers",
    description: "Search arXiv papers using the official arXiv API query syntax.",
    inputSchema: s.object(
      "Input parameters for searching arXiv papers.",
      {
        query: searchQuerySchema,
        ...searchOptionsSchema,
      },
      { required: ["query"] },
    ),
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_by_author",
    description: "Search arXiv papers by author name.",
    inputSchema: s.object(
      "Input parameters for searching arXiv papers by author.",
      {
        author: authorSchema,
        ...searchOptionsSchema,
      },
      { required: ["author"] },
    ),
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_by_title",
    description: "Search arXiv papers by title text.",
    inputSchema: s.object(
      "Input parameters for searching arXiv papers by title.",
      {
        title: titleSchema,
        ...searchOptionsSchema,
      },
      { required: ["title"] },
    ),
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_by_abstract",
    description: "Search arXiv papers by abstract text.",
    inputSchema: s.object(
      "Input parameters for searching arXiv papers by abstract.",
      {
        abstractQuery: abstractQuerySchema,
        ...searchOptionsSchema,
      },
      { required: ["abstractQuery"] },
    ),
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_by_all_fields",
    description:
      "Search arXiv papers by combining optional all-field, author, title, abstract, and category filters.",
    inputSchema: allFieldsInputSchema,
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_paper",
    description: "Get one arXiv paper by arXiv identifier.",
    inputSchema: s.object("Input parameters for getting one arXiv paper.", {
      id: arxivIdSchema,
    }),
    outputSchema: s.object("The response returned when getting one arXiv paper.", {
      found: s.boolean("Whether arXiv returned a paper for the requested identifier."),
      paper: s.nullable(paperSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_papers",
    description: "Get multiple arXiv papers by arXiv identifiers.",
    inputSchema: s.object(
      "Input parameters for getting multiple arXiv papers.",
      {
        ids: s.array("The arXiv identifiers to fetch.", arxivIdSchema, {
          minItems: 1,
          maxItems: 100,
        }),
        maxResults: maxResultsSchema,
      },
      { required: ["ids"] },
    ),
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_recent_papers",
    description: "List recent arXiv papers for one category sorted by submission date.",
    inputSchema: s.object(
      "Input parameters for listing recent arXiv papers in a category.",
      {
        category: categorySchema,
        start: startSchema,
        maxResults: maxResultsSchema,
        sortOrder: sortOrderSchema,
      },
      { required: ["category"] },
    ),
    outputSchema: searchOutputSchema,
  }),
];

export type ArxivActionName = (typeof arxivActions)[number]["name"];
