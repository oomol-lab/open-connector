import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "semantic_scholar" as const;

const nonEmptyString = (description: string) => s.string(description, { minLength: 1, pattern: "\\S" });

const paperIdSchema = nonEmptyString(
  "The Semantic Scholar paper ID, CorpusId, DOI:<doi>, ARXIV:<id>, MAG:<id>, ACL:<id>, PMID:<id>, or PMCID:<id>.",
);

const authorIdSchema = nonEmptyString("The Semantic Scholar author ID.");

const fieldsSchema = nonEmptyString(
  "A comma-separated list of Semantic Scholar fields to return, using dot notation for nested fields when needed.",
);

const searchQuerySchema = nonEmptyString(
  "The plain-text search query. Semantic Scholar does not support special query syntax.",
);

const yearSchema = nonEmptyString(
  "The publication year or inclusive year range, such as 2019, 2016-2020, 2010-, or -2015.",
);

const publicationDateOrYearSchema = nonEmptyString(
  "The publication date or year filter, such as 2019, 2020-06, 2016-03-05:2020-06-06, 1981-08-25:, or :2015-01.",
);

const limit100Schema = s.integer("The maximum number of results to return.", {
  minimum: 1,
  maximum: 100,
});

const limit500Schema = s.integer("The maximum number of recommendations to return.", {
  minimum: 1,
  maximum: 500,
});

const offsetSchema = s.nonNegativeInteger("The zero-based pagination offset.");

const tokenSchema = nonEmptyString("The continuation token returned by Semantic Scholar.");

const venueSchema = nonEmptyString(
  "A comma-separated list of publication venues to filter by, using full names or abbreviations.",
);

const fieldsOfStudySchema = nonEmptyString("A comma-separated list of fields of study to filter by.");

const publicationTypesSchema = nonEmptyString(
  "A comma-separated list of publication types to filter by, such as Review, JournalArticle, or Conference.",
);

const minCitationCountSchema = s.nonNegativeInteger("The minimum number of citations a paper must have.");

const openAccessPdfSchema = s.boolean("Whether to restrict results to papers with a public PDF available.");

const paperIdsSchema = s.array("The paper IDs to request.", paperIdSchema, {
  minItems: 1,
  maxItems: 500,
});

const authorIdsSchema = s.array("The author IDs to request.", authorIdSchema, {
  minItems: 1,
  maxItems: 1_000,
});

const paperPayloadSchema = s.looseObject("The paper object returned by Semantic Scholar.");
const authorPayloadSchema = s.looseObject("The author object returned by Semantic Scholar.");
const snippetPayloadSchema = s.looseObject("The text snippet object returned by Semantic Scholar.");

const paperListOutputSchema = s.object("A Semantic Scholar paper list response.", {
  total: s.nullable(s.integer("The total result count when Semantic Scholar returns it.")),
  offset: s.nullable(s.integer("The returned result offset when Semantic Scholar returns it.")),
  next: s.nullable(s.integer("The next offset when Semantic Scholar returns it.")),
  token: s.nullable(s.string("The continuation token when Semantic Scholar returns it.")),
  papers: s.array("The papers returned by Semantic Scholar.", paperPayloadSchema),
  raw: s.looseObject("The raw Semantic Scholar response payload."),
});

const authorListOutputSchema = s.object("A Semantic Scholar author list response.", {
  total: s.nullable(s.integer("The total result count when Semantic Scholar returns it.")),
  offset: s.nullable(s.integer("The returned result offset when Semantic Scholar returns it.")),
  next: s.nullable(s.integer("The next offset when Semantic Scholar returns it.")),
  authors: s.array("The authors returned by Semantic Scholar.", authorPayloadSchema),
  raw: s.looseObject("The raw Semantic Scholar response payload."),
});

const edgeListOutputSchema = s.object("A Semantic Scholar paper edge list response.", {
  total: s.nullable(s.integer("The total edge count when Semantic Scholar returns it.")),
  offset: s.nullable(s.integer("The returned result offset when Semantic Scholar returns it.")),
  next: s.nullable(s.integer("The next offset when Semantic Scholar returns it.")),
  data: s.array(
    "The citation or reference edges returned by Semantic Scholar.",
    s.looseObject("One paper edge returned by Semantic Scholar."),
  ),
  raw: s.looseObject("The raw Semantic Scholar response payload."),
});

const getPaperAction = defineProviderAction(service, {
  name: "get_paper",
  description: "Get details for a Semantic Scholar paper by paper ID or external identifier.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for retrieving a Semantic Scholar paper.",
    {
      paperId: paperIdSchema,
      fields: fieldsSchema,
    },
    { optional: ["fields"] },
  ),
  outputSchema: s.object("The response returned when retrieving a Semantic Scholar paper.", {
    paper: paperPayloadSchema,
  }),
});

