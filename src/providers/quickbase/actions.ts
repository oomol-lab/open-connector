import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "quickbase" as const;

function nonEmptyString(description: string) {
  return s.string(description, { minLength: 1 });
}

const fieldIdSchema = s.positiveInteger("Quickbase field identifier.");
const recordIdSchema = s.positiveInteger("Quickbase record identifier.");
const loosePayloadSchema = s.looseObject("Object returned by Quickbase.");
const fieldValueInputSchema = s.object(
  "Quickbase field value wrapper keyed by field id.",
  {
    value: s.unknown("Value to write for the field."),
  },
  { additionalProperties: true },
);

const fieldValueOutputSchema = s.looseObject("Quickbase field value wrapper returned by the API.", {
  value: s.unknown("Field value returned by Quickbase."),
});

const recordDataInputSchema = s.record(
  "Mapping of Quickbase field ids to field value wrappers.",
  fieldValueInputSchema,
);

const recordDataOutputSchema = s.record(
  "Mapping of Quickbase field ids to field value wrappers.",
  fieldValueOutputSchema,
);

const sortOrderSchema = s.stringEnum("Sort order used by Quickbase.", ["ASC", "DESC"]);

const getAppInputSchema = s.object("Input parameters for retrieving a Quickbase app.", {
  appId: nonEmptyString("Quickbase app identifier."),
});

const getAppOutputSchema = s.object("Quickbase app response.", {
  app: loosePayloadSchema,
});

const listAppTablesInputSchema = s.object("Input parameters for listing tables in a Quickbase app.", {
  appId: nonEmptyString("Quickbase app identifier."),
});

const listAppTablesOutputSchema = s.object("Quickbase table list response.", {
  tables: s.array("Tables returned by Quickbase.", loosePayloadSchema),
});

const getTableFieldsInputSchema = s.object(
  "Input parameters for listing fields in a Quickbase table.",
  {
    tableId: nonEmptyString("Quickbase table identifier."),
    includeFieldPerms: s.boolean("Whether to include field permission metadata."),
  },
  { optional: ["includeFieldPerms"] },
);

const getTableFieldsOutputSchema = s.object("Quickbase field list response.", {
  fields: s.array("Fields returned by Quickbase.", loosePayloadSchema),
});

const querySortBySchema = s.object("Quickbase query sort instruction.", {
  fieldId: fieldIdSchema,
  order: sortOrderSchema,
});

const queryGroupBySchema = s.object("Quickbase query grouping instruction.", {
  fieldId: fieldIdSchema,
  grouping: s.stringEnum("Quickbase grouping mode.", ["equal-values"]),
});

const queryOptionsSchema = s.object(
  "Quickbase query paging options.",
  {
    skip: s.nonNegativeInteger("Number of records to skip."),
    top: s.positiveInteger("Maximum number of records to return."),
    compareWithAppLocalTime: s.boolean("Whether to compare date values in app local time."),
  },
  { optional: ["skip", "top", "compareWithAppLocalTime"] },
);

const queryRecordsInputSchema = s.object(
  "Input parameters for querying Quickbase records.",
  {
    tableId: nonEmptyString("Quickbase table identifier to query."),
    select: s.array("Field ids to return. Omit to use Quickbase defaults.", fieldIdSchema, {
      minItems: 1,
    }),
    where: nonEmptyString("Quickbase query filter string."),
    sortBy: s.array("Sort instructions for returned records.", querySortBySchema, {
      minItems: 1,
    }),
    groupBy: s.array("Grouping instructions for returned records.", queryGroupBySchema, {
      minItems: 1,
    }),
    options: queryOptionsSchema,
  },
  { optional: ["select", "where", "sortBy", "groupBy", "options"] },
);

const queryRecordsOutputSchema = s.object("Quickbase record query response.", {
  data: s.array("Records returned by Quickbase.", recordDataOutputSchema),
  fields: s.array("Field metadata returned with the query.", loosePayloadSchema),
  metadata: s.looseObject("Query metadata returned by Quickbase.", {
    totalRecords: s.integer("Total record count reported by Quickbase."),
    numRecords: s.integer("Number of records in the current response."),
    numFields: s.integer("Number of fields in each returned record."),
    skip: s.integer("Number of records skipped."),
    top: s.integer("Maximum number of records requested."),
  }),
});

const upsertRecordsInputSchema = s.object(
  "Input parameters for inserting or updating Quickbase records.",
  {
    tableId: nonEmptyString("Quickbase table identifier."),
    data: s.array("Records to insert or update.", recordDataInputSchema, { minItems: 1 }),
    fieldsToReturn: s.array("Field ids to include in the response.", fieldIdSchema, {
      minItems: 1,
    }),
    mergeFieldId: fieldIdSchema,
    mergeFieldName: nonEmptyString("Quickbase field name used as the merge key."),
  },
  { optional: ["fieldsToReturn", "mergeFieldId", "mergeFieldName"] },
);

const upsertRecordsOutputSchema = s.object(
  "Quickbase insert or update response.",
  {
    data: s.array("Returned records after insert or update.", recordDataOutputSchema),
    metadata: loosePayloadSchema,
  },
  { optional: ["metadata"] },
);

const deleteRecordsInputSchema = s.object("Input parameters for deleting Quickbase records.", {
  tableId: nonEmptyString("Quickbase table identifier."),
  recordIds: s.array("Quickbase record ids to delete.", recordIdSchema, { minItems: 1 }),
});

const deleteRecordsOutputSchema = s.object("Quickbase delete records response.", {
  deletedRecordIds: s.array("Record ids deleted by Quickbase.", recordIdSchema),
  numberDeleted: s.integer("Number of records deleted by Quickbase."),
});

export const quickbaseActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_app",
    operationType: "read",
    description: "Retrieve metadata for a Quickbase app.",
    requiredScopes: [],
    inputSchema: getAppInputSchema,
    outputSchema: getAppOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_app_tables",
    operationType: "read",
    description: "List tables in a Quickbase app.",
    requiredScopes: [],
    inputSchema: listAppTablesInputSchema,
    outputSchema: listAppTablesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_table_fields",
    operationType: "read",
    description: "List fields in a Quickbase table.",
    requiredScopes: [],
    inputSchema: getTableFieldsInputSchema,
    outputSchema: getTableFieldsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "query_records",
    operationType: "read",
    description: "Query records from a Quickbase table.",
    requiredScopes: [],
    inputSchema: queryRecordsInputSchema,
    outputSchema: queryRecordsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "upsert_records",
    operationType: "write",
    description: "Insert or update records in a Quickbase table.",
    requiredScopes: [],
    inputSchema: upsertRecordsInputSchema,
    outputSchema: upsertRecordsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_records",
    operationType: "destructive",
    description: "Delete records from a Quickbase table by record id.",
    requiredScopes: [],
    inputSchema: deleteRecordsInputSchema,
    outputSchema: deleteRecordsOutputSchema,
  }),
];
