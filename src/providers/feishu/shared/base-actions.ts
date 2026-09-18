import type { ActionDefinition, JsonSchema } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
export const feishuBaseProviderPermissions = {
  appRead: "base:app:read",
  appCreate: "base:app:create",
  appCopy: "base:app:copy",
  tableRead: "base:table:read",
  tableCreate: "base:table:create",
  tableUpdate: "base:table:update",
  tableDelete: "base:table:delete",
  fieldRead: "base:field:read",
  fieldCreate: "base:field:create",
  fieldUpdate: "base:field:update",
  fieldDelete: "base:field:delete",
  viewRead: "base:view:read",
  viewWrite: "base:view:write_only",
  recordRead: "base:record:read",
  recordCreate: "base:record:create",
  recordUpdate: "base:record:update",
  recordDelete: "base:record:delete",
};
const appTokenField = s.nonEmptyString("The Base app token from a Feishu Base URL.");
const tableIdField = s.nonEmptyString("The Base table ID, usually starting with `tbl`.");
const fieldIdField = s.nonEmptyString("The Base field ID or field name accepted by the API.");
const viewIdField = s.nonEmptyString("The Base view ID or view name accepted by the API.");
const recordIdField = s.nonEmptyString("The Base record ID, usually starting with `rec`.");
const userIdTypeField = s.stringEnum("The user identifier type used in record values.", [
  "open_id",
  "union_id",
  "user_id",
]);
const paginationFields = {
  offset: s.nonNegativeInteger("The zero-based result offset. Defaults to 0."),
  limit: s.positiveInteger("The maximum number of results to return.", { maximum: 200 }),
};
const rawObjectSchema = s.looseObject("The raw Base object returned by Feishu.");
const fieldDefinitionSchema = s.looseRequiredObject(
  "A Base v3 field definition. Put type-specific configuration at the top level, not in property. Use select with multiple for single/multiple choice, and datetime for dates. Advanced types accept their official top-level fields: link_table for link, expression for formula, from/select/where for lookup, and button_config for button.",
  {
    name: s.nonEmptyString("The field name."),
    type: s.stringEnum("The Base v3 field type. Single and multiple choice both use select.", [
      "text",
      "number",
      "select",
      "datetime",
      "created_at",
      "updated_at",
      "user",
      "group_chat",
      "created_by",
      "updated_by",
      "link",
      "formula",
      "lookup",
      "auto_number",
      "attachment",
      "location",
      "checkbox",
      "button",
    ]),
    description: s.string("The field description, in plain text or Markdown."),
    style: s.looseObject('The type-specific display style, such as { "type": "plain", "precision": 2 } for a number.'),
    multiple: s.boolean("Whether select, user, or group_chat accepts multiple values."),
    options: s.array(
      "Static select options. Use options or dynamic_options_source, not both.",
      s.object("A select option identified by its name.", {
        name: s.nonEmptyString("The option name."),
        hue: s.string("The option color hue, such as Blue or Green."),
        lightness: s.string("The option color lightness, such as Light or Standard."),
      }),
    ),
    dynamic_options_source: s.object("The source field for dynamic select options, available when creating a field.", {
      table_id: s.nonEmptyString("The source table ID or name."),
      field_id: s.nonEmptyString("The source field ID or name."),
    }),
    default_value: s.unknown(
      "The default cell value for text, number, static select, datetime, or user. Select defaults are option-name arrays, even for single choice. Use null to clear the default.",
    ),
  },
  {
    optional: ["description", "style", "multiple", "options", "dynamic_options_source", "default_value"],
  },
);
fieldDefinitionSchema.propertyNames = { not: { enum: ["property", "field_name", "ui_type"] } };
const updateFieldProperties = Object.fromEntries(
  Object.entries(fieldDefinitionSchema.properties ?? {}).filter(([name]) => name !== "dynamic_options_source"),
) as Record<string, JsonSchema>;
updateFieldProperties.options = {
  ...updateFieldProperties.options,
  description: "The static select options.",
};
const updateFieldDefinitionSchema: JsonSchema = {
  ...fieldDefinitionSchema,
  properties: updateFieldProperties,
  not: { required: ["dynamic_options_source"] },
};
const viewDefinitionSchema = s.looseRequiredObject(
  "A Base view definition using the official view JSON shape.",
  {
    name: s.string("The view name.", { minLength: 1 }),
    type: s.stringEnum("The view type; defaults to `grid`.", ["grid", "kanban", "gallery", "calendar", "gantt"]),
  },
  {
    optional: ["type"],
  },
);
const baseDataQueryDslSchema: JsonSchema = {
  ...s.looseObject("The Base data-query JSON DSL for server-side grouping, aggregation, filtering, and sorting."),
  anyOf: [{ required: ["dimensions"] }, { required: ["measures"] }],
};
const recordFieldsSchema = s.record(
  "A map from Base field names or IDs to Feishu CellValue values.",
  s.unknown("A CellValue accepted by the target Base field."),
);
const batchUpdateRecordsSchema: JsonSchema = {
  ...s.record("A map from record IDs to record-specific field maps.", recordFieldsSchema),
  minProperties: 1,
  maxProperties: 200,
};
const sortSchema = s.array(
  "Sort conditions in priority order.",
  s.looseRequiredObject(
    "One Base record sort condition.",
    {
      field: s.string("The field ID or name to sort by."),
      desc: s.boolean("Whether to sort in descending order."),
    },
    {
      optional: [],
    },
  ),
  { maxItems: 10 },
);
const pageOutputSchema = s.object(
  "A normalized page of Base resources.",
  {
    items: s.array("The resources returned on this page.", rawObjectSchema),
    offset: s.nonNegativeInteger("The zero-based offset used for this page."),
    limit: s.positiveInteger("The requested page size."),
    total: s.nonNegativeInteger("The total result count reported or inferred for this page."),
    hasMore: s.boolean("Whether another page is available."),
  },
  {
    optional: [],
  },
);
function baseInput(description: string) {
  return s.object(
    description,
    { appToken: appTokenField },
    {
      optional: [],
    },
  );
}
function tableInput(description: string) {
  return s.object(
    description,
    {
      appToken: appTokenField,
      tableId: tableIdField,
    },
    {
      optional: [],
    },
  );
}
function fieldInput(description: string) {
  return s.object(
    description,
    {
      appToken: appTokenField,
      tableId: tableIdField,
      fieldId: fieldIdField,
    },
    {
      optional: [],
    },
  );
}
function viewInput(description: string) {
  return s.object(
    description,
    {
      appToken: appTokenField,
      tableId: tableIdField,
      viewId: viewIdField,
    },
    {
      optional: [],
    },
  );
}
function recordInput(description: string) {
  return s.object(
    description,
    {
      appToken: appTokenField,
      tableId: tableIdField,
      recordId: recordIdField,
    },
    {
      optional: [],
    },
  );
}
function resourceOutput(description: string, key: string) {
  return s.object(
    description,
    {
      [key]: rawObjectSchema,
    },
    {
      optional: [],
    },
  );
}
function writeOutput(description: string, key: string, operation: "created" | "updated") {
  return s.object(
    description,
    {
      [key]: rawObjectSchema,
      [operation]: s.literal(true, { description: `Whether the resource was ${operation}.` }),
    },
    {
      optional: [],
    },
  );
}
export function createFeishuBaseActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "get_base",
      operationType: "read",
      description: "Get the metadata of a Feishu Base.",
      requiredScopes: [feishuBaseProviderPermissions.appRead],
      providerPermissions: [feishuBaseProviderPermissions.appRead],
      inputSchema: baseInput("Identify the Base to read."),
      outputSchema: resourceOutput("The requested Base.", "base"),
    }),
    defineProviderAction(service, {
      name: "create_base",
      operationType: "write",
      description: "Create a Feishu Base, optionally replacing its default table with a custom initial schema.",
      requiredScopes: [
        feishuBaseProviderPermissions.appCreate,
        feishuBaseProviderPermissions.tableRead,
        feishuBaseProviderPermissions.tableCreate,
        feishuBaseProviderPermissions.tableDelete,
        feishuBaseProviderPermissions.fieldRead,
        feishuBaseProviderPermissions.fieldCreate,
        feishuBaseProviderPermissions.fieldUpdate,
        feishuBaseProviderPermissions.viewWrite,
      ],
      providerPermissions: [
        feishuBaseProviderPermissions.appCreate,
        feishuBaseProviderPermissions.tableRead,
        feishuBaseProviderPermissions.tableCreate,
        feishuBaseProviderPermissions.tableDelete,
        feishuBaseProviderPermissions.fieldRead,
        feishuBaseProviderPermissions.fieldCreate,
        feishuBaseProviderPermissions.fieldUpdate,
        feishuBaseProviderPermissions.viewWrite,
      ],
      inputSchema: s.object(
        "Configure the Base and its optional initial table.",
        {
          name: s.string("The Base name.", { minLength: 1 }),
          folderToken: s.string("The destination Drive folder token."),
          timeZone: s.string("The Base time zone, for example `Asia/Shanghai`."),
          initialTable: s.object(
            "A custom initial table that replaces the platform default table.",
            {
              name: s.string("The initial table name.", { minLength: 1 }),
              fields: s.array("The initial field definitions.", fieldDefinitionSchema, {
                minItems: 1,
              }),
            },
            {
              optional: [],
            },
          ),
        },
        {
          optional: ["folderToken", "timeZone", "initialTable"],
        },
      ),
      outputSchema: s.object(
        "The created Base and optional custom initial table.",
        {
          base: rawObjectSchema,
          created: s.literal(true, { description: "Whether the Base was created." }),
          table: rawObjectSchema,
          deletedDefaultTableId: s.string("The deleted platform-default table ID."),
        },
        {
          optional: ["table", "deletedDefaultTableId"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "copy_base",
      operationType: "write",
      description:
        "Copy a Feishu Base, optionally changing its name, destination folder, content inclusion, or time zone.",
      requiredScopes: [feishuBaseProviderPermissions.appCopy],
      providerPermissions: [feishuBaseProviderPermissions.appCopy],
      inputSchema: s.object(
        "Identify the source Base and configure the copy.",
        {
          appToken: appTokenField,
          name: s.string("The copied Base name.", { minLength: 1 }),
          folderToken: s.string("The destination Drive folder token.", { minLength: 1 }),
          withoutContent: s.boolean("Whether to copy only the Base structure without records."),
          timeZone: s.string("The copied Base time zone, for example `Asia/Shanghai`.", {
            minLength: 1,
          }),
        },
        {
          optional: ["name", "folderToken", "withoutContent", "timeZone"],
        },
      ),
      outputSchema: s.object(
        "The copied Base.",
        {
          base: rawObjectSchema,
          copied: s.literal(true, { description: "Whether the Base was copied." }),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "query_base_data",
      operationType: "read",
      description:
        "Run the Base data-query DSL for server-side grouping, aggregation, filtering, sorting, and Top N analysis.",
      requiredScopes: [feishuBaseProviderPermissions.tableRead],
      providerPermissions: [feishuBaseProviderPermissions.tableRead],
      inputSchema: s.object(
        "Identify the Base and provide its data-query DSL.",
        {
          appToken: appTokenField,
          dsl: baseDataQueryDslSchema,
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The Base data-query result.",
        {
          result: rawObjectSchema,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "list_base_tables",
      operationType: "read",
      description: "List tables in a Feishu Base.",
      requiredScopes: [feishuBaseProviderPermissions.tableRead],
      providerPermissions: [feishuBaseProviderPermissions.tableRead],
      inputSchema: s.object(
        "Identify the Base and page through its tables.",
        { appToken: appTokenField, ...paginationFields },
        {
          optional: ["offset", "limit"],
        },
      ),
      outputSchema: pageOutputSchema,
    }),
    defineProviderAction(service, {
      name: "get_base_table",
      operationType: "read",
      description: "Get one table in a Feishu Base.",
      requiredScopes: [
        feishuBaseProviderPermissions.tableRead,
        feishuBaseProviderPermissions.fieldRead,
        feishuBaseProviderPermissions.viewRead,
      ],
      providerPermissions: [
        feishuBaseProviderPermissions.tableRead,
        feishuBaseProviderPermissions.fieldRead,
        feishuBaseProviderPermissions.viewRead,
      ],
      inputSchema: tableInput("Identify the Base table to read."),
      outputSchema: s.object(
        "The requested Base table with its fields and views.",
        {
          table: rawObjectSchema,
          fields: s.array("All fields in the table.", rawObjectSchema),
          views: s.array("All views in the table.", rawObjectSchema),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "create_base_table",
      operationType: "write",
      description: "Create a table with an optional initial field schema in a Feishu Base.",
      requiredScopes: [
        feishuBaseProviderPermissions.tableCreate,
        feishuBaseProviderPermissions.fieldRead,
        feishuBaseProviderPermissions.fieldCreate,
        feishuBaseProviderPermissions.fieldUpdate,
        feishuBaseProviderPermissions.viewWrite,
      ],
      providerPermissions: [
        feishuBaseProviderPermissions.tableCreate,
        feishuBaseProviderPermissions.fieldRead,
        feishuBaseProviderPermissions.fieldCreate,
        feishuBaseProviderPermissions.fieldUpdate,
        feishuBaseProviderPermissions.viewWrite,
      ],
      inputSchema: s.object(
        "Configure the table to create.",
        {
          appToken: appTokenField,
          name: s.string("The table name.", { minLength: 1 }),
          fields: s.array("The initial field definitions.", fieldDefinitionSchema, {
            minItems: 1,
          }),
        },
        {
          optional: ["fields"],
        },
      ),
      outputSchema: writeOutput("The created Base table.", "table", "created"),
    }),
    defineProviderAction(service, {
      name: "update_base_table",
      operationType: "write",
      description: "Rename a table in a Feishu Base.",
      requiredScopes: [feishuBaseProviderPermissions.tableUpdate],
      providerPermissions: [feishuBaseProviderPermissions.tableUpdate],
      inputSchema: s.object(
        "Identify and rename the Base table.",
        {
          appToken: appTokenField,
          tableId: tableIdField,
          name: s.string("The new table name.", { minLength: 1 }),
        },
        {
          optional: [],
        },
      ),
      outputSchema: writeOutput("The updated Base table.", "table", "updated"),
    }),
    defineProviderAction(service, {
      name: "delete_base_table",
      operationType: "destructive",
      description: "Delete a table from a Feishu Base.",
      requiredScopes: [feishuBaseProviderPermissions.tableDelete],
      providerPermissions: [feishuBaseProviderPermissions.tableDelete],
      inputSchema: tableInput("Identify the Base table to delete."),
      outputSchema: s.object(
        "The deleted Base table reference.",
        {
          deleted: s.literal(true, { description: "Whether the table was deleted." }),
          tableId: tableIdField,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "list_base_fields",
      operationType: "read",
      description: "List the fields in a Feishu Base table.",
      requiredScopes: [feishuBaseProviderPermissions.fieldRead],
      providerPermissions: [feishuBaseProviderPermissions.fieldRead],
      inputSchema: s.object(
        "Identify the Base table and page through its fields.",
        { appToken: appTokenField, tableId: tableIdField, ...paginationFields },
        {
          optional: ["offset", "limit"],
        },
      ),
      outputSchema: pageOutputSchema,
    }),
    defineProviderAction(service, {
      name: "get_base_field",
      operationType: "read",
      description: "Get one field from a Feishu Base table.",
      requiredScopes: [feishuBaseProviderPermissions.fieldRead],
      providerPermissions: [feishuBaseProviderPermissions.fieldRead],
      inputSchema: fieldInput("Identify the Base field to read."),
      outputSchema: resourceOutput("The requested Base field.", "field"),
    }),
    defineProviderAction(service, {
      name: "search_base_field_options",
      operationType: "read",
      description: "Search the options of a single-select or multi-select field in a Feishu Base.",
      requiredScopes: [feishuBaseProviderPermissions.fieldRead],
      providerPermissions: [feishuBaseProviderPermissions.fieldRead],
      inputSchema: s.object(
        "Identify the Base field and configure option pagination.",
        {
          appToken: appTokenField,
          tableId: tableIdField,
          fieldId: fieldIdField,
          keyword: s.string("The optional keyword used to filter option labels."),
          offset: paginationFields.offset,
          limit: s.positiveInteger("The maximum number of options to return.", { maximum: 200 }),
        },
        {
          optional: ["keyword", "offset", "limit"],
        },
      ),
      outputSchema: s.object(
        "A page of matching Base field options.",
        {
          fieldId: fieldIdField,
          keyword: s.string("The normalized keyword used for this search."),
          options: s.array("The matching field options.", rawObjectSchema),
          offset: s.nonNegativeInteger("The zero-based result offset."),
          limit: s.positiveInteger("The requested page size."),
          total: s.nonNegativeInteger("The total matching option count reported or inferred."),
          hasMore: s.boolean("Whether another page is available."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "create_base_field",
      operationType: "write",
      description: "Create one field in a Feishu Base table.",
      requiredScopes: [feishuBaseProviderPermissions.fieldCreate],
      providerPermissions: [feishuBaseProviderPermissions.fieldCreate],
      inputSchema: s.object(
        "Configure the Base field to create.",
        {
          appToken: appTokenField,
          tableId: tableIdField,
          field: fieldDefinitionSchema,
        },
        {
          optional: [],
        },
      ),
      outputSchema: writeOutput("The created Base field.", "field", "created"),
    }),
    defineProviderAction(service, {
      name: "update_base_field",
      operationType: "destructive",
      description:
        "Replace one field definition in a Feishu Base table. Read the field first and include all writable configuration to preserve; this is a full PUT replacement, not a partial update.",
      requiredScopes: [feishuBaseProviderPermissions.fieldUpdate],
      providerPermissions: [feishuBaseProviderPermissions.fieldUpdate],
      inputSchema: s.object(
        "Identify and configure the Base field to update.",
        {
          appToken: appTokenField,
          tableId: tableIdField,
          fieldId: fieldIdField,
          field: updateFieldDefinitionSchema,
        },
        {
          optional: [],
        },
      ),
      outputSchema: writeOutput("The updated Base field.", "field", "updated"),
    }),
    defineProviderAction(service, {
      name: "delete_base_field",
      operationType: "destructive",
      description: "Delete one field from a Feishu Base table.",
      requiredScopes: [feishuBaseProviderPermissions.fieldDelete],
      providerPermissions: [feishuBaseProviderPermissions.fieldDelete],
      inputSchema: fieldInput("Identify the Base field to delete."),
      outputSchema: s.object(
        "The deleted Base field reference.",
        {
          deleted: s.literal(true, { description: "Whether the field was deleted." }),
          fieldId: fieldIdField,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "list_base_views",
      operationType: "read",
      description: "List the views in a Feishu Base table.",
      requiredScopes: [feishuBaseProviderPermissions.viewRead],
      providerPermissions: [feishuBaseProviderPermissions.viewRead],
      inputSchema: s.object(
        "Identify the Base table and page through its views.",
        { appToken: appTokenField, tableId: tableIdField, ...paginationFields },
        {
          optional: ["offset", "limit"],
        },
      ),
      outputSchema: pageOutputSchema,
    }),
    defineProviderAction(service, {
      name: "get_base_view",
      operationType: "read",
      description: "Get one view from a Feishu Base table.",
      requiredScopes: [feishuBaseProviderPermissions.viewRead],
      providerPermissions: [feishuBaseProviderPermissions.viewRead],
      inputSchema: viewInput("Identify the Base view to read."),
      outputSchema: resourceOutput("The requested Base view.", "view"),
    }),
    defineProviderAction(service, {
      name: "create_base_views",
      operationType: "write",
      description: "Create one or more views sequentially in a Feishu Base table.",
      requiredScopes: [feishuBaseProviderPermissions.viewWrite],
      providerPermissions: [feishuBaseProviderPermissions.viewWrite],
      inputSchema: s.object(
        "Identify the Base table and provide the views to create.",
        {
          appToken: appTokenField,
          tableId: tableIdField,
          views: s.array("The Base views to create.", viewDefinitionSchema, {
            minItems: 1,
            maxItems: 100,
          }),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The created Base views in request order.",
        {
          views: s.array("The created Base views.", rawObjectSchema),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "delete_base_view",
      operationType: "destructive",
      description: "Delete one view from a Feishu Base table by ID or accepted view name.",
      requiredScopes: [feishuBaseProviderPermissions.viewWrite],
      providerPermissions: [feishuBaseProviderPermissions.viewWrite],
      inputSchema: viewInput("Identify the Base view to delete."),
      outputSchema: s.object(
        "The deleted Base view reference.",
        {
          deleted: s.literal(true, { description: "Whether the view was deleted." }),
          viewId: viewIdField,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "list_base_records",
      operationType: "read",
      description: "List records in a Feishu Base table with optional projection, filter, and sort.",
      requiredScopes: [feishuBaseProviderPermissions.recordRead],
      providerPermissions: [feishuBaseProviderPermissions.recordRead],
      inputSchema: s.object(
        "Identify the Base table and configure the record query.",
        {
          appToken: appTokenField,
          tableId: tableIdField,
          viewId: viewIdField,
          fieldIds: s.array("The field IDs or names to include.", fieldIdField, {
            maxItems: 100,
          }),
          filter: s.looseObject("A Base record filter condition group."),
          sort: sortSchema,
          userIdType: userIdTypeField,
          ...paginationFields,
        },
        {
          optional: ["viewId", "fieldIds", "filter", "sort", "userIdType", "offset", "limit"],
        },
      ),
      outputSchema: pageOutputSchema,
    }),
    defineProviderAction(service, {
      name: "search_base_records",
      operationType: "read",
      description: "Search records by keyword within selected fields of a Feishu Base table.",
      requiredScopes: [feishuBaseProviderPermissions.recordRead],
      providerPermissions: [feishuBaseProviderPermissions.recordRead],
      inputSchema: s.object(
        "Identify the Base table and configure the record search.",
        {
          appToken: appTokenField,
          tableId: tableIdField,
          keyword: s.string("The non-empty keyword to search for.", { minLength: 1 }),
          searchFields: s.array(
            "The field IDs or names to search within.",
            s.string("A searchable field ID or name.", { minLength: 1 }),
            { minItems: 1, maxItems: 20 },
          ),
          selectFields: s.array("The field IDs or names to return.", fieldIdField, {
            maxItems: 50,
          }),
          viewId: viewIdField,
          filter: s.looseObject("A Base record filter condition group."),
          sort: sortSchema,
          userIdType: userIdTypeField,
          ...paginationFields,
        },
        {
          optional: ["selectFields", "viewId", "filter", "sort", "userIdType", "offset", "limit"],
        },
      ),
      outputSchema: pageOutputSchema,
    }),
    defineProviderAction(service, {
      name: "get_base_record",
      operationType: "read",
      description: "Get one record from a Feishu Base table.",
      requiredScopes: [feishuBaseProviderPermissions.recordRead],
      providerPermissions: [feishuBaseProviderPermissions.recordRead],
      inputSchema: s.object(
        "Identify the Base record and optional returned fields.",
        {
          appToken: appTokenField,
          tableId: tableIdField,
          recordId: recordIdField,
          selectFields: s.array("The field IDs or names to return.", fieldIdField, {
            maxItems: 100,
          }),
          userIdType: userIdTypeField,
        },
        {
          optional: ["selectFields", "userIdType"],
        },
      ),
      outputSchema: resourceOutput("The requested Base record.", "record"),
    }),
    defineProviderAction(service, {
      name: "create_base_record",
      operationType: "write",
      description: "Create one record in a Feishu Base table.",
      requiredScopes: [feishuBaseProviderPermissions.recordCreate],
      providerPermissions: [feishuBaseProviderPermissions.recordCreate],
      inputSchema: s.object(
        "Identify the Base table and provide field values.",
        {
          appToken: appTokenField,
          tableId: tableIdField,
          fields: recordFieldsSchema,
          userIdType: userIdTypeField,
        },
        {
          optional: ["userIdType"],
        },
      ),
      outputSchema: writeOutput("The created Base record.", "record", "created"),
    }),
    defineProviderAction(service, {
      name: "update_base_record",
      operationType: "write",
      description: "Update one record in a Feishu Base table.",
      requiredScopes: [feishuBaseProviderPermissions.recordUpdate],
      providerPermissions: [feishuBaseProviderPermissions.recordUpdate],
      inputSchema: s.object(
        "Identify the Base record and provide field values.",
        {
          appToken: appTokenField,
          tableId: tableIdField,
          recordId: recordIdField,
          fields: recordFieldsSchema,
          userIdType: userIdTypeField,
        },
        {
          optional: ["userIdType"],
        },
      ),
      outputSchema: writeOutput("The updated Base record.", "record", "updated"),
    }),
    defineProviderAction(service, {
      name: "upsert_base_record",
      operationType: "write",
      description: "Create a Base record when recordId is omitted, or update that record when recordId is provided.",
      requiredScopes: [feishuBaseProviderPermissions.recordCreate, feishuBaseProviderPermissions.recordUpdate],
      providerPermissions: [feishuBaseProviderPermissions.recordCreate, feishuBaseProviderPermissions.recordUpdate],
      inputSchema: s.object(
        "Identify the Base table, optionally identify a record, and provide field values.",
        {
          appToken: appTokenField,
          tableId: tableIdField,
          recordId: recordIdField,
          fields: recordFieldsSchema,
          userIdType: userIdTypeField,
        },
        {
          optional: ["recordId", "userIdType"],
        },
      ),
      outputSchema: s.object(
        "The created or updated Base record.",
        {
          record: rawObjectSchema,
          operation: s.stringEnum("The operation performed.", ["created", "updated"]),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "delete_base_record",
      operationType: "destructive",
      description: "Delete one record from a Feishu Base table.",
      requiredScopes: [feishuBaseProviderPermissions.recordDelete],
      providerPermissions: [feishuBaseProviderPermissions.recordDelete],
      inputSchema: recordInput("Identify the Base record to delete."),
      outputSchema: s.object(
        "The deleted Base record reference.",
        {
          deleted: s.literal(true, { description: "Whether the record was deleted." }),
          recordId: recordIdField,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "batch_create_base_records",
      operationType: "write",
      description: "Create up to 200 records in one Feishu Base request.",
      requiredScopes: [feishuBaseProviderPermissions.recordCreate],
      providerPermissions: [feishuBaseProviderPermissions.recordCreate],
      inputSchema: s.object(
        "Identify the Base table and provide record field maps.",
        {
          appToken: appTokenField,
          tableId: tableIdField,
          records: s.array("The record field maps to create.", recordFieldsSchema, {
            minItems: 1,
            maxItems: 200,
          }),
          userIdType: userIdTypeField,
        },
        {
          optional: ["userIdType"],
        },
      ),
      outputSchema: s.object(
        "The batch-created Base records.",
        {
          records: s.array("The records returned by Feishu.", rawObjectSchema),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "batch_update_base_records",
      operationType: "write",
      description: "Update up to 200 records with record-specific fields in one Feishu Base request.",
      requiredScopes: [feishuBaseProviderPermissions.recordUpdate],
      providerPermissions: [feishuBaseProviderPermissions.recordUpdate],
      inputSchema: s.object(
        "Identify the Base table and map record IDs to their field values.",
        {
          appToken: appTokenField,
          tableId: tableIdField,
          records: batchUpdateRecordsSchema,
          userIdType: userIdTypeField,
        },
        {
          optional: ["userIdType"],
        },
      ),
      outputSchema: s.object(
        "The batch update result.",
        {
          records: s.array("The updated records returned by Feishu, when available.", rawObjectSchema),
          ignoredFields: s.array(
            "Fields ignored by Feishu during the batch update.",
            s.string("An ignored field ID or name."),
          ),
        },
        {
          optional: ["records", "ignoredFields"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "batch_delete_base_records",
      operationType: "destructive",
      description: "Delete up to 200 records in one Feishu Base request.",
      requiredScopes: [feishuBaseProviderPermissions.recordDelete],
      providerPermissions: [feishuBaseProviderPermissions.recordDelete],
      inputSchema: s.object(
        "Identify the Base table and records to delete.",
        {
          appToken: appTokenField,
          tableId: tableIdField,
          recordIds: s.array("The record IDs to delete.", recordIdField, {
            minItems: 1,
            maxItems: 200,
          }),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The deleted Base record references.",
        {
          deleted: s.literal(true, { description: "Whether the records were deleted." }),
          recordIds: s.array("The deleted record IDs.", recordIdField),
        },
        {
          optional: [],
        },
      ),
    }),
  ];
}
