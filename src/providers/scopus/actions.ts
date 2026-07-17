import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "scopus";

const fieldsSchema = s.string({
  description:
    "A comma-separated list of official Elsevier response fields. Supplying fields overrides the selected view.",
  minLength: 1,
  pattern: "\\S",
});
const startSchema = s.nonNegativeInteger("The zero-based result offset.");
const countSchema = s.integer("The maximum number of results to return.", {
  minimum: 1,
  maximum: 200,
});
const referenceCountSchema = s.positiveInteger(
  "The maximum number of reference records to return, subject to the selected endpoint and view limits.",
);
const sortSchema = s.string({
  description:
    "An official Elsevier sort expression. Prefix a field with + or - and separate up to three fields with commas.",
  minLength: 1,
  pattern: "\\S",
});
const facetsSchema = s.string({
  description: "An official Elsevier facet expression, including optional bucket dimensions in parentheses.",
  minLength: 1,
  pattern: "\\S",
});
const dateRangeSchema = s.string({
  description: "The publication year or inclusive year range, such as 2024 or 2020-2024.",
  minLength: 1,
  pattern: "\\S",
});

const quotaSchema = s.requiredObject("The Scopus quota metadata returned in response headers.", {
  limit: s.nullableInteger("The weekly request quota when Elsevier returns it.", { minimum: 0 }),
  remaining: s.nullableInteger("The remaining requests in the current quota window.", {
    minimum: 0,
  }),
  resetAt: s.nullable(s.dateTime("The ISO 8601 time when the current quota window resets.")),
});

const upstreamRecordSchema = s.unknownObject("One raw Scopus record returned by Elsevier.");
const rawResponseSchema = s.unknownObject("The raw JSON response returned by Elsevier.");

const searchOutputSchema = s.actionOutput(
  {
    totalResults: s.nullableInteger("The total number of matching records.", { minimum: 0 }),
    startIndex: s.nullableInteger("The zero-based offset of this result page.", { minimum: 0 }),
    itemsPerPage: s.nullableInteger("The number of records in this result page.", {
      minimum: 0,
    }),
    entries: s.array("The raw Scopus result records in this page.", upstreamRecordSchema),
    facets: s.array("The raw facet buckets returned for this search.", upstreamRecordSchema),
    links: s.array("The navigation links returned for this search.", upstreamRecordSchema),
    quota: quotaSchema,
    raw: rawResponseSchema,
  },
  "A normalized page of Scopus search results.",
);

const searchDocumentsInputSchema = s.actionInput(
  {
    query: s.string({
      description: "The official Scopus Boolean query, such as TITLE-ABS-KEY(machine learning) AND PUBYEAR > 2020.",
      minLength: 1,
      pattern: "\\S",
    }),
    view: s.stringEnum("The Scopus Search response view.", ["STANDARD", "COMPLETE"]),
    fields: fieldsSchema,
    start: startSchema,
    count: s.integer("The maximum number of results. STANDARD supports up to 200; COMPLETE supports up to 25.", {
      minimum: 1,
      maximum: 200,
    }),
    sort: sortSchema,
    dateRange: dateRangeSchema,
    subjectArea: s.string({
      description: "A Scopus subject-area abbreviation such as COMP, MEDI, or SOCI.",
      minLength: 1,
      pattern: "\\S",
    }),
    content: s.stringEnum("The Scopus content category to search.", ["core", "dummy", "all"]),
    facets: facetsSchema,
  },
  ["query"],
  "Input parameters for searching Scopus documents.",
);

searchDocumentsInputSchema.allOf = [
  {
    if: {
      properties: { view: { const: "COMPLETE" } },
      required: ["view"],
    },
    then: {
      properties: { count: { maximum: 25 } },
    },
  },
];

const searchDocumentsAction = defineProviderAction(service, {
  name: "search_documents",
  description: "Search Scopus documents with the official Boolean query syntax and return one normalized result page.",
  inputSchema: searchDocumentsInputSchema,
  outputSchema: searchOutputSchema,
});

const getAbstractAction = defineProviderAction(service, {
  name: "get_abstract",
  description: "Get one Scopus abstract record by a documented document identifier.",
  inputSchema: s.actionInput(
    {
      identifierType: s.stringEnum("The identifier namespace used by the supplied value.", [
        "scopus_id",
        "doi",
        "eid",
        "pii",
        "pubmed_id",
        "pui",
      ]),
      identifier: s.string({
        description: "The document identifier in the selected namespace.",
        minLength: 1,
        pattern: "\\S",
      }),
      view: s.stringEnum("The Abstract Retrieval response view.", ["META", "META_ABS", "FULL", "REF", "ENTITLED"]),
      fields: fieldsSchema,
      referenceStart: startSchema,
      referenceCount: referenceCountSchema,
    },
    ["identifierType", "identifier"],
    "Input parameters for retrieving one Scopus abstract record.",
  ),
  outputSchema: s.actionOutput(
    {
      record: upstreamRecordSchema,
      quota: quotaSchema,
      raw: rawResponseSchema,
    },
    "The result of retrieving one Scopus abstract record.",
  ),
});

