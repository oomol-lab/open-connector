import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "netsuite";

const recordTypeSchema = s.nonEmptyString(
  "The NetSuite record type path segment, such as customer, vendor, salesOrder, or invoice.",
);
const recordIdSchema = s.nonEmptyString("The NetSuite internal ID or external ID for the record.");
const limitSchema = s.integer("The maximum number of NetSuite records to return.", {
  minimum: 1,
  maximum: 1000,
});
const offsetSchema = s.nonNegativeInteger("The zero-based NetSuite result offset.");
const looseRecordSchema = s.looseObject("A NetSuite JSON object with record-type-specific fields.");
const linkSchema = s.looseRequiredObject("A NetSuite REST link object.", {
  rel: s.string("The link relationship returned by NetSuite."),
  href: s.string("The link URL or path returned by NetSuite."),
});
const collectionSchema = s.looseRequiredObject("A NetSuite paged collection response.", {
  links: s.array("Links returned with the NetSuite collection.", linkSchema),
  count: s.integer("The number of records returned in this page."),
  hasMore: s.boolean("Whether NetSuite has more records after this page."),
  offset: s.integer("The offset returned by NetSuite."),
  totalResults: s.integer("The total result count returned by NetSuite, when available."),
  items: s.array("NetSuite records returned in this page.", looseRecordSchema),
});

export const netsuiteActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "run_suiteql",
    description: "Execute a SuiteQL query through NetSuite REST Web Services.",
    inputSchema: s.object(
      "Input payload for executing a NetSuite SuiteQL query.",
      {
        query: s.nonEmptyString("The SuiteQL query text to execute."),
        limit: limitSchema,
        offset: offsetSchema,
      },
      { optional: ["limit", "offset"] },
    ),
    outputSchema: s.object("The normalized NetSuite SuiteQL response.", {
      result: collectionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_records",
    description: "List NetSuite records of one record type with optional REST filtering.",
    inputSchema: s.object(
      "Input payload for listing NetSuite records.",
      {
        recordType: recordTypeSchema,
        limit: limitSchema,
        offset: offsetSchema,
        q: s.string("NetSuite REST record filtering expression."),
      },
      { optional: ["limit", "offset", "q"] },
    ),
    outputSchema: s.object("The normalized NetSuite record-list response.", {
      records: collectionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_record",
    description: "Retrieve one NetSuite record by record type and ID.",
    inputSchema: s.object(
      "Input payload for retrieving a NetSuite record.",
      {
        recordType: recordTypeSchema,
        recordId: recordIdSchema,
        expandSubResources: s.boolean("Whether NetSuite should expand subresources."),
      },
      { optional: ["expandSubResources"] },
    ),
    outputSchema: s.object("The normalized NetSuite record response.", {
      record: looseRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_record",
    description: "Create one NetSuite record for a record type.",
    inputSchema: s.object("Input payload for creating a NetSuite record.", {
      recordType: recordTypeSchema,
      body: looseRecordSchema,
    }),
    outputSchema: s.object(
      "The normalized NetSuite create-record response.",
      {
        ok: s.boolean("Whether NetSuite accepted the create request."),
        location: s.string("The NetSuite Location header for the created record, when returned."),
        record: s.looseObject("The NetSuite response body, when NetSuite returned one."),
      },
      { optional: ["location", "record"] },
    ),
  }),
  defineProviderAction(service, {
    name: "update_record",
    description: "Update one NetSuite record by record type and ID.",
    inputSchema: s.object("Input payload for updating a NetSuite record.", {
      recordType: recordTypeSchema,
      recordId: recordIdSchema,
      body: looseRecordSchema,
    }),
    outputSchema: s.object(
      "The normalized NetSuite update-record response.",
      {
        ok: s.boolean("Whether NetSuite accepted the update."),
        location: s.string("The NetSuite Location header for the updated record, when returned."),
        record: s.looseObject("The NetSuite response body, when NetSuite returned one."),
      },
      { optional: ["location", "record"] },
    ),
  }),
];
