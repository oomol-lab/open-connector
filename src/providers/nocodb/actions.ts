import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "nocodb";

const tableIdSchema = s.nonEmptyString("The NocoDB table ID, such as m1abcdefghijk.");
const baseIdSchema = s.nonEmptyString("The NocoDB base ID.");
const sourceIdSchema = s.nonEmptyString("The NocoDB source ID.");
const recordIdSchema = s.union(
  [s.nonEmptyString("The NocoDB record ID as a string."), s.number("The NocoDB record ID as a number.")],
  { description: "The NocoDB record ID value." },
);
const rowPayloadSchema = s.looseObject("A NocoDB record payload keyed by table column names or system fields.");
const rowSchema = s.looseObject("A NocoDB record returned by the API.");
const tableMetaSchema = s.looseObject("NocoDB table metadata options.");
const tableSchema = s.looseObject("A NocoDB table metadata object.", {
  id: s.string("The NocoDB table ID."),
  title: s.string("The NocoDB table title."),
  table_name: s.string("The physical table name, when returned."),
});
const columnSchema = s.looseObject("A NocoDB column metadata object.", {
  id: s.string("The NocoDB column ID."),
  title: s.string("The NocoDB column title."),
  column_name: s.string("The physical column name, when returned."),
  uidt: s.string("The NocoDB UI data type."),
});
const fieldSchema = s.looseObject("A NocoDB v3 field metadata object.", {
  id: s.string("The NocoDB field ID."),
  title: s.string("The NocoDB field title."),
  type: s.string("The NocoDB field type."),
});
const tableCreateFieldSchema = s.looseObject("A field to create with a new NocoDB table.", {
  title: s.string("The field title."),
  type: s.string("The NocoDB field type."),
});
const viewSchema = s.looseObject("A NocoDB view metadata object.", {
  id: s.string("The NocoDB view ID."),
  title: s.string("The NocoDB view title."),
  type: s.string("The NocoDB view type."),
});
const pageInfoSchema = s.looseObject("Pagination metadata returned by NocoDB.", {
  totalRows: s.integer("The total number of matching rows."),
  page: s.integer("The current page number."),
  pageSize: s.integer("The requested page size."),
  isFirstPage: s.boolean("Whether the current page is the first page."),
  isLastPage: s.boolean("Whether the current page is the last page."),
});
const v3RecordSchema = s.looseObject("A NocoDB v3 data record.", {
  id: recordIdSchema,
  id_fields: s.looseObject("Primary key field values for the record."),
  fields: s.looseObject("Record field values excluding primary key fields."),
});
const v3RecordPayloadSchema = s.requiredObject("A NocoDB v3 record payload.", {
  fields: s.looseObject("Record field values keyed by field title or field ID."),
});
const v3RecordUpdatePayloadSchema = s.requiredObject("A NocoDB v3 record update payload.", {
  id: recordIdSchema,
  fields: s.looseObject("Record field values to update."),
});
const v3RecordDeletePayloadSchema = s.requiredObject("A NocoDB v3 record delete payload.", {
  id: recordIdSchema,
});
const queryOptions = {
  limit: s.positiveInteger("The maximum number of records to return."),
  offset: s.nonNegativeInteger("The zero-based offset for pagination."),
  where: s.string("A NocoDB where expression, such as (Status,eq,Done)."),
  sort: s.string("A comma-separated sort expression. Prefix a field with - for descending sort."),
  fields: s.string("A comma-separated list of fields to include."),
  viewId: s.string("The NocoDB view ID used to restrict records to a specific view."),
};
const v3QueryOptions = {
  page: s.positiveInteger("The one-based page number to retrieve."),
  nestedPage: s.positiveInteger("The one-based page number for nested linked record data."),
  pageSize: s.positiveInteger("The maximum number of records to return."),
  where: s.string("A NocoDB v3 where expression, such as (Status,eq,Done)."),
  sort: s.string("A NocoDB v3 sort expression."),
  fields: s.string("A comma-separated list or JSON array string of fields to include."),
  viewId: s.string("The NocoDB view ID used to restrict records to a specific view."),
  linksAsLtar: s.boolean("Whether Links fields should return full linked record data."),
};

