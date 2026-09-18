import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lacuna";

const entityTypeSchema = s.stringEnum("The Lacuna entity type.", [
  "paper",
  "cluster",
  "direction",
  "author",
  "institution",
  "venue",
  "hypothesis",
]);
const searchFilterTypeSchema = s.stringEnum("The normalized entity type applied by Lacuna.", [
  "all",
  "paper",
  "cluster",
  "author",
  "institution",
  "venue",
  "hypothesis",
]);
const entityIdSchema = s.union(
  [s.nonEmptyString("A Lacuna entity identifier."), s.positiveInteger("A numeric Lacuna entity identifier.")],
  { description: "The Lacuna entity identifier." },
);
const entityUrlSchema = s.url("The canonical Lacuna page URL for the entity.");
const searchResultSchema = s.looseRequiredObject(
  "One Lacuna search result. Additional fields depend on the entity type.",
  {
    type: entityTypeSchema,
    id: s.nonEmptyString("The Lacuna entity identifier."),
    score: s.number("The relevance score reported by Lacuna."),
    url: entityUrlSchema,
    title: s.string("The paper, direction, venue, or hypothesis title when present."),
    name: s.string("The author or institution name when present."),
    year: s.integer("The publication year when present."),
  },
  { optional: ["title", "name", "year"] },
);
const searchOutputSchema = s.requiredObject("A page of Lacuna search results.", {
  query: s.string("The normalized search query."),
  type_filter: searchFilterTypeSchema,
  total_results: s.nonNegativeInteger("The total number of matching Lacuna entities."),
  results: s.array("The matching Lacuna entities.", searchResultSchema),
});

const paperSummarySchema = s.looseRequiredObject(
  "A compact Lacuna paper record. Additional fields may be present in full views.",
  {
    id: s.nonEmptyString("The Lacuna paper artifact identifier."),
    url: entityUrlSchema,
    title: s.string("The paper title."),
    year: s.integer("The publication year."),
    venue: s.string("The publication venue when present."),
    authors: s.array(
      "The compact author names or author objects returned for the paper.",
      s.union([s.string("An author name."), s.looseObject("A Lacuna author record.")]),
    ),
  },
  { optional: ["year", "venue", "authors"] },
);
const commonContextProperties: Record<string, JsonSchema> = {
  type: entityTypeSchema,
  id: entityIdSchema,
  context_key: s.string("The stable Lacuna context key."),
  title: s.string("The entity title when present."),
  name: s.string("The entity name when present."),
  url: entityUrlSchema,
  markdown_url: s.url("The Lacuna Markdown page URL when present."),
  summary_markdown: s.string("The source-linked Lacuna summary in Markdown when present."),
  profile_markdown: s.string("The source-linked Lacuna author profile in Markdown when present."),
};

const paperOutputSchema = s.looseRequiredObject(
  "A Lacuna paper view with source links and view-specific fields.",
  {
    ...commonContextProperties,
    artifact_id: s.nonEmptyString("The normalized Lacuna paper artifact identifier."),
  },
  {
    optional: [
      "type",
      "id",
      "context_key",
      "title",
      "name",
      "url",
      "markdown_url",
      "summary_markdown",
      "profile_markdown",
    ],
  },
);
const directionOutputSchema = s.looseRequiredObject(
  "A Lacuna research direction view with source-linked summaries and related entities.",
  {
    ...commonContextProperties,
    cluster_id: s.positiveInteger("The normalized Lacuna research direction identifier."),
    papers: s.array("A compact set of papers in the direction when present.", paperSummarySchema),
  },
  {
    optional: [
      "type",
      "id",
      "context_key",
      "title",
      "name",
      "url",
      "markdown_url",
      "summary_markdown",
      "profile_markdown",
      "papers",
    ],
  },
);
const directionPapersOutputSchema = s.looseRequiredObject(
  "One page of papers attached to a Lacuna research direction.",
  {
    cluster_id: s.positiveInteger("The normalized Lacuna research direction identifier."),
    papers: s.array("The papers attached to the research direction.", paperSummarySchema),
    page: s.positiveInteger("The returned one-based page number."),
    limit: s.positiveInteger("The returned page size."),
    total: s.nonNegativeInteger("The total number of papers in the direction."),
    has_more: s.boolean("Whether another page is available."),
  },
  { optional: ["page", "limit", "total", "has_more"] },
);
const authorOutputSchema = s.looseRequiredObject(
  "A Lacuna author context with papers, research directions, and source-linked profile content.",
  {
    ...commonContextProperties,
    author_id: s.nonEmptyString("The normalized Lacuna author identifier."),
    papers: s.array("A compact set of the author's papers when present.", paperSummarySchema),
  },
  {
    optional: [
      "type",
      "id",
      "context_key",
      "title",
      "name",
      "url",
      "markdown_url",
      "summary_markdown",
      "profile_markdown",
      "papers",
    ],
  },
);
const hypothesisOutputSchema = s.looseRequiredObject(
  "A Lacuna generated research hypothesis with its source-linked summary and directions.",
  {
    ...commonContextProperties,
    hypothesis_id: s.nonEmptyString("The normalized Lacuna hypothesis identifier."),
  },
  {
    optional: [
      "type",
      "id",
      "context_key",
      "title",
      "name",
      "url",
      "markdown_url",
      "summary_markdown",
      "profile_markdown",
    ],
  },
);

