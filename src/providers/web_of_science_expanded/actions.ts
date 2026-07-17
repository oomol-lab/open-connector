import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "web_of_science_expanded";

const databaseSchema = s.stringEnum(
  "The Web of Science database to search. WOS searches the Core Collection and WOK searches all entitled databases. Defaults to WOS.",
  [
    "WOS",
    "BCI",
    "BIOABS",
    "BIOSIS",
    "CABI",
    "CCC",
    "CSCD",
    "DCI",
    "DIIDW",
    "FSTA",
    "GRANTS",
    "INSPEC",
    "MEDLINE",
    "PPRN",
    "PQDT",
    "RC",
    "SCIELO",
    "WOK",
    "ZOOREC",
  ],
);

const recordDetailSchema = s.stringEnum(
  "The record detail level. Short records do not count against the Expanded API Full Record quota. Defaults to short.",
  ["short", "full"],
);

const searchLanguageSchema = s.string({
  description:
    "The search language code. WOS supports en, while entitled regional databases may support other languages.",
  minLength: 1,
  pattern: "\\S",
});

const englishLanguageSchema = s.stringEnum("The request language. This endpoint supports only en for English.", ["en"]);

const fieldSelectionSchema = s.array(
  "The official Web of Science record fields to return. Supplying fields uses custom field selection instead of short or full records.",
  s.string({
    description: "One official Web of Science record field name, such as titles or addresses.",
    minLength: 1,
    pattern: "\\S",
  }),
  { minItems: 1 },
);

const paginationInputProperties = {
  limit: s.integer("The maximum number of records to return, from 0 to 100.", {
    minimum: 0,
    maximum: 100,
  }),
  firstRecord: s.integer("The one-based index of the first record to return, up to 100000.", {
    minimum: 1,
    maximum: 100_000,
  }),
};

const expandedDocumentSchema = s.requiredObject("A normalized Web of Science Expanded document.", {
  uid: s.string("The Web of Science unique identifier."),
  title: s.nullableString("The document title when available."),
  sourceTitle: s.nullableString("The publication or source title when available."),
  publicationYear: s.nullableInteger("The publication year when available."),
  documentTypes: s.array("The document types assigned by Web of Science.", s.string("One document type.")),
  authors: s.array(
    "The normalized document authors.",
    s.requiredObject("One document author.", {
      displayName: s.nullableString("The author's display name when available."),
      firstName: s.nullableString("The author's first name when available."),
      lastName: s.nullableString("The author's last name when available."),
      researcherId: s.nullableString("The author's Web of Science ResearcherID when available."),
      orcidId: s.nullableString("The author's ORCID identifier when available."),
    }),
  ),
  identifiers: s.array(
    "The normalized DOI and other document identifiers.",
    s.requiredObject("One document identifier.", {
      type: s.nullableString("The identifier type when available."),
      value: s.nullableString("The identifier value when available."),
    }),
  ),
  timesCited: s.nullableInteger("The Web of Science Core Collection times-cited count when available."),
  raw: s.unknownObject("The raw Expanded API document record."),
});

const metadataSchema = s.requiredObject("Query and pagination metadata.", {
  queryId: s.nullableString("The temporary Web of Science query identifier when available."),
  recordsSearched: s.nullableInteger("The number of records searched when available."),
  recordsFound: s.nullableInteger("The total number of matching records when available."),
  firstRecord: s.integer("The one-based index of the first returned record."),
  limit: s.integer("The requested maximum number of returned records."),
  nextFirstRecord: s.nullableInteger("The firstRecord value for the next page, or null when no next page is known."),
});

const referenceSchema = s.requiredObject("A normalized cited reference.", {
  uid: s.nullableString("The matched Web of Science UID when the reference is indexed."),
  citedAuthor: s.nullableString("The cited author text when available."),
  citedTitle: s.nullableString("The cited document title when available."),
  citedWork: s.nullableString("The cited publication or work when available."),
  year: s.nullableInteger("The cited publication year when available."),
  page: s.nullableInteger("The cited page when available."),
  doi: s.nullableString("The cited DOI when available."),
  timesCited: s.nullableInteger("The cited reference's times-cited count when available."),
  raw: s.unknownObject("The raw cited reference returned by Web of Science."),
});

