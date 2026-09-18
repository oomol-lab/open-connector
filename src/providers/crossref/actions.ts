import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "crossref";

const mailtoSchema = s.email(
  "An email address that identifies the caller to Crossref and enables the polite API pool.",
);

const doiSchema = s.nonWhitespaceString(
  "The DOI of the work, such as 10.1038/nphys1170. A doi.org URL is also accepted.",
);

const rowsSchema = s.integer("The number of results to return. Use 0 for counts only.", {
  minimum: 0,
  maximum: 100,
});

const cursorRowsSchema = s.integer("The number of results to return in this cursor page.", {
  minimum: 1,
  maximum: 100,
});

const offsetSchema = s.integer(
  "The zero-based result offset. Crossref recommends cursor pagination for deep result sets.",
  { minimum: 0, maximum: 10000 },
);

const cursorSchema = s.nonEmptyString(
  "Use * for the first cursor page, then reuse nextCursor with the exact same action and query. The wrapped Crossref cursor expires after five minutes of inactivity.",
  { maxLength: 12_000 },
);

const querySchema = s.nonEmptyString(
  "A full-text query across the metadata fields supported by the selected endpoint.",
);

const filterSchema = s.nonEmptyString(
  "A Crossref filter expression, such as from-pub-date:2024-01-01,type:journal-article.",
);

const sortSchema = s.stringEnum("The field used to sort Crossref works.", [
  "created",
  "deposited",
  "indexed",
  "is-referenced-by-count",
  "issued",
  "published",
  "published-online",
  "published-print",
  "references-count",
  "relevance",
  "score",
  "updated",
]);

const orderSchema = s.stringEnum("The result sort direction.", ["asc", "desc"]);

const rawObjectSchema = s.looseObject("The raw Crossref metadata object.");

const authorSchema = s.object("A normalized Crossref contributor.", {
  given: s.nullable(s.string("The contributor given name.")),
  family: s.nullable(s.string("The contributor family name.")),
  name: s.nullable(s.string("The contributor literal or organization name.")),
  orcid: s.nullable(s.string("The contributor ORCID URL or identifier.")),
  sequence: s.nullable(s.string("The contributor sequence value returned by Crossref.")),
});

const workSchema = s.object("A normalized Crossref work.", {
  doi: s.nullable(s.string("The DOI of the work.")),
  title: s.nullable(s.string("The primary work title.")),
  subtitle: s.nullable(s.string("The primary work subtitle.")),
  type: s.nullable(s.string("The Crossref work type.")),
  publisher: s.nullable(s.string("The work publisher.")),
  containerTitle: s.nullable(s.string("The primary journal, book, or container title.")),
  publishedAt: s.nullable(s.string("The normalized publication date at the available precision.")),
  url: s.nullable(s.string("The canonical URL returned by Crossref.")),
  abstract: s.nullable(s.string("The abstract deposited with Crossref when available.")),
  authors: s.array("The normalized work contributors.", authorSchema),
  referenceCount: s.nullable(s.integer("The number of references deposited for the work.")),
  citedByCount: s.nullable(s.integer("The number of Crossref citations to the work.")),
  score: s.nullable(s.number("The relevance score returned for a search result.")),
  raw: rawObjectSchema,
});

const listMetaSchema = s.object("Normalized pagination metadata from a Crossref list response.", {
  totalResults: s.nullable(s.integer("The total number of matching records.")),
  returnedCount: s.integer("The actual number of records returned in this response page."),
  nextCursor: s.nullable(
    s.string(
      "The next connector cursor for cursor-mode requests. It wraps an upstream Crossref cursor that expires after five minutes of inactivity. Its presence does not guarantee another record; stop when returnedCount is smaller than the requested rows.",
    ),
  ),
});

const listWorksOutputSchema = s.object("The normalized response from a Crossref works list.", {
  meta: listMetaSchema,
  works: s.array("The normalized Crossref works.", workSchema),
  facets: rawObjectSchema,
});

