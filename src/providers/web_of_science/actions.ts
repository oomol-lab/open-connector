import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "web_of_science";

const databaseSchema = s.stringEnum("The Web of Science database abbreviation to search. Defaults to WOS.", [
  "BCI",
  "BIOABS",
  "BIOSIS",
  "CCC",
  "DIIDW",
  "DRCI",
  "MEDLINE",
  "PPRN",
  "RC",
  "WOK",
  "WOS",
  "ZOOREC",
]);

const detailSchema = s.stringEnum(
  "The record detail level. Full records are returned when this field is omitted or set to full.",
  ["full", "short"],
);

const metadataSchema = s.requiredObject("Pagination metadata returned by Web of Science.", {
  total: s.nullableInteger("The total number of matching records when available."),
  page: s.nullableInteger("The one-based page number when available."),
  limit: s.nullableInteger("The maximum number of records on the page when available."),
});

const documentSchema = s.requiredObject("A normalized Web of Science document record.", {
  uid: s.string("The Web of Science unique identifier."),
  title: s.nullableString("The document title when available."),
  types: s.array("The normalized document types.", s.string("One normalized document type.")),
  sourceTypes: s.array("The source document types.", s.string("One source document type.")),
  source: s.nullable(s.unknownObject("The Web of Science source metadata when available.")),
  names: s.nullable(s.unknownObject("The contributor and author metadata when available.")),
  links: s.nullable(s.unknownObject("The Web of Science product links when available.")),
  citations: s.array("The times-cited entries returned by Web of Science.", s.unknownObject("One times-cited entry.")),
  identifiers: s.nullable(s.unknownObject("The DOI, ISSN, ISBN, PubMed, and related identifiers when available.")),
  keywords: s.nullable(s.unknownObject("The document keyword metadata when available.")),
  raw: s.unknownObject("The raw document object returned by Web of Science."),
});

const journalSchema = s.requiredObject("A normalized Web of Science journal record.", {
  id: s.nullableString("The Web of Science journal identifier when available."),
  name: s.nullableString("The journal's full name when available."),
  jcrTitle: s.nullableString("The Journal Citation Reports abbreviation when available."),
  isoTitle: s.nullableString("The ISO journal title when available."),
  issn: s.nullableString("The journal ISSN when available."),
  eIssn: s.nullableString("The journal electronic ISSN when available."),
  previousIssn: s.array("The previous ISSNs associated with the journal.", s.string("One previous ISSN.")),
  links: s.array("The Web of Science product links for the journal.", s.unknownObject("One journal product link.")),
  raw: s.unknownObject("The raw journal object returned by Web of Science."),
});

const searchDocumentsInputSchema = s.actionInput(
  {
    query: s.string({
      description: "The Web of Science advanced query, such as TS=(machine learning) or DO=10.1000/example.",
      minLength: 1,
      pattern: "\\S",
    }),
    database: databaseSchema,
    limit: s.integer("The maximum number of records to return on this page.", {
      minimum: 1,
      maximum: 50,
    }),
    page: s.integer("The one-based page number to retrieve.", { minimum: 1 }),
    sortField: s.string({
      description:
        "The sort expression, such as PY+D for publication year descending or TC+D for times cited descending.",
      minLength: 1,
      pattern: "\\S",
    }),
    modifiedTimeSpan: s.string({
      description: "The record modification date range in YYYY-MM-DD+YYYY-MM-DD form.",
      minLength: 1,
      pattern: "\\S",
    }),
    publishTimeSpan: s.string({
      description: "The publication date range in YYYY-MM-DD+YYYY-MM-DD form.",
      minLength: 1,
      pattern: "\\S",
    }),
    timesCitedModifiedTimeSpan: s.string({
      description: "The times-cited modification date range in YYYY-MM-DD+YYYY-MM-DD form.",
      minLength: 1,
      pattern: "\\S",
    }),
    detail: detailSchema,
    edition: s.string({
      description:
        "The collection and edition expression, such as WOS+SCI, with multiple editions separated by commas.",
      minLength: 1,
      pattern: "\\S",
    }),
  },
  ["query"],
  "The input payload for searching Web of Science documents.",
);

searchDocumentsInputSchema.allOf = [
  {
    not: { required: ["modifiedTimeSpan", "publishTimeSpan"] },
  },
  {
    if: {
      properties: { database: { const: "WOK" } },
      required: ["database"],
    },
    then: {
      not: {
        anyOf: [{ required: ["modifiedTimeSpan"] }, { required: ["timesCitedModifiedTimeSpan"] }],
      },
    },
  },
];

const searchDocumentsAction = defineProviderAction(service, {
  name: "search_documents",
  description: "Search Web of Science documents with Starter API advanced queries, filters, sorting, and pagination.",
  inputSchema: searchDocumentsInputSchema,
  outputSchema: s.actionOutput(
    {
      metadata: metadataSchema,
      documents: s.array("The matching Web of Science documents.", documentSchema),
      raw: s.unknownObject("The raw Web of Science list response."),
    },
    "The response returned when searching Web of Science documents.",
  ),
});

const getDocumentAction = defineProviderAction(service, {
  name: "get_document",
  description: "Get one Web of Science document by its accession number (UID).",
  inputSchema: s.actionInput(
    {
      uid: s.string({
        description: "The Web of Science accession number, such as WOS:000267144200002.",
        minLength: 1,
        pattern: "\\S",
      }),
      detail: detailSchema,
    },
    ["uid"],
    "The input payload for retrieving one Web of Science document.",
  ),
  outputSchema: s.actionOutput(
    { document: documentSchema },
    "The response returned when retrieving one Web of Science document.",
  ),
});

const searchJournalsAction = defineProviderAction(service, {
  name: "search_journals",
  description: "Search Web of Science journals, optionally by ISSN.",
  inputSchema: s.actionInput(
    {
      issn: s.string({
        description: "The print, electronic, or previous ISSN to search for.",
        minLength: 1,
        pattern: "\\S",
      }),
    },
    [],
    "The input payload for searching Web of Science journals.",
  ),
  outputSchema: s.actionOutput(
    {
      metadata: metadataSchema,
      journals: s.array("The matching Web of Science journals.", journalSchema),
      raw: s.unknownObject("The raw Web of Science journal list response."),
    },
    "The response returned when searching Web of Science journals.",
  ),
});

const getJournalAction = defineProviderAction(service, {
  name: "get_journal",
  description: "Get one Web of Science journal by its journal identifier.",
  inputSchema: s.actionInput(
    {
      id: s.string({
        description: "The Web of Science journal identifier returned by search_journals.",
        minLength: 1,
        pattern: "\\S",
      }),
    },
    ["id"],
    "The input payload for retrieving one Web of Science journal.",
  ),
  outputSchema: s.actionOutput(
    { journal: journalSchema },
    "The response returned when retrieving one Web of Science journal.",
  ),
});

export const webOfScienceActions: ActionDefinition[] = [
  searchDocumentsAction,
  getDocumentAction,
  searchJournalsAction,
  getJournalAction,
];
