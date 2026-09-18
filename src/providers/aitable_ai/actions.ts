import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aitable_ai";
const spaceId = s.nonEmptyString("The AITable space ID.");
const datasheetId = s.nonEmptyString("The AITable datasheet ID.");
const record = s.looseRequiredObject("An AITable record with provider-defined field values.", {
  recordId: s.string("The stable AITable record ID."),
  fields: s.looseRequiredObject("Field values keyed by field name or field ID.", {}),
});
const writableRecord = s.requiredObject("An AITable record to create.", {
  fields: s.looseRequiredObject("Field values keyed by field name or field ID.", {}),
});
const updatableRecord = s.requiredObject("An AITable record to update.", {
  recordId: s.nonEmptyString("The AITable record ID to update."),
  fields: s.looseRequiredObject("Field values keyed by field name or field ID.", {}),
});
const fieldKey = s.stringEnum("Whether field names or field IDs identify record fields.", ["name", "id"]);
const recordWriteOutput = s.requiredObject("Records returned by AITable.", {
  records: s.array("The records returned by AITable.", record),
});

export const aitableAiActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_spaces",
    operationType: "read",
    description: "List the AITable spaces accessible to the authenticated user.",
    inputSchema: s.object("Input for listing accessible AITable spaces.", {}),
    outputSchema: s.requiredObject("Accessible AITable spaces.", {
      spaces: s.array(
        "Spaces returned by AITable.",
        s.looseRequiredObject("An AITable space summary.", {
          id: s.string("The stable AITable space ID."),
          name: s.string("The AITable space name."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_nodes",
    operationType: "read",
    description: "List the top-level file nodes in an AITable space.",
    inputSchema: s.requiredObject("Input for listing top-level AITable nodes.", { spaceId }),
    outputSchema: s.requiredObject("Top-level AITable nodes.", {
      nodes: s.array(
        "Nodes returned by AITable.",
        s.looseRequiredObject("An AITable file node.", {
          id: s.string("The stable AITable node ID."),
          name: s.string("The node name."),
          type: s.string("The node type, such as Datasheet or Folder."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_fields",
    operationType: "read",
    description: "List field definitions for an AITable datasheet.",
    inputSchema: s.requiredObject("Input for listing AITable datasheet fields.", { datasheetId }),
    outputSchema: s.requiredObject("AITable datasheet fields.", {
      fields: s.array(
        "Field definitions returned by AITable.",
        s.looseRequiredObject("An AITable field definition.", {
          id: s.string("The stable AITable field ID."),
          name: s.string("The field name."),
          type: s.string("The AITable field type."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_views",
    operationType: "read",
    description: "List views configured for an AITable datasheet.",
    inputSchema: s.requiredObject("Input for listing AITable datasheet views.", { datasheetId }),
    outputSchema: s.requiredObject("AITable datasheet views.", {
      views: s.array(
        "Views returned by AITable.",
        s.looseRequiredObject("An AITable view summary.", {
          id: s.string("The stable AITable view ID."),
          name: s.string("The view name."),
          type: s.string("The AITable view type."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_records",
    operationType: "read",
    description: "List a page of records from an AITable datasheet.",
    inputSchema: s.object(
      "Input for listing a page of AITable records.",
      {
        datasheetId,
        pageSize: s.integer("The number of records per page, from 1 to 1000.", { minimum: 1, maximum: 1000 }),
        pageNum: s.positiveInteger("The one-based page number to return."),
        maxRecords: s.positiveInteger("The maximum total number of records to return."),
        viewId: s.nonEmptyString("The view whose records and visible fields should be returned."),
        filterByFormula: s.nonEmptyString("An AITable formula used to filter records."),
        fieldKey,
        cellFormat: s.stringEnum("The representation used for cell values.", ["json", "string"]),
      },
      { optional: ["pageSize", "pageNum", "maxRecords", "viewId", "filterByFormula", "fieldKey", "cellFormat"] },
    ),
    outputSchema: s.requiredObject("A page of AITable records.", {
      pageNum: s.integer("The returned page number."),
      pageSize: s.integer("The returned page size."),
      total: s.integer("The total number of matching records."),
      records: s.array("Records in the returned page.", record),
    }),
  }),
  defineProviderAction(service, {
    name: "create_records",
    operationType: "write",
    description: "Create up to 10 records in an AITable datasheet.",
    inputSchema: s.object(
      "Input for creating AITable records.",
      {
        datasheetId,
        records: s.array("The records to create, with a maximum of 10 per request.", writableRecord, {
          minItems: 1,
          maxItems: 10,
        }),
        fieldKey,
      },
      { optional: ["fieldKey"] },
    ),
    outputSchema: recordWriteOutput,
  }),
  defineProviderAction(service, {
    name: "update_records",
    operationType: "write",
    description: "Update up to 10 existing records in an AITable datasheet.",
    inputSchema: s.object(
      "Input for updating AITable records.",
      {
        datasheetId,
        records: s.array("The records to update, with a maximum of 10 per request.", updatableRecord, {
          minItems: 1,
          maxItems: 10,
        }),
        fieldKey,
      },
      { optional: ["fieldKey"] },
    ),
    outputSchema: recordWriteOutput,
  }),
  defineProviderAction(service, {
    name: "delete_records",
    operationType: "destructive",
    description: "Delete up to 10 records from an AITable datasheet.",
    inputSchema: s.requiredObject("Input for deleting AITable records.", {
      datasheetId,
      recordIds: s.array(
        "The record IDs to delete, with a maximum of 10 per request.",
        s.string({ minLength: 1, pattern: "^[^,]+$", description: "An AITable record ID." }),
        { minItems: 1, maxItems: 10 },
      ),
    }),
    outputSchema: s.requiredObject("AITable record deletion result.", {
      deleted: s.boolean("Whether AITable confirmed the deletion."),
    }),
  }),
];
