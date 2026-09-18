import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "autotask";

const autotaskEntitySchema = s.stringEnum("Autotask entity to query.", ["Companies", "Contacts", "Tickets"]);

const entityInformationSectionSchema = s.stringEnum("Autotask entityInformation section to retrieve.", [
  "summary",
  "fields",
  "userDefinedFields",
]);

const filterExpressionSchema = s.looseObject("Autotask filter expression.", {
  op: s.string("Autotask filter operator, such as eq, noteq, gt, exist, in, or or."),
  field: s.string("Autotask field name used by the filter expression."),
  value: s.unknown("Autotask filter value."),
  udf: s.boolean("Whether the filter targets a user-defined field."),
  items: s.array(
    "Nested Autotask filter expressions for grouped AND or OR filters.",
    s.looseObject("A nested Autotask filter expression."),
  ),
});

const filterArraySchema = s.array("Autotask filter expressions.", filterExpressionSchema, {
  minItems: 1,
});

const queryRecordsInputSchema = s.object(
  "Input parameters for querying Autotask records.",
  {
    entity: autotaskEntitySchema,
    filter: filterArraySchema,
    includeFields: s.array(
      "Autotask field names to include in the response.",
      s.string("An Autotask field name.", { minLength: 1 }),
      {
        minItems: 1,
      },
    ),
    maxRecords: s.integer("Maximum records to return. Autotask allows 1 to 500 per page.", {
      minimum: 1,
      maximum: 500,
    }),
  },
  { optional: ["filter", "includeFields", "maxRecords"] },
);

const getRecordInputSchema = s.object("Input parameters for retrieving one Autotask record.", {
  entity: autotaskEntitySchema,
  id: s.positiveInteger("Numeric Autotask record ID."),
});

const getEntityInformationInputSchema = s.object(
  "Input parameters for retrieving Autotask entity metadata.",
  {
    entity: autotaskEntitySchema,
    section: entityInformationSectionSchema,
  },
  { optional: ["section"] },
);

const pageDetailsSchema = s.looseObject("Autotask query pagination details.", {
  count: s.integer("Number of records in the current page."),
  requestCount: s.integer("Maximum number of records requested."),
  prevPageUrl: s.nullable(s.string("Previous page URL returned by Autotask.")),
  nextPageUrl: s.nullable(s.string("Next page URL returned by Autotask.")),
});

const zoneInformationSchema = s.looseObject("Autotask zone information.", {
  apiBaseUrl: s.string("Normalized Autotask REST API base URL for the API user."),
  zoneName: s.nullable(s.string("Autotask zone name returned for the API user.")),
  webUrl: s.nullable(s.string("Autotask web app URL returned for the API user.")),
  ci: s.nullable(s.integer("Autotask customer identifier returned for the API user.")),
  raw: s.looseObject("Raw ZoneInformation response returned by Autotask."),
});

const queryRecordsOutputSchema = s.object("Autotask query response.", {
  items: s.array("Autotask records returned by the query.", s.looseObject("An Autotask record.")),
  pageDetails: pageDetailsSchema,
  raw: s.looseObject("Raw query response returned by Autotask."),
});

const getRecordOutputSchema = s.object("Autotask single-record response.", {
  item: s.looseObject("Autotask record returned by ID."),
  raw: s.looseObject("Raw record response returned by Autotask."),
});

const entityInformationOutputSchema = s.object("Autotask entity metadata response.", {
  information: s.looseObject("Autotask entity metadata returned by the selected endpoint."),
  raw: s.looseObject("Raw entity metadata response returned by Autotask."),
});

export const autotaskActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_zone_information",
    operationType: "read",
    description: "Return the Autotask REST API zone URL for the connected API user.",
    inputSchema: s.object("Input parameters for reading Autotask zone information.", {}),
    outputSchema: zoneInformationSchema,
  }),
  defineProviderAction(service, {
    name: "query_records",
    operationType: "read",
    description:
      "Query Autotask Companies, Contacts, or Tickets with optional filter, IncludeFields, and MaxRecords parameters.",
    inputSchema: queryRecordsInputSchema,
    outputSchema: queryRecordsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_record",
    operationType: "read",
    description: "Get one Autotask Company, Contact, or Ticket by numeric ID.",
    inputSchema: getRecordInputSchema,
    outputSchema: getRecordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_entity_information",
    operationType: "read",
    description: "Get Autotask entityInformation metadata for Companies, Contacts, or Tickets.",
    inputSchema: getEntityInformationInputSchema,
    outputSchema: entityInformationOutputSchema,
  }),
];