const citationReportSchema = s.requiredObject("A normalized citation report for one report level.", {
  reportLevel: s.nullableString("The collection level represented by this report."),
  timesCited: s.nullableNumber("The total times-cited value when available."),
  timesCitedSansSelf: s.nullableNumber("The times-cited value excluding self-citations when available."),
  citingItemsSansSelf: s.nullableNumber("The number of citing items excluding self-citations when available."),
  dedupedTimesCited: s.nullableNumber("The de-duplicated times-cited value when available."),
  averagePerItem: s.nullableNumber("The average citations per item when available."),
  averagePerYear: s.nullableNumber("The average citations per year when available."),
  hIndex: s.nullableNumber("The h-index for the query result when available."),
  citingYears: s.nullable(s.unknownObject("The citation counts grouped by citing year when available.")),
  raw: s.unknownObject("The raw citation report entry."),
});

const searchTimeProperties = {
  publishTimeSpan: s.string({
    description: "The publication date range in YYYY-MM-DD+YYYY-MM-DD form.",
    minLength: 1,
    pattern: "\\S",
  }),
  loadTimeSpan: s.string({
    description: "The symbolic database load time span, such as 5D, 30W, 10M, or 8Y.",
    minLength: 1,
    pattern: "\\S",
  }),
  createdTimeSpan: s.string({
    description: "The record creation date range in YYYY-MM-DD+YYYY-MM-DD form.",
    minLength: 1,
    pattern: "\\S",
  }),
  modifiedTimeSpan: s.string({
    description: "The record modification date range in YYYY-MM-DD+YYYY-MM-DD form.",
    minLength: 1,
    pattern: "\\S",
  }),
  timesCitedModifiedTimeSpan: s.string({
    description: "The times-cited modification date range in YYYY-MM-DD+YYYY-MM-DD form.",
    minLength: 1,
    pattern: "\\S",
  }),
};

const timeSpanExclusionConstraints: JsonSchema[] = [
  { not: { required: ["publishTimeSpan", "loadTimeSpan"] } },
  { not: { required: ["publishTimeSpan", "createdTimeSpan"] } },
  { not: { required: ["publishTimeSpan", "modifiedTimeSpan"] } },
  { not: { required: ["publishTimeSpan", "timesCitedModifiedTimeSpan"] } },
  { not: { required: ["loadTimeSpan", "createdTimeSpan"] } },
  { not: { required: ["loadTimeSpan", "modifiedTimeSpan"] } },
  { not: { required: ["loadTimeSpan", "timesCitedModifiedTimeSpan"] } },
  { not: { required: ["createdTimeSpan", "modifiedTimeSpan"] } },
  { not: { required: ["createdTimeSpan", "timesCitedModifiedTimeSpan"] } },
  { not: { required: ["modifiedTimeSpan", "timesCitedModifiedTimeSpan"] } },
];

const wokTimeSpanConstraint: JsonSchema = {
  if: {
    properties: { database: { const: "WOK" } },
    required: ["database"],
  },
  then: {
    not: {
      anyOf: [{ required: ["modifiedTimeSpan"] }, { required: ["timesCitedModifiedTimeSpan"] }],
    },
  },
};

const wosLanguageConstraint: JsonSchema = {
  if: {
    anyOf: [
      { not: { required: ["database"] } },
      {
        properties: { database: { const: "WOS" } },
        required: ["database"],
      },
    ],
  },
  then: {
    properties: {
      language: {
        type: "string",
        pattern: "^\\s*[eE][nN]\\s*$",
      },
    },
  },
};

const customFieldSelectionConstraint: JsonSchema = {
  not: { required: ["fields", "recordDetail"] },
};