const citationFormatSchema = s.stringEnum("The citation or metadata format to export.", [
  "bibtex",
  "ris",
  "csl_json",
  "formatted",
  "rdf_xml",
  "turtle",
  "unixref_xml",
  "unixsd_xml",
]);

const citationOptionListOutputSchema = s.object("A list of values supported by Crossref content negotiation.", {
  totalResults: s.integer("The total number of values returned by Crossref."),
  items: s.array("The supported Crossref values.", s.string("A Crossref citation style or locale identifier.")),
});

const changeTimestampSchema = s.string(
  "A Crossref ISO timestamp with year, month, day, hour, minute, or second precision.",
  {
    minLength: 4,
    pattern: "^\\d{4}(?:-\\d{2}(?:-\\d{2}(?:T\\d{2}(?::\\d{2}(?::\\d{2})?)?Z?)?)?)?$",
  },
);

const workListFields = {
  query: querySchema,
  queryBibliographic: s.nonEmptyString("A bibliographic query across titles, authors, ISSNs, and publication years."),
  queryTitle: s.nonEmptyString("A query limited to work titles."),
  queryAuthor: s.nonEmptyString("A query limited to contributor names."),
  queryContainerTitle: s.nonEmptyString("A query limited to journal or container titles."),
  filter: filterSchema,
  sort: sortSchema,
  order: orderSchema,
  facet: s.nonEmptyString("A Crossref facet expression, such as type-name:* or published:10."),
  mailto: mailtoSchema,
};

const workListOptionalFields = Object.keys(workListFields) as (keyof typeof workListFields)[];

function createWorkListInputSchema(description: string, identityFields: Record<string, Record<string, unknown>> = {}) {
  const identityFieldNames = Object.keys(identityFields);
  return s.oneOf(
    [
      s.object(
        "Offset or count-only Crossref works request.",
        { ...identityFields, ...workListFields, rows: rowsSchema, offset: offsetSchema },
        { optional: [...workListOptionalFields, "rows", "offset"] },
      ),
      s.object(
        "Cursor-paginated Crossref works request.",
        { ...identityFields, ...workListFields, cursor: cursorSchema, rows: cursorRowsSchema },
        {
          optional: [...workListOptionalFields, "rows"],
          required: [...identityFieldNames, "cursor"],
        },
      ),
      s.object(
        "Randomly sampled Crossref works request.",
        {
          ...identityFields,
          ...workListFields,
          sample: s.integer("The number of randomly sampled works to request.", {
            minimum: 1,
            maximum: 100,
          }),
        },
        { optional: workListOptionalFields, required: [...identityFieldNames, "sample"] },
      ),
    ],
    { description },
  );
}

const workListInputSchema = createWorkListInputSchema(
  "Input parameters for listing Crossref works in one supported pagination mode.",
);

const resourceTypeSchema = s.stringEnum("The Crossref resource type to retrieve.", [
  "journal",
  "member",
  "funder",
  "prefix",
  "type",
]);

const resourceSchema = s.object("A normalized Crossref resource.", {
  id: s.nullable(s.string("The resource identifier derived from the Crossref response.")),
  displayName: s.nullable(s.string("The primary resource title, name, or label.")),
  location: s.nullable(s.string("The resource location when Crossref returns one.")),
  uri: s.nullable(s.string("The canonical resource URI when Crossref returns one.")),
  workCount: s.nullable(s.integer("The number of works associated with the resource.")),
  raw: rawObjectSchema,
});

const resourceFilterSchema = s.nonEmptyString(
  "A Crossref resource filter expression supported by members and funders.",
);