export const nocodbActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the NocoDB user associated with the connected API token.",
    inputSchema: s.object({}, { description: "The input payload for reading the current NocoDB user." }),
    outputSchema: s.requiredObject("The current NocoDB user response.", {
      user: s.looseObject("The current NocoDB user object."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_bases",
    description: "List bases visible to the connected NocoDB API token.",
    inputSchema: s.object({}, { description: "The input payload for listing NocoDB bases." }),
    outputSchema: s.requiredObject("The NocoDB base list response.", {
      bases: s.array("Bases returned by NocoDB.", s.looseObject("A NocoDB base object.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_base_schema",
    description: "Get schema metadata for one NocoDB base.",
    inputSchema: s.requiredObject("The input payload for reading one NocoDB base schema.", {
      baseId: baseIdSchema,
    }),
    outputSchema: s.requiredObject("The NocoDB base schema response.", {
      base: s.looseObject("The NocoDB base schema object."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_tables",
    description: "List tables in a NocoDB base or in a specific base source.",
    inputSchema: s.object(
      "The input payload for listing NocoDB tables.",
      {
        baseId: baseIdSchema,
        sourceId: sourceIdSchema,
      },
      { required: ["baseId"], optional: ["sourceId"] },
    ),
    outputSchema: s.requiredObject("The NocoDB table list response.", {
      tables: s.array("Tables returned by NocoDB.", tableSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_table",
    description: "Create a table in a NocoDB base using the v3 metadata API.",
    inputSchema: s.object(
      "The input payload for creating a NocoDB table.",
      {
        baseId: baseIdSchema,
        title: s.nonEmptyString("The table title."),
        description: s.nullableString("The table description."),
        sourceId: sourceIdSchema,
        meta: tableMetaSchema,
        fields: s.array("Fields to create with the table.", tableCreateFieldSchema, { minItems: 1 }),
      },
      { required: ["baseId", "title"], optional: ["description", "sourceId", "meta", "fields"] },
    ),
    outputSchema: s.requiredObject("The NocoDB table creation response.", {
      table: tableSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_table_metadata",
    description: "Get metadata for one NocoDB table, including columns and views when available.",
    inputSchema: s.requiredObject("The input payload for reading NocoDB table metadata.", {
      tableId: tableIdSchema,
    }),
    outputSchema: s.requiredObject("The NocoDB table metadata response.", {
      table: tableSchema,
      columns: s.array("Columns returned for the table.", columnSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "update_table",
    description: "Update a NocoDB table title, description, display field, or metadata using the v3 metadata API.",
    inputSchema: s.object(
      "The input payload for updating a NocoDB table.",
      {
        baseId: baseIdSchema,
        tableId: tableIdSchema,
        title: s.string("The new table title."),
        description: s.string("The new table description."),
        displayFieldId: s.string("The field ID to use as the table display field."),
        meta: tableMetaSchema,
      },
      { required: ["baseId", "tableId"], optional: ["title", "description", "displayFieldId", "meta"] },
    ),
    outputSchema: s.requiredObject("The NocoDB table update response.", {
      table: tableSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_table",
    description: "Delete a NocoDB table using the v3 metadata API.",
    inputSchema: s.requiredObject("The input payload for deleting a NocoDB table.", {
      baseId: baseIdSchema,
      tableId: tableIdSchema,
    }),
    outputSchema: s.requiredObject("The NocoDB table deletion response.", {
      deleted: s.boolean("Whether NocoDB accepted the delete request."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_table_views",
    description: "List views for a NocoDB table using the v3 metadata API.",
    inputSchema: s.requiredObject("The input payload for listing NocoDB table views.", {
      baseId: baseIdSchema,
      tableId: tableIdSchema,
    }),
    outputSchema: s.requiredObject("The NocoDB table view list response.", {
      views: s.array("Views returned by NocoDB.", viewSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_table_view",
    description: "Create a view for a NocoDB table using the v3 metadata API.",
    inputSchema: s.requiredObject("The input payload for creating a NocoDB table view.", {
      baseId: baseIdSchema,
      tableId: tableIdSchema,
      view: s.looseObject("The NocoDB v3 view creation payload."),
    }),
    outputSchema: s.requiredObject("The NocoDB table view creation response.", {
      view: viewSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_table_field",
    description: "Create a field in a NocoDB table using the v3 metadata API.",
    inputSchema: s.requiredObject("The input payload for creating a NocoDB table field.", {
      baseId: baseIdSchema,
      tableId: tableIdSchema,
      field: s.looseObject("The NocoDB v3 field creation payload."),
    }),
    outputSchema: s.requiredObject("The NocoDB table field creation response.", {
      field: fieldSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_records",
    description: "List records from one NocoDB table with optional where, sort, field, limit, and offset parameters.",
    inputSchema: s.object(
      "The input payload for listing records in one NocoDB table.",
      {
        tableId: tableIdSchema,
        ...queryOptions,
        shuffle: s.boolean("Whether to shuffle the returned records."),
      },
      { required: ["tableId"], optional: ["limit", "offset", "where", "sort", "fields", "viewId", "shuffle"] },
    ),
    outputSchema: s.requiredObject("The NocoDB record list response.", {
      rows: s.array("Records returned by NocoDB.", rowSchema),
      pageInfo: s.nullable(pageInfoSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "count_records",
    description: "Count records in one NocoDB table, optionally filtered by a where expression.",
    inputSchema: s.object(
      "The input payload for counting records in one NocoDB table.",
      {
        tableId: tableIdSchema,
        where: queryOptions.where,
        viewId: queryOptions.viewId,
      },
      { required: ["tableId"], optional: ["where", "viewId"] },
    ),
    outputSchema: s.requiredObject("The NocoDB record count response.", {
      count: s.integer("The number of records matching the query."),
    }),
  }),
  defineProviderAction(service, {
    name: "read_record",
    description: "Read one record from a NocoDB table by record ID.",
    inputSchema: s.object(
      "The input payload for reading one NocoDB record.",
      {
        tableId: tableIdSchema,
        recordId: recordIdSchema,
        fields: queryOptions.fields,
      },
      { required: ["tableId", "recordId"], optional: ["fields"] },
    ),
    outputSchema: s.requiredObject("The NocoDB record read response.", {
      row: rowSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_records",
    description: "Create one or more records in a NocoDB table.",
    inputSchema: s.requiredObject("The input payload for creating NocoDB records.", {
      tableId: tableIdSchema,
      rows: s.array("Records to create in the table.", rowPayloadSchema, { minItems: 1 }),
    }),
    outputSchema: s.requiredObject("The NocoDB record creation response.", {
      rows: s.array("Created records returned by NocoDB.", rowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "update_records",
    description: "Update one or more records in a NocoDB table.",
    inputSchema: s.requiredObject("The input payload for updating NocoDB records.", {
      tableId: tableIdSchema,
      rows: s.array("Records to update. Each record must include its NocoDB record ID.", rowPayloadSchema, {
        minItems: 1,
      }),
    }),
    outputSchema: s.requiredObject("The NocoDB record update response.", {
      rows: s.array("Updated records returned by NocoDB.", rowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_records",
    description: "Delete one or more records from a NocoDB table.",
    inputSchema: s.requiredObject("The input payload for deleting NocoDB records.", {
      tableId: tableIdSchema,
      rows: s.array("Records to delete. Each record must include its NocoDB record ID.", rowPayloadSchema, {
        minItems: 1,
      }),
    }),
    outputSchema: s.requiredObject("The NocoDB record deletion response.", {
      deleted: s.boolean("Whether NocoDB accepted the delete request."),
      rows: s.array("Deleted records returned by NocoDB when available.", rowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_table_records",
    description: "List records from one NocoDB table using the v3 data API.",
    inputSchema: s.object(
      "The input payload for listing records through the NocoDB v3 data API.",
      {
        baseId: baseIdSchema,
        tableId: tableIdSchema,
        ...v3QueryOptions,
      },
      {
        required: ["baseId", "tableId"],
        optional: ["page", "nestedPage", "pageSize", "where", "sort", "fields", "viewId", "linksAsLtar"],
      },
    ),
    outputSchema: s.requiredObject("The NocoDB v3 record list response.", {
      records: s.array("Records returned by NocoDB.", v3RecordSchema),
      next: s.nullableString("The pagination token for the next page."),
      prev: s.nullableString("The pagination token for the previous page."),
      nestedNext: s.nullableString("The nested pagination token for the next page."),
      nestedPrev: s.nullableString("The nested pagination token for the previous page."),
    }),
  }),
  defineProviderAction(service, {
    name: "count_table_records",
    description: "Count records in one NocoDB table using the v3 data API.",
    inputSchema: s.object(
      "The input payload for counting records through the NocoDB v3 data API.",
      {
        baseId: baseIdSchema,
        tableId: tableIdSchema,
        where: v3QueryOptions.where,
        viewId: v3QueryOptions.viewId,
      },
      { required: ["baseId", "tableId"], optional: ["where", "viewId"] },
    ),
    outputSchema: s.requiredObject("The NocoDB v3 record count response.", {
      count: s.integer("The number of records matching the query."),
    }),
  }),
  defineProviderAction(service, {
    name: "read_table_record",
    description: "Read one record from a NocoDB table using the v3 data API.",
    inputSchema: s.object(
      "The input payload for reading one record through the NocoDB v3 data API.",
      {
        baseId: baseIdSchema,
        tableId: tableIdSchema,
        recordId: recordIdSchema,
        fields: v3QueryOptions.fields,
        linksAsLtar: v3QueryOptions.linksAsLtar,
      },
      { required: ["baseId", "tableId", "recordId"], optional: ["fields", "linksAsLtar"] },
    ),
    outputSchema: s.requiredObject("The NocoDB v3 record read response.", {
      record: v3RecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_table_records",
    description: "Create one or more records in a NocoDB table using the v3 data API.",
    inputSchema: s.requiredObject("The input payload for creating records through the NocoDB v3 data API.", {
      baseId: baseIdSchema,
      tableId: tableIdSchema,
      records: s.array("Records to create in the table.", v3RecordPayloadSchema, { minItems: 1 }),
    }),
    outputSchema: s.requiredObject("The NocoDB v3 record creation response.", {
      records: s.array("Created records returned by NocoDB.", v3RecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "update_table_records",
    description: "Update one or more records in a NocoDB table using the v3 data API.",
    inputSchema: s.requiredObject("The input payload for updating records through the NocoDB v3 data API.", {
      baseId: baseIdSchema,
      tableId: tableIdSchema,
      records: s.array("Records to update in the table.", v3RecordUpdatePayloadSchema, { minItems: 1 }),
    }),
    outputSchema: s.requiredObject("The NocoDB v3 record update response.", {
      records: s.array("Updated records returned by NocoDB.", v3RecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_table_records",
    description: "Delete one or more records from a NocoDB table using the v3 data API.",
    inputSchema: s.requiredObject("The input payload for deleting records through the NocoDB v3 data API.", {
      baseId: baseIdSchema,
      tableId: tableIdSchema,
      records: s.array("Records to delete from the table.", v3RecordDeletePayloadSchema, { minItems: 1 }),
    }),
    outputSchema: s.requiredObject("The NocoDB v3 record deletion response.", {
      records: s.array("Deleted records returned by NocoDB.", v3RecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "upsert_table_records",
    description: "Create or update records in a NocoDB table by matching up to three fields using the v3 data API.",
    inputSchema: s.requiredObject("The input payload for upserting records through the NocoDB v3 data API.", {
      baseId: baseIdSchema,
      tableId: tableIdSchema,
      fieldsToMergeOn: s.array(
        "Field titles or IDs used to match existing records.",
        s.string("A field title or ID."),
        {
          minItems: 1,
          maxItems: 3,
        },
      ),
      records: s.array("Records to create or update.", v3RecordPayloadSchema, { minItems: 1, maxItems: 10 }),
    }),
    outputSchema: s.requiredObject("The NocoDB v3 record upsert response.", {
      records: s.array("Upserted records returned by NocoDB.", v3RecordSchema),
    }),
  }),
];
