import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "biorxiv_medrxiv";

const serverSchema = s.stringEnum("The preprint server to query.", ["biorxiv", "medrxiv"]);
const dateSchema = s.string("A date in YYYY-MM-DD format.", { format: "date" });
const cursorSchema = s.integer("The zero-based result offset.", { minimum: 0 });
const intervalSchema = s.stringEnum("The reporting interval.", ["monthly", "yearly"]);

const preprintSchema = s.looseRequiredObject(
  "A preprint version returned by the bioRxiv API.",
  {
    doi: s.string("The preprint DOI."),
    title: s.string("The preprint title."),
    authors: s.string("The semicolon-separated author list."),
    author_corresponding: s.string("The corresponding author name."),
    author_corresponding_institution: s.string("The corresponding author institution."),
    date: dateSchema,
    version: s.string("The preprint version number."),
    type: s.string("The submission type reported by the server."),
    license: s.string("The license code reported by the server."),
    category: s.string("The subject category."),
    jatsxml: s.string("The URL of the JATS XML source."),
    abstract: s.string("The preprint abstract."),
    funder: s.unknown("The funding metadata returned by the server."),
    published: s.string("The published DOI, or NA when none is reported."),
    server: s.string("The display name of the source preprint server."),
  },
  {
    optional: [
      "authors",
      "author_corresponding",
      "author_corresponding_institution",
      "type",
      "license",
      "category",
      "jatsxml",
      "abstract",
      "funder",
      "published",
      "server",
    ],
  },
);

const publicationSchema = s.looseRequiredObject(
  "A bioRxiv preprint-to-journal publication mapping.",
  {
    biorxiv_doi: s.string("The bioRxiv preprint DOI."),
    published_doi: s.string("The journal article DOI."),
    preprint_title: s.string("The preprint title."),
    preprint_category: s.string("The preprint subject category."),
    preprint_date: dateSchema,
    published_date: dateSchema,
  },
  {
    optional: ["published_doi", "preprint_title", "preprint_category", "preprint_date", "published_date"],
  },
);

const pageMetadataSchema = {
  cursor: s.integer("The zero-based offset reported for this page."),
  count: s.integer("The number of records returned on this page."),
  total: s.nullable(s.integer("The total number of matching records when reported.")),
};

const dateRangeInputSchema = s.object(
  "A date range and page offset for a bioRxiv API query.",
  {
    startDate: dateSchema,
    endDate: dateSchema,
    cursor: cursorSchema,
  },
  { optional: ["cursor"] },
);

export const biorxivMedrxivActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_preprints",
    operationType: "read",
    description: "List bioRxiv or medRxiv preprint versions posted within a date range.",
    inputSchema: s.object(
      "Input parameters for listing preprints.",
      {
        server: serverSchema,
        startDate: dateSchema,
        endDate: dateSchema,
        cursor: cursorSchema,
        category: s.nonEmptyString("An optional subject category filter."),
      },
      { optional: ["cursor", "category"] },
    ),
    outputSchema: s.object("A page of preprint versions.", {
      ...pageMetadataSchema,
      preprints: s.array("The preprint versions on this page.", preprintSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_preprint",
    operationType: "read",
    description: "Get all versions of one bioRxiv or medRxiv preprint by DOI.",
    inputSchema: s.object("Input parameters for getting a preprint.", {
      server: serverSchema,
      doi: s.nonEmptyString("The preprint DOI, such as 10.1101/339747."),
    }),
    outputSchema: s.object("The versions returned for one preprint DOI.", {
      found: s.boolean("Whether the API returned at least one version."),
      preprints: s.array("All returned versions of the preprint.", preprintSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_published_articles",
    operationType: "read",
    description: "List bioRxiv preprints linked to journal publications within a date range.",
    inputSchema: dateRangeInputSchema,
    outputSchema: s.object("A page of preprint-to-publication mappings.", {
      ...pageMetadataSchema,
      publications: s.array("The publication mappings on this page.", publicationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_publisher_articles",
    operationType: "read",
    description: "List published bioRxiv papers for a publisher DOI prefix and date range.",
    inputSchema: s.object(
      "A publisher DOI prefix, date range, and page offset.",
      {
        startDate: dateSchema,
        endDate: dateSchema,
        cursor: cursorSchema,
        publisherPrefix: s.nonEmptyString("The publisher DOI prefix, such as 10.15252."),
      },
      { optional: ["cursor"] },
    ),
    outputSchema: s.object("A page of publication mappings for the publisher.", {
      ...pageMetadataSchema,
      publications: s.array("The publication mappings on this page.", publicationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_content_statistics",
    operationType: "read",
    description: "Get monthly or yearly bioRxiv content submission statistics.",
    inputSchema: s.object("Input parameters for content statistics.", {
      interval: intervalSchema,
    }),
    outputSchema: s.object("The bioRxiv content statistics response.", {
      statistics: s.array("The content statistics rows.", s.looseObject("One content statistics row.", {})),
    }),
  }),
  defineProviderAction(service, {
    name: "get_usage_statistics",
    operationType: "read",
    description: "Get monthly or yearly usage statistics for bioRxiv or medRxiv.",
    inputSchema: s.object("Input parameters for usage statistics.", {
      server: serverSchema,
      interval: intervalSchema,
    }),
    outputSchema: s.object("The server usage statistics response.", {
      statistics: s.array("The usage statistics rows.", s.looseObject("One usage statistics row.", {})),
    }),
  }),
];