const listResourcesInputSchema = s.oneOf(
  [
    s.object(
      "Offset or count-only journal or license request.",
      {
        collection: s.stringEnum("The Crossref resource collection to list.", ["journals", "licenses"]),
        query: querySchema,
        rows: rowsSchema,
        offset: offsetSchema,
        mailto: mailtoSchema,
      },
      { optional: ["query", "rows", "offset", "mailto"] },
    ),
    s.object(
      "Cursor-paginated journal or license request.",
      {
        collection: s.stringEnum("The Crossref resource collection to list.", ["journals", "licenses"]),
        query: querySchema,
        rows: cursorRowsSchema,
        cursor: cursorSchema,
        mailto: mailtoSchema,
      },
      { optional: ["query", "rows", "mailto"] },
    ),
    s.object(
      "Offset or count-only member or funder request.",
      {
        collection: s.stringEnum("The Crossref resource collection to list.", ["members", "funders"]),
        query: querySchema,
        filter: resourceFilterSchema,
        rows: rowsSchema,
        offset: offsetSchema,
        mailto: mailtoSchema,
      },
      { optional: ["query", "filter", "rows", "offset", "mailto"] },
    ),
    s.object(
      "Cursor-paginated member or funder request.",
      {
        collection: s.stringEnum("The Crossref resource collection to list.", ["members", "funders"]),
        query: querySchema,
        filter: resourceFilterSchema,
        rows: cursorRowsSchema,
        cursor: cursorSchema,
        mailto: mailtoSchema,
      },
      { optional: ["query", "filter", "rows", "mailto"] },
    ),
    s.object(
      "Work type collection request.",
      {
        collection: s.literal("types", { description: "The Crossref work type collection." }),
        rows: rowsSchema,
        offset: offsetSchema,
        mailto: mailtoSchema,
      },
      { optional: ["rows", "offset", "mailto"] },
    ),
  ],
  { description: "Input parameters for listing one Crossref resource collection in a supported pagination mode." },
);

