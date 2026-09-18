import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "quintadb";

const databaseIdSchema = s.nonEmptyString("The QuintaDB database ID.");
const formIdSchema = s.nonEmptyString("The QuintaDB form ID.");
const recordIdSchema = s.nonEmptyString("The QuintaDB record ID.");
const pageSchema = s.positiveInteger("The page number to fetch.");
const valuesSchema = s.looseObject("Record values keyed by QuintaDB field ID. Values must be JSON-compatible.");

const databaseSchema = s.looseRequiredObject(
  "A QuintaDB database.",
  {
    id: s.string("The QuintaDB database ID."),
    name: s.string("The database name."),
    created_at: s.string("When the database was created."),
    updated_at: s.string("When the database was last updated."),
    dtypes_count: s.nonNegativeInteger("The number of records in the database."),
    entities_count: s.nonNegativeInteger("The number of forms in the database."),
    properties_count: s.nonNegativeInteger("The number of fields in the database."),
  },
  {
    optional: ["created_at", "updated_at", "dtypes_count", "entities_count", "properties_count"],
  },
);

const formSchema = s.looseRequiredObject(
  "A QuintaDB form.",
  {
    id: s.string("The QuintaDB form ID."),
    app_id: s.string("The database ID that owns the form."),
    name: s.string("The form name."),
    desc: s.nullable(s.string("The form description.")),
    position: s.integer("The form position in its database."),
    per_page: s.positiveInteger("The configured record page size."),
    records_count: s.nonNegativeInteger("The number of records in the form."),
  },
  {
    optional: ["desc", "position", "per_page", "records_count"],
  },
);

const fieldSchema = s.looseRequiredObject(
  "A QuintaDB form field.",
  {
    id: s.string("The QuintaDB field ID."),
    entity_id: s.string("The form ID that owns the field."),
    name: s.string("The field name."),
    desc: s.nullable(s.string("The field description.")),
    type_name: s.string("The QuintaDB field type."),
    position: s.integer("The field position in its form."),
    visible: s.boolean("Whether the field is visible."),
  },
  {
    optional: ["desc", "position", "visible"],
  },
);

const recordSchema = s.looseRequiredObject(
  "A QuintaDB record.",
  {
    id: s.string("The QuintaDB record ID."),
    app_id: s.string("The database ID that owns the record."),
    entity_id: s.string("The form ID that owns the record."),
    values: valuesSchema,
    approved: s.boolean("Whether the record is approved."),
    created_at: s.string("When the record was created."),
    updated_at: s.string("When the record was last updated."),
  },
  {
    optional: ["approved", "created_at", "updated_at"],
  },
);

export const quintaDbActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_databases",
    operationType: "read",
    description: "List QuintaDB databases accessible to the connected API key.",
    requiredScopes: [],
    followUpActions: ["quintadb.get_database", "quintadb.list_forms"],
    inputSchema: s.object(
      "Input for listing QuintaDB databases.",
      {
        page: pageSchema,
      },
      { optional: ["page"] },
    ),
    outputSchema: s.requiredObject("Databases returned by QuintaDB.", {
      databases: s.array("The databases on the requested page.", databaseSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_database",
    operationType: "read",
    description: "Retrieve one QuintaDB database by ID.",
    requiredScopes: [],
    followUpActions: ["quintadb.list_forms"],
    inputSchema: s.requiredObject("Input for retrieving a QuintaDB database.", {
      databaseId: databaseIdSchema,
    }),
    outputSchema: s.requiredObject("A QuintaDB database response.", {
      database: databaseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_forms",
    operationType: "read",
    description: "List forms in one QuintaDB database.",
    requiredScopes: [],
    followUpActions: ["quintadb.list_fields", "quintadb.list_records"],
    inputSchema: s.requiredObject("Input for listing QuintaDB forms.", {
      databaseId: databaseIdSchema,
    }),
    outputSchema: s.requiredObject("Forms returned by QuintaDB.", {
      forms: s.array("The forms in the database.", formSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_fields",
    operationType: "read",
    description: "List fields in one QuintaDB form.",
    requiredScopes: [],
    followUpActions: ["quintadb.create_record"],
    inputSchema: s.requiredObject("Input for listing QuintaDB form fields.", {
      databaseId: databaseIdSchema,
      formId: formIdSchema,
    }),
    outputSchema: s.requiredObject("Fields returned by QuintaDB.", {
      fields: s.array("The fields in the form.", fieldSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_records",
    operationType: "read",
    description: "List records from one QuintaDB form with optional paging and report filtering.",
    requiredScopes: [],
    followUpActions: ["quintadb.get_record", "quintadb.update_record"],
    inputSchema: s.object(
      "Input for listing QuintaDB records.",
      {
        databaseId: databaseIdSchema,
        formId: formIdSchema,
        page: pageSchema,
        perPage: s.integer("The number of records to return, from 1 to 200.", {
          minimum: 1,
          maximum: 200,
        }),
        viewId: s.nonEmptyString("The optional QuintaDB report ID used to filter records."),
        nameValue: s.boolean("Whether record values should include field names alongside field IDs."),
      },
      { optional: ["page", "perPage", "viewId", "nameValue"] },
    ),
    outputSchema: s.requiredObject("Records returned by QuintaDB.", {
      records: s.array("The records on the requested page.", recordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_record",
    operationType: "read",
    description: "Retrieve one QuintaDB record by database ID and record ID.",
    requiredScopes: [],
    followUpActions: ["quintadb.update_record", "quintadb.delete_record"],
    inputSchema: s.object(
      "Input for retrieving a QuintaDB record.",
      {
        databaseId: databaseIdSchema,
        recordId: recordIdSchema,
        nameValue: s.boolean("Whether record values should include field names alongside field IDs."),
      },
      { optional: ["nameValue"] },
    ),
    outputSchema: s.requiredObject("A QuintaDB record response.", {
      record: recordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_record",
    operationType: "write",
    description: "Create one record in a QuintaDB form.",
    requiredScopes: [],
    followUpActions: ["quintadb.get_record"],
    inputSchema: s.requiredObject("Input for creating a QuintaDB record.", {
      databaseId: databaseIdSchema,
      formId: formIdSchema,
      values: valuesSchema,
    }),
    outputSchema: s.requiredObject("A created QuintaDB record response.", {
      record: recordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_record",
    operationType: "write",
    description: "Update the supplied field values on one QuintaDB record.",
    requiredScopes: [],
    followUpActions: ["quintadb.get_record"],
    inputSchema: s.requiredObject("Input for updating a QuintaDB record.", {
      databaseId: databaseIdSchema,
      recordId: recordIdSchema,
      values: valuesSchema,
    }),
    outputSchema: s.requiredObject("An updated QuintaDB record response.", {
      record: recordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_record",
    operationType: "destructive",
    description: "Delete one QuintaDB record permanently.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input for deleting a QuintaDB record.", {
      databaseId: databaseIdSchema,
      recordId: recordIdSchema,
    }),
    outputSchema: s.requiredObject("A deleted QuintaDB record response.", {
      record: recordSchema,
    }),
  }),
];