const searchDocumentsInputSchema = s.actionInput(
  {
    query: s.string({
      description: "The Web of Science advanced query, such as TS=(machine learning) or DO=10.1000/example.",
      minLength: 1,
      pattern: "\\S",
    }),
    database: databaseSchema,
    language: searchLanguageSchema,
    ...paginationInputProperties,
    sortField: s.string({
      description:
        "The official sort expression, such as PY+D for publication year descending or TC+D for times cited descending.",
      minLength: 1,
      pattern: "\\S",
    }),
    edition: s.string({
      description:
        "The collection and edition expression, such as WOS+SCI, with multiple editions separated by commas.",
      minLength: 1,
      pattern: "\\S",
    }),
    ...searchTimeProperties,
    recordDetail: recordDetailSchema,
    fields: fieldSelectionSchema,
    includeLinks: s.boolean("Whether to include Web of Science gateway links in each record."),
    highlight: s.boolean("Whether to request highlighted matching terms in the records."),
  },
  ["query"],
  "The input payload for searching full or short Web of Science records.",
);

searchDocumentsInputSchema.allOf = [
  ...timeSpanExclusionConstraints,
  wokTimeSpanConstraint,
  wosLanguageConstraint,
  customFieldSelectionConstraint,
];

const searchDocumentsAction = defineProviderAction(service, {
  name: "search_documents",
  description:
    "Search Web of Science Expanded records with advanced queries, quota-aware detail selection, filters, sorting, and pagination.",
  inputSchema: searchDocumentsInputSchema,
  outputSchema: s.actionOutput(
    {
      metadata: metadataSchema,
      documents: s.array("The matching Web of Science documents.", expandedDocumentSchema),
      raw: s.unknownObject("The raw Expanded API search response."),
    },
    "The response returned when searching Expanded records.",
  ),
});

const getDocumentsInputSchema = s.actionInput(
  {
    uids: s.array(
      "The Web of Science UIDs to retrieve in one request.",
      s.string({
        description: "One Web of Science UID, such as WOS:000267144200002.",
        minLength: 1,
        pattern: "\\S",
      }),
      { minItems: 1 },
    ),
    database: databaseSchema,
    language: englishLanguageSchema,
    recordDetail: recordDetailSchema,
    fields: fieldSelectionSchema,
    includeLinks: s.boolean("Whether to include Web of Science gateway links in each record."),
    highlight: s.boolean("Whether to request highlighted matching terms in the records."),
  },
  ["uids"],
  "The input payload for retrieving Expanded records by UID.",
);

getDocumentsInputSchema.allOf = [customFieldSelectionConstraint];

const getDocumentsAction = defineProviderAction(service, {
  name: "get_documents",
  description: "Get one or more Web of Science Expanded records by UID with short, full, or custom field detail.",
  inputSchema: getDocumentsInputSchema,
  outputSchema: s.actionOutput(
    {
      metadata: metadataSchema,
      documents: s.array("The requested Web of Science documents that were found.", expandedDocumentSchema),
      raw: s.unknownObject("The raw Expanded API record response."),
    },
    "The response returned when retrieving Expanded records by UID.",
  ),
});

function relatedDocumentsInputSchema(description: string): JsonSchema {
  const schema = s.actionInput(
    {
      uid: s.string({
        description: "The source Web of Science UID.",
        minLength: 1,
        pattern: "\\S",
      }),
      database: databaseSchema,
      language: englishLanguageSchema,
      ...paginationInputProperties,
      sortField: s.string({
        description: "The official Web of Science sort expression.",
        minLength: 1,
        pattern: "\\S",
      }),
      edition: s.string({
        description:
          "The collection and edition expression, such as WOS+SCI, with multiple editions separated by commas.",
        minLength: 1,
        pattern: "\\S",
      }),
      publishTimeSpan: searchTimeProperties.publishTimeSpan,
      modifiedTimeSpan: searchTimeProperties.modifiedTimeSpan,
      timesCitedModifiedTimeSpan: searchTimeProperties.timesCitedModifiedTimeSpan,
      recordDetail: recordDetailSchema,
      fields: fieldSelectionSchema,
      includeLinks: s.boolean("Whether to include Web of Science gateway links in each record."),
      highlight: s.boolean("Whether to request highlighted matching terms in the records."),
    },
    ["uid"],
    description,
  );
  schema.allOf = [...timeSpanExclusionConstraints, wokTimeSpanConstraint, customFieldSelectionConstraint];
  return schema;
}

