import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "twenty_crm";

const objectNamePluralSchema = s.nonEmptyString(
  "The Twenty plural object API name, such as companies, people, opportunities, or a custom object plural name.",
);
const recordIdSchema = s.uuid("The Twenty record UUID.");
const jsonObjectSchema = s.looseObject("A JSON object accepted or returned by Twenty.");
const rawSchema = s.looseObject("The raw Twenty API response object.");
const metadataObjectSchema = s.looseObject("A Twenty metadata object definition.");
const recordSchema = s.looseObject("A Twenty record.");

const paginationInputFields = {
  limit: s.integer("The maximum number of records to return.", { minimum: 1, maximum: 200 }),
  startingAfter: recordIdSchema,
  endingBefore: recordIdSchema,
};

const listRecordsInputSchema = s.object(
  "Input parameters for listing Twenty records.",
  {
    objectNamePlural: objectNamePluralSchema,
    ...paginationInputFields,
    filter: jsonObjectSchema,
    orderBy: jsonObjectSchema,
    depth: s.integer("The relation depth to include in the returned records.", {
      minimum: 0,
      maximum: 10,
    }),
  },
  {
    optional: ["limit", "startingAfter", "endingBefore", "filter", "orderBy", "depth"],
  },
);

const retrieveRecordInputSchema = s.object("Input parameters for retrieving one Twenty record.", {
  objectNamePlural: objectNamePluralSchema,
  id: recordIdSchema,
});

const recordPayloadInputSchema = s.object("Input parameters for writing a Twenty record.", {
  objectNamePlural: objectNamePluralSchema,
  data: jsonObjectSchema,
});

const updateRecordInputSchema = s.object("Input parameters for updating a Twenty record.", {
  objectNamePlural: objectNamePluralSchema,
  id: recordIdSchema,
  data: jsonObjectSchema,
});

export const twentyCrmActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_metadata_objects",
    description: "List Twenty metadata objects for the connected workspace.",
    inputSchema: s.object("Input parameters for listing Twenty metadata objects.", {}),
    outputSchema: s.object("Output payload for Twenty metadata objects.", {
      objects: s.array("The Twenty metadata object definitions.", metadataObjectSchema),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_records",
    description: "List Twenty records for one workspace object using the generated schema-per-tenant REST API.",
    inputSchema: listRecordsInputSchema,
    outputSchema: s.object("Output payload for a Twenty record listing.", {
      records: s.array("The Twenty records returned by the API.", recordSchema),
      pageInfo: s.looseObject("Pagination metadata returned by Twenty."),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "retrieve_record",
    description: "Retrieve one Twenty record by object API name and record UUID.",
    inputSchema: retrieveRecordInputSchema,
    outputSchema: s.object("Output payload for one Twenty record.", {
      record: recordSchema,
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_record",
    description: "Create one Twenty record for a workspace object.",
    inputSchema: recordPayloadInputSchema,
    outputSchema: s.object("Output payload for a created Twenty record.", {
      record: recordSchema,
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_record",
    description: "Update one Twenty record by object API name and record UUID.",
    inputSchema: updateRecordInputSchema,
    outputSchema: s.object("Output payload for an updated Twenty record.", {
      record: recordSchema,
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_record",
    description: "Delete one Twenty record by object API name and record UUID.",
    inputSchema: retrieveRecordInputSchema,
    outputSchema: s.object("Output payload for a deleted Twenty record.", {
      record: s.nullable(recordSchema),
      success: s.boolean("Whether Twenty reported the delete operation as successful."),
      raw: rawSchema,
    }),
  }),
];