const searchAuthorsAction = defineProviderAction(service, {
  name: "search_authors",
  description:
    "Search Scopus author profiles with the official Boolean query syntax and return one normalized result page.",
  inputSchema: s.actionInput(
    {
      query: s.string({
        description: "The official Scopus Author Search query, such as AUTHLASTNAME(Smith) AND AFFIL(University).",
        minLength: 1,
        pattern: "\\S",
      }),
      fields: fieldsSchema,
      start: startSchema,
      count: countSchema,
      sort: sortSchema,
      facets: facetsSchema,
      resolveAliases: s.boolean(
        "Whether Elsevier should substitute superseded author identifiers with their current aliases.",
      ),
    },
    ["query"],
    "Input parameters for searching Scopus author profiles.",
  ),
  outputSchema: searchOutputSchema,
});

const getAuthorAction = defineProviderAction(service, {
  name: "get_author",
  description: "Get Scopus author profile data by author ID, EID, or ORCID.",
  inputSchema: s.actionInput(
    {
      identifierType: s.stringEnum("The identifier namespace used by the supplied value.", [
        "author_id",
        "eid",
        "orcid",
      ]),
      identifier: s.string({
        description: "The author identifier in the selected namespace.",
        minLength: 1,
        pattern: "\\S",
      }),
      view: s.stringEnum("The Author Retrieval response view.", [
        "LIGHT",
        "STANDARD",
        "ENHANCED",
        "METRICS",
        "DOCUMENTS",
        "ENTITLED",
        "ORCID",
        "ORCID_BIO",
        "ORCID_WORKS",
      ]),
      fields: fieldsSchema,
      resolveAliases: s.boolean(
        "Whether Elsevier should substitute a superseded author profile with its current alias.",
      ),
      referenceStart: startSchema,
      referenceCount: referenceCountSchema,
    },
    ["identifierType", "identifier"],
    "Input parameters for retrieving Scopus author profile data.",
  ),
  outputSchema: s.actionOutput(
    {
      profiles: s.array("The author profiles returned by Scopus.", upstreamRecordSchema),
      quota: quotaSchema,
      raw: rawResponseSchema,
    },
    "The result of retrieving Scopus author profile data.",
  ),
});

const searchAffiliationsAction = defineProviderAction(service, {
  name: "search_affiliations",
  description:
    "Search Scopus affiliation profiles with the official Boolean query syntax and return one normalized result page.",
  inputSchema: s.actionInput(
    {
      query: s.string({
        description: "The official Scopus Affiliation Search query, such as AFFIL(University of Oxford).",
        minLength: 1,
        pattern: "\\S",
      }),
      fields: fieldsSchema,
      start: startSchema,
      count: countSchema,
      sort: sortSchema,
      facets: facetsSchema,
    },
    ["query"],
    "Input parameters for searching Scopus affiliation profiles.",
  ),
  outputSchema: searchOutputSchema,
});

const getAffiliationAction = defineProviderAction(service, {
  name: "get_affiliation",
  description: "Get Scopus affiliation profile data by affiliation ID or EID.",
  inputSchema: s.actionInput(
    {
      identifierType: s.stringEnum("The identifier namespace used by the supplied value.", ["affiliation_id", "eid"]),
      identifier: s.string({
        description: "The affiliation identifier in the selected namespace.",
        minLength: 1,
        pattern: "\\S",
      }),
      view: s.stringEnum("The Affiliation Retrieval response view.", [
        "LIGHT",
        "STANDARD",
        "DOCUMENTS",
        "AUTHORS",
        "ENTITLED",
      ]),
      fields: fieldsSchema,
      referenceStart: startSchema,
      referenceCount: referenceCountSchema,
    },
    ["identifierType", "identifier"],
    "Input parameters for retrieving Scopus affiliation profile data.",
  ),
  outputSchema: s.actionOutput(
    {
      profiles: s.array("The affiliation profiles returned by Scopus.", upstreamRecordSchema),
      quota: quotaSchema,
      raw: rawResponseSchema,
    },
    "The result of retrieving Scopus affiliation profile data.",
  ),
});

const searchSourcesAction = defineProviderAction(service, {
  name: "search_sources",
  description: "Search Scopus serial sources by title, ISSN, publisher, subject, content type, or open-access status.",
  inputSchema: s.actionInput(
    {
      title: s.string({
        description: "A partial or complete serial source title.",
        minLength: 1,
        pattern: "\\S",
      }),
      issn: s.string({
        description: "An ISSN identifying a serial source.",
        minLength: 1,
        pattern: "\\S",
      }),
      publisher: s.string({
        description: "A partial publisher name.",
        minLength: 1,
        pattern: "\\S",
      }),
      subjectArea: s.string({
        description: "A Scopus subject-area abbreviation such as COMP, MEDI, or SOCI.",
        minLength: 1,
        pattern: "\\S",
      }),
      subjectCode: s.string({
        description: "A Scopus subject-area code.",
        minLength: 1,
        pattern: "\\S",
      }),
      contentType: s.stringEnum("The serial source content type.", [
        "tradejournal",
        "journal",
        "conferenceproceeding",
        "bookseries",
      ]),
      openAccess: s.stringEnum("The serial source open-access filter.", ["all", "full", "partial", "none"]),
      dateRange: dateRangeSchema,
      view: s.stringEnum("The Serial Title response view.", ["STANDARD", "ENHANCED", "CITESCORE"]),
      fields: fieldsSchema,
      start: startSchema,
      count: countSchema,
    },
    [],
    "Input parameters for searching Scopus serial sources.",
  ),
  outputSchema: searchOutputSchema,
});

export const scopusActions: ActionDefinition[] = [
  searchDocumentsAction,
  getAbstractAction,
  searchAuthorsAction,
  getAuthorAction,
  searchAffiliationsAction,
  getAffiliationAction,
  searchSourcesAction,
];