const listCitingDocumentsAction = defineProviderAction(service, {
  name: "list_citing_documents",
  description: "List Web of Science documents that cite a source document.",
  inputSchema: relatedDocumentsInputSchema("The input payload for finding documents that cite a source document."),
  outputSchema: s.actionOutput(
    {
      metadata: metadataSchema,
      documents: s.array("The documents that cite the source document.", expandedDocumentSchema),
      raw: s.unknownObject("The raw Expanded API citing response."),
    },
    "The response returned when listing citing documents.",
  ),
});

const listRelatedDocumentsAction = defineProviderAction(service, {
  name: "list_related_documents",
  description: "List Web of Science documents related through shared cited references.",
  inputSchema: relatedDocumentsInputSchema(
    "The input payload for finding documents related through shared cited references.",
  ),
  outputSchema: s.actionOutput(
    {
      metadata: metadataSchema,
      documents: s.array("The documents related to the source document.", expandedDocumentSchema),
      raw: s.unknownObject("The raw Expanded API related-records response."),
    },
    "The response returned when listing related documents.",
  ),
});

const listCitedReferencesAction = defineProviderAction(service, {
  name: "list_cited_references",
  description: "List the bibliographic references cited by a Web of Science document.",
  inputSchema: s.actionInput(
    {
      uid: s.string({
        description: "The source Web of Science UID.",
        minLength: 1,
        pattern: "\\S",
      }),
      database: databaseSchema,
      language: englishLanguageSchema,
      ...paginationInputProperties,
      sortField: s.string({
        description: "The official Web of Science sort expression.",
        minLength: 1,
        pattern: "\\S",
      }),
      highlight: s.boolean("Whether to request highlighted matching terms in the references."),
    },
    ["uid"],
    "The input payload for listing a document's cited references.",
  ),
  outputSchema: s.actionOutput(
    {
      metadata: metadataSchema,
      references: s.array("The references cited by the source document.", referenceSchema),
      raw: s.unknownObject("The raw Expanded API cited-references response."),
    },
    "The response returned when listing cited references.",
  ),
});

const citationReportInputSchema = s.actionInput(
  {
    query: s.string({
      description: "The Web of Science advanced query to analyze.",
      minLength: 1,
      pattern: "\\S",
    }),
    database: databaseSchema,
    language: searchLanguageSchema,
    edition: s.string({
      description:
        "The collection and edition expression, such as WOS+SCI, with multiple editions separated by commas.",
      minLength: 1,
      pattern: "\\S",
    }),
    ...searchTimeProperties,
    reportLevels: s.array(
      "The collection levels to include in the citation report. Defaults to WOS.",
      s.stringEnum("One citation report level.", ["WOS", "AllDB"]),
      { minItems: 1, maxItems: 2 },
    ),
    startYear: s.integer("The first citing year to include, from 1900 onward.", { minimum: 1900 }),
    endYear: s.integer("The last citing year to include, from 1900 onward.", { minimum: 1900 }),
  },
  ["query"],
  "The input payload for generating a citation report from a Web of Science query.",
);

citationReportInputSchema.allOf = [...timeSpanExclusionConstraints, wokTimeSpanConstraint, wosLanguageConstraint];

const getCitationReportAction = defineProviderAction(service, {
  name: "get_citation_report",
  description:
    "Generate citation totals, self-citation-adjusted metrics, yearly counts, and h-index for a Web of Science query.",
  inputSchema: citationReportInputSchema,
  outputSchema: s.actionOutput(
    {
      queryMetadata: s.requiredObject("Metadata for the query used to generate the report.", {
        queryId: s.string("The temporary Web of Science query identifier."),
        recordsSearched: s.nullableInteger("The number of records searched when available."),
        recordsFound: s.nullableInteger("The number of matching records when available."),
      }),
      reports: s.array("The citation reports returned for the requested levels.", citationReportSchema),
      raw: s.unknownObject("The raw query and citation report responses."),
    },
    "The citation report generated for the query.",
  ),
});

export const webOfScienceExpandedActions: ActionDefinition[] = [
  searchDocumentsAction,
  getDocumentsAction,
  listCitingDocumentsAction,
  listCitedReferencesAction,
  listRelatedDocumentsAction,
  getCitationReportAction,
];
