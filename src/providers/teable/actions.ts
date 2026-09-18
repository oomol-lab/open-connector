import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "teable";

const fieldKeyTypeSchema = s.stringEnum("The key type used for record fields in the request or response.", [
  "id",
  "name",
  "dbFieldName",
]);

const cellFormatSchema = s.stringEnum("The format used for record cell values.", ["json", "text"]);

const recordFilterSchema = s.looseRequiredObject(
  "A Teable filter object containing field conditions or nested filter groups.",
  {
    conjunction: s.stringEnum("How the filter entries are combined.", ["and", "or"]),
    filterSet: s.array(
      "The field conditions or nested filter groups to apply.",
      s.unknown("A Teable field condition or nested filter group."),
    ),
  },
);

const recordSortSchema = s.object("A Teable record sort definition.", {
  fieldId: s.nonEmptyString("The ID of the field used for sorting."),
  order: s.stringEnum("The direction used to sort the field.", ["asc", "desc"]),
});

const recordFieldsSchema = s.record(
  "Record values keyed by Teable field name, field ID, or database field name.",
  s.unknown("A Teable cell value using the field's documented value shape."),
);

const recordSchema = s.looseRequiredObject(
  "A Teable record. Provider-added fields are preserved.",
  {
    id: s.nonEmptyString("The Teable record ID."),
    fields: recordFieldsSchema,
    name: s.string("The primary field value rendered as text."),
    autoNumber: s.number("The table-wide auto number assigned to the record."),
    createdTime: s.dateTime("The ISO 8601 time when the record was created."),
    lastModifiedTime: s.dateTime("The ISO 8601 time when the record was last modified."),
    createdBy: s.string("The name of the user who created the record."),
    lastModifiedBy: s.string("The name of the user who last modified the record."),
    permissions: s.unknownObject("Provider-defined permissions for the record."),
    undeletable: s.boolean("Whether Teable prevents this record from being deleted."),
  },
  {
    optional: [
      "name",
      "autoNumber",
      "createdTime",
      "lastModifiedTime",
      "createdBy",
      "lastModifiedBy",
      "permissions",
      "undeletable",
    ],
  },
);

const spaceSchema = s.looseRequiredObject(
  "A Teable space. Provider-added fields are preserved.",
  {
    id: s.nonEmptyString("The Teable space ID."),
    name: s.nonEmptyString("The display name of the space."),
    role: s.stringEnum("The current user's role in the space.", ["owner", "creator", "editor", "commenter", "viewer"]),
    organization: s.unknownObject("The organization associated with the space, when present."),
  },
  { optional: ["organization"] },
);

const baseSchema = s.looseRequiredObject(
  "A Teable base. Provider-added fields are preserved.",
  {
    id: s.nonEmptyString("The Teable base ID."),
    name: s.nonEmptyString("The display name of the base."),
    spaceId: s.nonEmptyString("The ID of the space containing the base."),
    icon: s.nullable(s.string("The base icon, when configured.")),
    role: s.stringEnum("The current user's role in the base.", ["owner", "creator", "editor", "commenter", "viewer"]),
    createdBy: s.string("The ID of the user who created the base."),
  },
  { optional: ["icon", "role", "createdBy"] },
);

const tableSchema = s.looseRequiredObject(
  "A Teable table. Provider-added fields are preserved.",
  {
    id: s.nonEmptyString("The Teable table ID."),
    name: s.nonEmptyString("The display name of the table."),
    dbTableName: s.nonEmptyString("The physical database table name managed by Teable."),
    description: s.string("The table description."),
    icon: s.string("The emoji icon configured for the table."),
    order: s.number("The table's display order within the base."),
    lastModifiedTime: s.dateTime("The ISO 8601 time when the table was last modified."),
    defaultViewId: s.string("The ID of the table's default view."),
  },
  { optional: ["description", "icon", "order", "lastModifiedTime", "defaultViewId"] },
);

const recordReadOptions = {
  projection: s.stringArray("The field names or IDs to include, interpreted according to fieldKeyType.", {
    minItems: 1,
    itemDescription: "A field name, field ID, or database field name.",
  }),
  cellFormat: cellFormatSchema,
  fieldKeyType: fieldKeyTypeSchema,
};

const recordWriteOptions = {
  fieldKeyType: fieldKeyTypeSchema,
  typecast: s.boolean("Whether Teable should automatically convert supplied values to each field's data type."),
};