export const crossrefActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_work",
    operationType: "read",
    description: "Get the current Crossref metadata record for one DOI.",
    inputSchema: s.object(
      "Input parameters for retrieving one Crossref work.",
      { doi: doiSchema, mailto: mailtoSchema },
      { optional: ["mailto"] },
    ),
    outputSchema: s.object("The response returned for one Crossref work.", {
      work: workSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_work_agency",
    operationType: "read",
    description: "Get the DOI registration agency reported by Crossref for one work.",
    inputSchema: s.object(
      "Input parameters for retrieving the registration agency for a DOI.",
      { doi: doiSchema, mailto: mailtoSchema },
      { optional: ["mailto"] },
    ),
    outputSchema: s.object("The DOI registration agency response.", {
      doi: s.string("The normalized DOI used for the request."),
      agency: s.object("The normalized DOI registration agency.", {
        id: s.nullable(s.string("The registration agency identifier.")),
        label: s.nullable(s.string("The registration agency display label.")),
        raw: rawObjectSchema,
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_works",
    operationType: "read",
    description: "Search, filter, sort, sample, facet, or page through works registered with Crossref.",
    inputSchema: workListInputSchema,
    outputSchema: listWorksOutputSchema,
  }),
  defineProviderAction(service, {
    name: "match_reference",
    operationType: "read",
    description: "Find the most relevant Crossref work candidates for a formatted bibliographic reference.",
    inputSchema: s.object("Input parameters for matching a bibliographic reference.", {
      reference: s.nonWhitespaceString(
        "A complete bibliographic reference containing details such as title, author, year, and venue.",
      ),
      rows: s.optional(
        s.withDefault(
          s.integer("The maximum number of ranked candidate works to return.", {
            minimum: 1,
            maximum: 20,
          }),
          5,
        ),
      ),
      mailto: s.optional(mailtoSchema),
    }),
    outputSchema: listWorksOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_changed_works",
    operationType: "read",
    description: "Page through Crossref works created, updated by members, or re-indexed since a point in time.",
    inputSchema: s.object("Input parameters for incrementally synchronizing Crossref works.", {
      changeSource: s.optional(
        s.withDefault(
          s.stringEnum("The Crossref timestamp used to detect changes.", ["created", "updated", "indexed"]),
          "indexed",
        ),
      ),
      fromDate: s.describe(
        changeTimestampSchema,
        "The inclusive lower Crossref timestamp for this bounded synchronization window.",
      ),
      untilDate: s.describe(
        changeTimestampSchema,
        "The inclusive upper Crossref timestamp fixed before reading the first page of this synchronization window.",
      ),
      workType: s.optional(
        s.nonWhitespaceString("An optional Crossref work type filter, such as journal-article or book-chapter."),
      ),
      rows: s.optional(
        s.withDefault(
          s.integer("The number of changed works to return per cursor page.", {
            minimum: 1,
            maximum: 100,
          }),
          100,
        ),
      ),
      cursor: s.optional(s.withDefault(cursorSchema, "*")),
      mailto: s.optional(mailtoSchema),
    }),
    outputSchema: listWorksOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_scoped_works",
    operationType: "read",
    description: "List works associated with one Crossref journal, member, funder, DOI prefix, or work type.",
    inputSchema: createWorkListInputSchema(
      "Input parameters for listing scoped Crossref works in one supported pagination mode.",
      {
        scope: resourceTypeSchema,
        id: s.nonWhitespaceString(
          "The scope identifier, such as an ISSN, member ID, funder ID, DOI prefix, or work type ID.",
        ),
      },
    ),
    outputSchema: listWorksOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_resource",
    operationType: "read",
    description: "Get one Crossref journal, member, funder, DOI prefix, or work type record.",
    inputSchema: s.object(
      "Input parameters for retrieving one Crossref resource.",
      {
        resourceType: resourceTypeSchema,
        id: s.nonWhitespaceString(
          "The resource identifier, such as an ISSN, member ID, funder ID, DOI prefix, or type ID.",
        ),
        mailto: mailtoSchema,
      },
      { optional: ["mailto"] },
    ),
    outputSchema: s.object("The response returned for one Crossref resource.", {
      resource: resourceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_resources",
    operationType: "read",
    description: "List or search Crossref journals, members, funders, work types, or licenses.",
    inputSchema: listResourcesInputSchema,
    outputSchema: s.object("The normalized Crossref resource list response.", {
      meta: listMetaSchema,
      resources: s.array("The normalized Crossref resources.", resourceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "export_work_citation",
    operationType: "read",
    description: "Export one DOI as BibTeX, RIS, CSL JSON, a formatted citation, RDF, Turtle, or UNIXREF XML.",
    inputSchema: s.object("Input parameters for exporting one Crossref work.", {
      doi: doiSchema,
      format: s.optional(s.withDefault(citationFormatSchema, "bibtex")),
      style: s.optional(
        s.nonWhitespaceString("A Crossref CSL style identifier used only with formatted output, such as apa."),
      ),
      locale: s.optional(
        s.nonWhitespaceString("A Crossref locale identifier used only with formatted output, such as en-US."),
      ),
      mailto: s.optional(mailtoSchema),
    }),
    outputSchema: s.object("The exported Crossref citation or metadata content.", {
      doi: s.string("The normalized DOI used for the request."),
      format: citationFormatSchema,
      contentType: s.string("The response media type returned by Crossref."),
      content: s.string("The exported citation or metadata content."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_citation_styles",
    operationType: "read",
    description: "List the CSL style identifiers accepted for formatted Crossref citations.",
    inputSchema: s.object(
      "Input parameters for listing Crossref citation styles.",
      { mailto: mailtoSchema },
      { optional: ["mailto"] },
    ),
    outputSchema: citationOptionListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_citation_locales",
    operationType: "read",
    description: "List the locale identifiers accepted for formatted Crossref citations.",
    inputSchema: s.object(
      "Input parameters for listing Crossref citation locales.",
      { mailto: mailtoSchema },
      { optional: ["mailto"] },
    ),
    outputSchema: citationOptionListOutputSchema,
  }),
];