const partialDateSchema = s.string("An inclusive publication date bound in YYYY, YYYY-MM, or YYYY-MM-DD format.", {
  pattern: "^(?!0000)\\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\\d|3[01]))?)?$",
});
const contextViewSchema = s.stringEnum("The Lacuna response view.", ["context", "full"]);

export const lacunaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search",
    operationType: "read",
    description:
      "Search Lacuna's machine-learning research map for papers, research directions, authors, venues, institutions, or generated hypotheses.",
    inputSchema: s.object(
      "Input parameters for searching Lacuna.",
      {
        query: s.nonEmptyString("The research query."),
        searchType: s.stringEnum("The entity type to search, including official aliases.", [
          "all",
          "paper",
          "papers",
          "cluster",
          "clusters",
          "direction",
          "directions",
          "author",
          "authors",
          "institution",
          "institutions",
          "venue",
          "venues",
          "hypothesis",
          "hypotheses",
          "proposal",
          "proposals",
        ]),
        limit: s.integer("The maximum number of results to return.", { minimum: 1, maximum: 50 }),
        offset: s.nonNegativeInteger("The zero-based result offset."),
        dateFrom: partialDateSchema,
        dateTo: partialDateSchema,
        venue: s.nonEmptyString("A venue name or key used to filter paper results."),
        sort: s.stringEnum("The result ordering.", ["relevance", "year_desc", "year_asc"]),
        rankingProfile: s.stringEnum("The Lacuna ranking profile.", [
          "default",
          "lexical",
          "semantic",
          "bm25",
          "bm25_title_abstract",
        ]),
        fields: s.nonEmptyString(
          "Optional comma-separated lexical fields with optional weights, such as title^4,abstract. Each field must exist on the searched type: title (paper, cluster, venue, hypothesis), abstract/summary/concepts (paper), name (author, institution, venue), top_names (cluster, hypothesis), venue (paper, venue).",
        ),
      },
      {
        optional: ["searchType", "limit", "offset", "dateFrom", "dateTo", "venue", "sort", "rankingProfile", "fields"],
      },
    ),
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_paper",
    operationType: "read",
    description: "Get a Lacuna paper by artifact ID or Lacuna paper URL.",
    inputSchema: s.object(
      "Input parameters for getting a Lacuna paper.",
      {
        paperIdOrUrl: s.nonEmptyString("A Lacuna paper artifact ID or Lacuna paper URL."),
        view: s.stringEnum("The paper response view.", [
          "context",
          "full",
          "preview",
          "blog",
          "figures",
          "concepts",
          "neighbors",
        ]),
        figureLimit: s.nonNegativeInteger("The maximum number of figures in the context view."),
      },
      { optional: ["view", "figureLimit"] },
    ),
    outputSchema: paperOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_direction",
    operationType: "read",
    description: "Get a Lacuna research direction by numeric ID or Lacuna direction URL.",
    inputSchema: s.object(
      "Input parameters for getting a Lacuna research direction.",
      {
        directionIdOrUrl: s.union(
          [
            s.positiveInteger("A numeric Lacuna research direction identifier."),
            s.nonEmptyString("A Lacuna research direction identifier or URL."),
          ],
          { description: "A Lacuna research direction identifier or URL." },
        ),
        view: contextViewSchema,
      },
      { optional: ["view"] },
    ),
    outputSchema: directionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_direction_papers",
    operationType: "read",
    description: "List papers attached to a Lacuna research direction.",
    inputSchema: s.object(
      "Input parameters for listing papers in a Lacuna research direction.",
      {
        directionIdOrUrl: s.union(
          [
            s.positiveInteger("A numeric Lacuna research direction identifier."),
            s.nonEmptyString("A Lacuna research direction identifier or URL."),
          ],
          { description: "A Lacuna research direction identifier or URL." },
        ),
        page: s.positiveInteger("The one-based page number."),
        limit: s.integer("The number of papers to return.", { minimum: 1, maximum: 100 }),
        view: s.stringEnum("The per-paper response view.", ["compact", "full"]),
      },
      { optional: ["page", "limit", "view"] },
    ),
    outputSchema: directionPapersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_author_context",
    operationType: "read",
    description: "Get a source-linked Lacuna research context for an author.",
    inputSchema: s.object(
      "Input parameters for getting a Lacuna author context.",
      {
        authorIdOrUrl: s.nonEmptyString("A Lacuna author ID or Lacuna author URL."),
        view: contextViewSchema,
        includeNeighbors: s.boolean("Whether to include similar researchers in the author context."),
      },
      { optional: ["view", "includeNeighbors"] },
    ),
    outputSchema: authorOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_hypothesis",
    operationType: "read",
    description: "Get a generated Lacuna research hypothesis by ID or Lacuna hypothesis URL.",
    inputSchema: s.object(
      "Input parameters for getting a Lacuna research hypothesis.",
      {
        hypothesisIdOrUrl: s.nonEmptyString("A Lacuna hypothesis ID or Lacuna hypothesis URL."),
        view: contextViewSchema,
      },
      { optional: ["view"] },
    ),
    outputSchema: hypothesisOutputSchema,
  }),
];