const getPapersAction = defineProviderAction(service, {
  name: "get_papers",
  description: "Get details for multiple Semantic Scholar papers at once.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for retrieving multiple Semantic Scholar papers.",
    {
      paperIds: paperIdsSchema,
      fields: fieldsSchema,
    },
    { optional: ["fields"] },
  ),
  outputSchema: s.object("The response returned when retrieving multiple Semantic Scholar papers.", {
    papers: s.array("The papers returned in the same order as the requested IDs.", s.nullable(paperPayloadSchema)),
  }),
});

const searchPapersAction = defineProviderAction(service, {
  name: "search_papers",
  description: "Search Semantic Scholar papers by relevance with optional publication filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for searching Semantic Scholar papers by relevance.",
    {
      query: searchQuerySchema,
      fields: fieldsSchema,
      limit: limit100Schema,
      offset: offsetSchema,
      year: yearSchema,
      venue: venueSchema,
      fieldsOfStudy: fieldsOfStudySchema,
      publicationTypes: publicationTypesSchema,
      publicationDateOrYear: publicationDateOrYearSchema,
      minCitationCount: minCitationCountSchema,
      openAccessPdf: openAccessPdfSchema,
    },
    {
      optional: [
        "fields",
        "limit",
        "offset",
        "year",
        "venue",
        "fieldsOfStudy",
        "publicationTypes",
        "publicationDateOrYear",
        "minCitationCount",
        "openAccessPdf",
      ],
    },
  ),
  outputSchema: paperListOutputSchema,
});

const bulkSearchPapersAction = defineProviderAction(service, {
  name: "bulk_search_papers",
  description: "Bulk-search Semantic Scholar papers and page through large result sets with tokens.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for bulk-searching Semantic Scholar papers.",
    {
      query: searchQuerySchema,
      fields: fieldsSchema,
      limit: limit100Schema,
      token: tokenSchema,
      year: yearSchema,
      venue: venueSchema,
      fieldsOfStudy: fieldsOfStudySchema,
      publicationTypes: publicationTypesSchema,
      publicationDateOrYear: publicationDateOrYearSchema,
      minCitationCount: minCitationCountSchema,
      openAccessPdf: openAccessPdfSchema,
    },
    {
      optional: [
        "fields",
        "limit",
        "token",
        "year",
        "venue",
        "fieldsOfStudy",
        "publicationTypes",
        "publicationDateOrYear",
        "minCitationCount",
        "openAccessPdf",
      ],
    },
  ),
  outputSchema: paperListOutputSchema,
});

const matchPaperTitleAction = defineProviderAction(service, {
  name: "match_paper_title",
  description: "Find the best Semantic Scholar paper match for a paper title.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for matching a Semantic Scholar paper title.",
    {
      query: searchQuerySchema,
      fields: fieldsSchema,
    },
    { optional: ["fields"] },
  ),
  outputSchema: s.object("The response returned when matching a Semantic Scholar paper title.", {
    paper: s.nullable(paperPayloadSchema),
    raw: s.looseObject("The raw Semantic Scholar response payload."),
  }),
});

const autocompletePapersAction = defineProviderAction(service, {
  name: "autocomplete_papers",
  description: "Suggest Semantic Scholar paper query completions.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for Semantic Scholar paper autocomplete.",
    {
      query: searchQuerySchema,
      limit: limit100Schema,
    },
    { optional: ["limit"] },
  ),
  outputSchema: s.object("The response returned by Semantic Scholar paper autocomplete.", {
    completions: s.array(
      "The autocomplete suggestions returned by Semantic Scholar.",
      s.looseObject("One autocomplete suggestion returned by Semantic Scholar."),
    ),
    raw: s.looseObject("The raw Semantic Scholar response payload."),
  }),
});

const getPaperAuthorsAction = defineProviderAction(service, {
  name: "get_paper_authors",
  description: "List authors for a Semantic Scholar paper.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Semantic Scholar paper authors.",
    {
      paperId: paperIdSchema,
      fields: fieldsSchema,
      limit: limit100Schema,
      offset: offsetSchema,
    },
    { optional: ["fields", "limit", "offset"] },
  ),
  outputSchema: authorListOutputSchema,
});

const getPaperCitationsAction = defineProviderAction(service, {
  name: "get_paper_citations",
  description: "List papers that cite a Semantic Scholar paper.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Semantic Scholar paper citations.",
    {
      paperId: paperIdSchema,
      fields: fieldsSchema,
      limit: limit100Schema,
      offset: offsetSchema,
    },
    { optional: ["fields", "limit", "offset"] },
  ),
  outputSchema: edgeListOutputSchema,
});