export const teableActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Get the Teable user associated with the connected personal access token.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to get the current Teable user.", {}),
    outputSchema: s.object(
      "The Teable user associated with the connected token.",
      {
        id: s.nonEmptyString("The Teable user ID."),
        name: s.nonEmptyString("The user's display name."),
        avatar: s.nullable(s.string("The user's avatar URL, when configured.")),
        email: s.email("The user's email address, when returned by Teable."),
      },
      { optional: ["avatar", "email"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_spaces",
    operationType: "read",
    description: "List the Teable spaces accessible to the connected personal access token.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list accessible Teable spaces.", {}),
    outputSchema: s.object("Spaces accessible to the connected Teable token.", {
      spaces: s.array("The accessible Teable spaces.", spaceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_bases",
    operationType: "read",
    description: "List the Teable bases in a space accessible to the connected token.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing Teable bases in a space.", {
      spaceId: s.nonEmptyString("The ID of the Teable space whose bases should be listed."),
    }),
    outputSchema: s.object("Bases in the requested Teable space.", {
      bases: s.array("The Teable bases returned for the space.", baseSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_tables",
    operationType: "read",
    description: "List the Teable tables in a base accessible to the connected token.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing Teable tables in a base.", {
      baseId: s.nonEmptyString("The ID of the Teable base whose tables should be listed."),
    }),
    outputSchema: s.object("Tables in the requested Teable base.", {
      tables: s.array("The Teable tables returned for the base.", tableSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_records",
    operationType: "read",
    description:
      "List records in a Teable table with optional projection, view, filtering, sorting, and offset pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing records from a Teable table.",
      {
        tableId: s.nonEmptyString("The ID of the Teable table whose records should be listed."),
        ...recordReadOptions,
        viewId: s.nonEmptyString("The view whose filters and sorting should be applied."),
        ignoreViewQuery: s.boolean("Whether to ignore the selected view's filter and sorting configuration."),
        filter: recordFilterSchema,
        orderBy: s.array("The Teable sort definitions applied in priority order.", recordSortSchema),
        take: s.integer("The maximum number of records to return, up to 1000.", {
          minimum: 1,
          maximum: 1000,
        }),
        skip: s.integer("The number of records to skip before returning results.", { minimum: 0 }),
      },
      {
        optional: [
          "projection",
          "cellFormat",
          "fieldKeyType",
          "viewId",
          "ignoreViewQuery",
          "filter",
          "orderBy",
          "take",
          "skip",
        ],
      },
    ),
    outputSchema: s.object(
      "Records returned by Teable and optional provider-defined query metadata.",
      {
        records: s.array("The Teable records returned by the query.", recordSchema),
        extra: s.unknownObject("Provider-defined grouping or search metadata."),
      },
      { optional: ["extra"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_record",
    operationType: "read",
    description: "Get one Teable record by table ID and record ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for getting a single Teable record.",
      {
        tableId: s.nonEmptyString("The ID of the Teable table containing the record."),
        recordId: s.nonEmptyString("The ID of the Teable record to retrieve."),
        ...recordReadOptions,
      },
      { optional: ["projection", "cellFormat", "fieldKeyType"] },
    ),
    outputSchema: s.object("The requested Teable record.", {
      record: recordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_records",
    operationType: "write",
    description: "Create one or more records in a Teable table using provider-defined field values.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating records in a Teable table.",
      {
        tableId: s.nonEmptyString("The ID of the Teable table where records should be created."),
        records: s.array(
          "The records to create.",
          s.object("A Teable record creation payload.", {
            fields: recordFieldsSchema,
          }),
          { minItems: 1 },
        ),
        ...recordWriteOptions,
      },
      { optional: ["fieldKeyType", "typecast"] },
    ),
    outputSchema: s.object("Records created by Teable.", {
      records: s.array("The newly created Teable records.", recordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "update_record",
    operationType: "write",
    description: "Update the fields of one Teable record by table ID and record ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for updating a Teable record.",
      {
        tableId: s.nonEmptyString("The ID of the Teable table containing the record."),
        recordId: s.nonEmptyString("The ID of the Teable record to update."),
        fields: recordFieldsSchema,
        ...recordWriteOptions,
      },
      { optional: ["fieldKeyType", "typecast"] },
    ),
    outputSchema: s.object("The Teable record after the update.", {
      record: recordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_record",
    operationType: "destructive",
    description: "Permanently delete one Teable record by table ID and record ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for permanently deleting a Teable record.", {
      tableId: s.nonEmptyString("The ID of the Teable table containing the record."),
      recordId: s.nonEmptyString("The ID of the Teable record to permanently delete."),
    }),
    outputSchema: s.object("The connector's acknowledgement of the Teable delete operation.", {
      deleted: s.boolean("Whether Teable accepted the delete request."),
      recordId: s.nonEmptyString("The ID of the deleted Teable record."),
    }),
  }),
];