const getPaperReferencesAction = defineProviderAction(service, {
  name: "get_paper_references",
  description: "List papers referenced by a Semantic Scholar paper.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Semantic Scholar paper references.",
    {
      paperId: paperIdSchema,
      fields: fieldsSchema,
      limit: limit100Schema,
      offset: offsetSchema,
    },
    { optional: ["fields", "limit", "offset"] },
  ),
  outputSchema: edgeListOutputSchema,
});

const searchAuthorsAction = defineProviderAction(service, {
  name: "search_authors",
  description: "Search Semantic Scholar authors by name.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for searching Semantic Scholar authors.",
    {
      query: searchQuerySchema,
      fields: fieldsSchema,
      limit: limit100Schema,
      offset: offsetSchema,
    },
    { optional: ["fields", "limit", "offset"] },
  ),
  outputSchema: authorListOutputSchema,
});

const getAuthorAction = defineProviderAction(service, {
  name: "get_author",
  description: "Get details for a Semantic Scholar author.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for retrieving a Semantic Scholar author.",
    {
      authorId: authorIdSchema,
      fields: fieldsSchema,
    },
    { optional: ["fields"] },
  ),
  outputSchema: s.object("The response returned when retrieving a Semantic Scholar author.", {
    author: authorPayloadSchema,
  }),
});

const getAuthorsAction = defineProviderAction(service, {
  name: "get_authors",
  description: "Get details for multiple Semantic Scholar authors at once.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for retrieving multiple Semantic Scholar authors.",
    {
      authorIds: authorIdsSchema,
      fields: fieldsSchema,
    },
    { optional: ["fields"] },
  ),
  outputSchema: s.object("The response returned when retrieving multiple Semantic Scholar authors.", {
    authors: s.array("The authors returned in the same order as the requested IDs.", s.nullable(authorPayloadSchema)),
  }),
});

const getAuthorPapersAction = defineProviderAction(service, {
  name: "get_author_papers",
  description: "List papers written by a Semantic Scholar author.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Semantic Scholar author papers.",
    {
      authorId: authorIdSchema,
      fields: fieldsSchema,
      limit: limit100Schema,
      offset: offsetSchema,
    },
    { optional: ["fields", "limit", "offset"] },
  ),
  outputSchema: paperListOutputSchema,
});

const searchSnippetsAction = defineProviderAction(service, {
  name: "search_snippets",
  description: "Search text snippets in Semantic Scholar papers.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for searching Semantic Scholar text snippets.",
    {
      query: searchQuerySchema,
      limit: limit100Schema,
    },
    { optional: ["limit"] },
  ),
  outputSchema: s.object("The response returned by Semantic Scholar text snippet search.", {
    total: s.nullable(s.integer("The total result count when Semantic Scholar returns it.")),
    offset: s.nullable(s.integer("The returned result offset when Semantic Scholar returns it.")),
    next: s.nullable(s.integer("The next offset when Semantic Scholar returns it.")),
    snippets: s.array("The snippets returned by Semantic Scholar.", snippetPayloadSchema),
    raw: s.looseObject("The raw Semantic Scholar response payload."),
  }),
});

const recommendForPaperAction = defineProviderAction(service, {
  name: "recommend_for_paper",
  description: "Get recommended Semantic Scholar papers for one positive example paper.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for recommending papers from one Semantic Scholar paper.",
    {
      paperId: paperIdSchema,
      fields: fieldsSchema,
      limit: limit500Schema,
    },
    { optional: ["fields", "limit"] },
  ),
  outputSchema: paperListOutputSchema,
});

const recommendPapersAction = defineProviderAction(service, {
  name: "recommend_papers",
  description: "Get recommended Semantic Scholar papers from positive and optional negative examples.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for recommending Semantic Scholar papers from example paper IDs.",
    {
      positivePaperIds: s.array("The paper IDs that represent positive examples.", paperIdSchema, {
        minItems: 1,
        maxItems: 500,
      }),
      negativePaperIds: s.array("The paper IDs that represent negative examples.", paperIdSchema, {
        minItems: 1,
        maxItems: 500,
      }),
      fields: fieldsSchema,
      limit: limit500Schema,
    },
    { optional: ["negativePaperIds", "fields", "limit"] },
  ),
  outputSchema: paperListOutputSchema,
});

export const semanticScholarActions: ActionDefinition[] = [
  getPaperAction,
  getPapersAction,
  searchPapersAction,
  bulkSearchPapersAction,
  matchPaperTitleAction,
  autocompletePapersAction,
  getPaperAuthorsAction,
  getPaperCitationsAction,
  getPaperReferencesAction,
  searchAuthorsAction,
  getAuthorAction,
  getAuthorsAction,
  getAuthorPapersAction,
  searchSnippetsAction,
  recommendForPaperAction,
  recommendPapersAction,
];
