import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  airtableBaseSchemaReadScope,
  airtableBaseSchemaWriteScope,
  airtableRecordsReadScope,
  airtableRecordsWriteScope,
  airtableWorkspacesAndBasesManageScope,
  airtableWorkspacesAndBasesReadScope,
} from "./scopes.ts";

const service = "airtable";

interface AirtableActionSource {
  name: AirtableActionName;
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  followUpActions?: string[];
}

const unknownRecord = s.record(true, { description: "Record fields keyed by field name or field ID." });
const direction = s.stringEnum(["asc", "desc"], { description: "Sort direction accepted by Airtable." });
const cellFormat = s.stringEnum(["json", "string"], {
  description: "Cell format accepted by Airtable for read operations.",
});

const baseId = s.string({ minLength: 1, description: "Base ID in the format appXXXXXXXXXXXXXX." });
const workspaceId = s.string({ minLength: 1, description: "Workspace ID in the format wspXXXXXXXXXXXXXX." });
const tableId = s.string({ minLength: 1, description: "Table ID in the format tblXXXXXXXXXXXXXX." });
const tableIdOrName = s.string({
  minLength: 1,
  description: "Table ID or table name accepted by the Airtable path parameter.",
});
const columnId = s.string({ minLength: 1, description: "Field ID in the format fldXXXXXXXXXXXXXX." });
const recordId = s.string({ minLength: 1, description: "Record ID in the format recXXXXXXXXXXXXXX." });
const baseName = s.string({ minLength: 1, description: "Name for the Airtable base." });
const tableName = s.string({ minLength: 1, description: "Name for the Airtable table." });
const fieldName = s.string({ minLength: 1, description: "Name for the Airtable field." });
const fieldType = s.string({ minLength: 1, description: "Airtable field type, such as singleLineText." });
const description = s.string({
  maxLength: 20_000,
  description: "Optional Airtable description, up to 20,000 characters.",
});
const offset = s.string({
  minLength: 1,
  description: "Opaque pagination cursor returned by a previous Airtable response.",
});
const fields = s.array(s.string({ minLength: 1 }), {
  minItems: 1,
  description: "Field names or field IDs to include in the Airtable response.",
});
const pageSize = s.integer({
  minimum: 1,
  maximum: 100,
  description: "Number of records to return per page.",
});
const maxRecords = s.integer({
  minimum: 1,
  description: "Maximum total number of records to return before Airtable stops pagination.",
});
const returnFieldsByFieldId = s.boolean({
  description: "Whether Airtable should return field IDs instead of field names in record objects.",
});
const includeDateDependencyMetadata = s.boolean({
  description: "Whether Airtable should return date dependency metadata for linked record fields.",
});
const recordMetadata = s.array(s.literal("commentCount"), {
  minItems: 1,
  description: "Record metadata fields to include in Airtable list records responses.",
});
const view = s.string({
  minLength: 1,
  description: "View name or view ID used by Airtable to filter and sort results.",
});
const filterByFormula = s.string({
  minLength: 1,
  description: "Formula string evaluated by Airtable to filter matching records.",
});
const timeZone = s.string({
  minLength: 1,
  description: "Timezone string sent to Airtable when cellFormat is string.",
});
const userLocale = s.string({
  minLength: 1,
  description: "User locale sent to Airtable when cellFormat is string.",
});
const typecast = s.boolean({
  description: "Whether Airtable should coerce incoming values to compatible field types.",
});
const dateDependencySettings = s.record(true, { description: "Airtable date dependency settings for a table." });

const sortItem = s.object(
  {
    field: s.string({ minLength: 1, description: "Field name or field ID used by Airtable for sorting." }),
    direction,
  },
  { required: ["field"], description: "Sort rule accepted by the Airtable list records endpoint." },
);

const airtableFieldConfig = s.object(
  {
    name: fieldName,
    type: fieldType,
    description,
    options: s.record(true, { description: "Type-specific Airtable field options." }),
  },
  {
    required: ["name", "type"],
    additionalProperties: true,
    description: "Airtable field configuration accepted by metadata write endpoints.",
  },
);

const airtableTableConfig = s.object(
  {
    name: tableName,
    description,
    fields: s.array(airtableFieldConfig, {
      minItems: 1,
      description: "Field configurations to create in the Airtable table.",
    }),
  },
  {
    required: ["name", "fields"],
    additionalProperties: true,
    description: "Airtable table configuration accepted when creating a base or table.",
  },
);

const airtableField = s.object(
  {
    id: s.string({ description: "Field ID." }),
    name: s.string({ description: "Field name." }),
    type: s.string({ description: "Field type reported by Airtable." }),
    description: s.string({ description: "Field description when Airtable returns one." }),
    options: s.record(true, { description: "Field options reported by Airtable." }),
  },
  { required: ["id", "name", "type"], additionalProperties: true, description: "Airtable field definition." },
);

const airtableView = s.object(
  {
    id: s.string({ description: "View ID." }),
    name: s.string({ description: "View name." }),
    type: s.string({ description: "View type reported by Airtable." }),
    visibleFieldIds: s.array(s.string(), { description: "Field IDs visible in the Airtable view." }),
  },
  { required: ["id", "name"], additionalProperties: true, description: "Airtable view definition." },
);

const airtableTable = s.object(
  {
    id: s.string({ description: "Table ID." }),
    name: s.string({ description: "Table name." }),
    description: s.string({ description: "Table description when Airtable returns one." }),
    primaryFieldId: s.string({ description: "Primary field ID configured for the table." }),
    dateDependencySettings: s.record(true, {
      description: "Date dependency settings returned by Airtable for the table.",
    }),
    fields: s.array(airtableField, { description: "Fields defined on the Airtable table." }),
    views: s.array(airtableView, { description: "Views defined on the Airtable table." }),
  },
  {
    required: ["id", "name", "fields"],
    additionalProperties: true,
    description: "Airtable table definition.",
  },
);

const airtableBase = s.object(
  {
    id: s.string({ description: "Base ID." }),
    name: s.string({ description: "Base name." }),
    permissionLevel: s.string({ description: "Permission level reported by Airtable for this base." }),
  },
  { required: ["id", "name", "permissionLevel"], description: "Airtable base summary." },
);

const airtableBaseDetails = s.object(
  {
    id: s.string({ description: "Base ID." }),
    createdTime: s.string({ description: "Base creation timestamp returned by Airtable." }),
    permissionLevel: s.string({ description: "Permission level reported by Airtable for the authenticated user." }),
    workspaceId,
    name: s.string({ description: "Base name." }),
    interfaces: s.record(true, { description: "Interface metadata returned by Airtable." }),
    collaborators: s.record(true, { description: "Deprecated collaborator metadata returned by Airtable." }),
    groupCollaborators: s.record(true, { description: "Group collaborator metadata returned by Airtable." }),
    individualCollaborators: s.record(true, { description: "Individual collaborator metadata returned by Airtable." }),
    inviteLinks: s.record(true, { description: "Invite link metadata returned by Airtable." }),
    packages: s.record(true, { description: "Package metadata returned by Airtable." }),
  },
  {
    required: ["id", "createdTime", "permissionLevel", "workspaceId", "name"],
    additionalProperties: true,
    description: "Airtable base details response.",
  },
);

const airtableCreatedBase = s.object(
  {
    id: s.string({ description: "Base ID." }),
    tables: s.array(airtableTable, { description: "Tables created with the Airtable base." }),
  },
  { required: ["id", "tables"], description: "Airtable create base response." },
);

const airtableRecord = s.object(
  {
    id: s.string({ description: "Record ID." }),
    createdTime: s.string({ description: "Record creation timestamp returned by Airtable." }),
    fields: unknownRecord,
    commentCount: s.integer({ description: "Comment count returned by Airtable when enabled on the endpoint." }),
  },
  { required: ["id", "fields"], additionalProperties: true, description: "Airtable record." },
);

const airtableDeletedRecord = s.object(
  {
    id: s.string({ description: "Record ID." }),
    deleted: s.boolean({ description: "Whether Airtable reports the record as deleted." }),
  },
  { required: ["id", "deleted"], description: "Airtable deleted-record acknowledgement." },
);

const airtableDeletedBase = s.object(
  {
    id: s.string({ description: "Base ID." }),
    deleted: s.literal(true, { description: "Whether Airtable reports the base as deleted." }),
  },
  { required: ["id", "deleted"], description: "Airtable deleted-base acknowledgement." },
);

const createRecordInput = s.object(
  {
    fields: unknownRecord,
  },
  { required: ["fields"], description: "Record payload used when creating Airtable records." },
);

const updateRecordInput = s.object(
  {
    id: recordId,
    fields: unknownRecord,
  },
  { required: ["id", "fields"], description: "Record payload used when updating Airtable records." },
);

const actions: AirtableActionSource[] = [
  action({
    name: "list_bases",
    description: "List Airtable bases accessible to the authenticated credential.",
    requiredScopes: [airtableBaseSchemaReadScope],
    followUpActions: ["airtable.get_base_collaborators", "airtable.get_base_schema"],
    inputSchema: input({ offset }),
    outputSchema: output({
      bases: s.array(airtableBase, { description: "Bases returned by Airtable." }),
      offset: s.nullable(
        s.string({ description: "Pagination cursor for the next page of bases, or null when unavailable." }),
      ),
    }),
  }),
  action({
    name: "get_base_collaborators",
    description: "Read Airtable base metadata, including workspaceId and optional collaborator details.",
    requiredScopes: [airtableBaseSchemaReadScope, airtableWorkspacesAndBasesReadScope],
    followUpActions: ["airtable.create_base", "airtable.get_base_schema"],
    inputSchema: input(
      {
        baseId,
        include: s.array(s.stringEnum(["collaborators", "inviteLinks", "interfaces", "packages"]), {
          minItems: 1,
          description: "Optional Airtable base collaboration details to include.",
        }),
      },
      ["baseId"],
    ),
    outputSchema: output({ base: airtableBaseDetails }),
  }),
  action({
    name: "get_base_schema",
    description: "Read Airtable table, field, and view schema for a specific base.",
    requiredScopes: [airtableBaseSchemaReadScope],
    followUpActions: ["airtable.create_table", "airtable.create_field", "airtable.list_records"],
    inputSchema: input(
      {
        baseId,
        include: s.array(s.literal("visibleFieldIds"), {
          minItems: 1,
          maxItems: 1,
          description: "Optional Airtable schema details to include in table views.",
        }),
      },
      ["baseId"],
    ),
    outputSchema: output({
      tables: s.array(airtableTable, { description: "Tables returned by Airtable for the base." }),
    }),
  }),
  action({
    name: "create_base",
    description: "Create an Airtable base in a workspace with the provided initial table and field schema.",
    requiredScopes: [airtableBaseSchemaWriteScope],
    followUpActions: ["airtable.get_base_schema", "airtable.delete_base"],
    inputSchema: input(
      {
        name: baseName,
        workspaceId,
        tables: s.array(airtableTableConfig, {
          minItems: 1,
          description: "Tables to create along with the new Airtable base.",
        }),
      },
      ["name", "workspaceId", "tables"],
    ),
    outputSchema: airtableCreatedBase,
  }),
  action({
    name: "delete_base",
    description: "Delete an Airtable base. Airtable restricts this endpoint to enterprise admins.",
    requiredScopes: [airtableWorkspacesAndBasesManageScope],
    inputSchema: input({ baseId }, ["baseId"]),
    outputSchema: airtableDeletedBase,
  }),
  action({
    name: "create_table",
    description: "Create a table in an Airtable base with the provided field schema.",
    requiredScopes: [airtableBaseSchemaWriteScope],
    followUpActions: ["airtable.create_records", "airtable.update_table", "airtable.create_field"],
    inputSchema: input(
      {
        baseId,
        name: tableName,
        description,
        fields: s.array(airtableFieldConfig, {
          minItems: 1,
          description: "Field configurations to create in the Airtable table.",
        }),
      },
      ["baseId", "name", "fields"],
    ),
    outputSchema: airtableTable,
  }),
  action({
    name: "update_table",
    description: "Update an Airtable table name, description, or date dependency settings.",
    requiredScopes: [airtableBaseSchemaWriteScope],
    followUpActions: ["airtable.get_base_schema"],
    inputSchema: input(
      {
        baseId,
        tableIdOrName,
        name: tableName,
        description,
        dateDependencySettings,
      },
      ["baseId", "tableIdOrName"],
    ),
    outputSchema: airtableTable,
  }),
  action({
    name: "create_field",
    description: "Create a field in an Airtable table.",
    requiredScopes: [airtableBaseSchemaWriteScope],
    followUpActions: ["airtable.update_field", "airtable.create_records"],
    inputSchema: input(
      {
        baseId,
        tableId,
        name: fieldName,
        type: fieldType,
        description,
        options: s.record(true, { description: "Type-specific Airtable field options." }),
      },
      ["baseId", "tableId", "name", "type"],
    ),
    outputSchema: airtableField,
  }),
  action({
    name: "update_field",
    description: "Update an Airtable field name, description, or type-specific options.",
    requiredScopes: [airtableBaseSchemaWriteScope],
    followUpActions: ["airtable.get_base_schema"],
    inputSchema: input(
      {
        baseId,
        tableId,
        columnId,
        name: fieldName,
        description,
        options: s.record(true, { description: "Type-specific Airtable field options." }),
      },
      ["baseId", "tableId", "columnId"],
    ),
    outputSchema: airtableField,
  }),
  action({
    name: "list_records",
    description:
      "List Airtable records from a table with optional fields, sorting, view filters, formula filters, and pagination.",
    requiredScopes: [airtableRecordsReadScope],
    followUpActions: ["airtable.get_record", "airtable.update_records"],
    inputSchema: recordReadInput({
      view,
      fields,
      sort: s.array(sortItem, { minItems: 1, description: "Sort rules applied by Airtable in order." }),
      filterByFormula,
      maxRecords,
      pageSize,
      offset,
      recordMetadata,
    }),
    outputSchema: output({
      records: s.array(airtableRecord, { description: "Records returned by Airtable." }),
      offset: s.nullable(
        s.string({ description: "Pagination cursor for the next page of records, or null when unavailable." }),
      ),
    }),
  }),
  action({
    name: "get_record",
    description: "Read a single Airtable record by record ID.",
    requiredScopes: [airtableRecordsReadScope],
    followUpActions: ["airtable.update_records", "airtable.delete_records"],
    inputSchema: recordReadInput({ recordId }, ["recordId"]),
    outputSchema: output({ record: airtableRecord }),
  }),
  action({
    name: "create_records",
    description: "Create one or more Airtable records in a table.",
    requiredScopes: [airtableRecordsWriteScope],
    followUpActions: ["airtable.list_records"],
    inputSchema: input(
      {
        baseId,
        tableIdOrName,
        records: s.array(createRecordInput, {
          minItems: 1,
          maxItems: 10,
          description: "Records to create in the Airtable table.",
        }),
        typecast,
        returnFieldsByFieldId,
      },
      ["baseId", "tableIdOrName", "records"],
    ),
    outputSchema: output({
      records: s.array(airtableRecord, { description: "Records created by Airtable." }),
    }),
  }),
  action({
    name: "update_records",
    description: "Update one or more existing Airtable records by record ID.",
    requiredScopes: [airtableRecordsWriteScope],
    followUpActions: ["airtable.get_record"],
    inputSchema: input(
      {
        baseId,
        tableIdOrName,
        records: s.array(updateRecordInput, {
          minItems: 1,
          maxItems: 10,
          description: "Records to update in the Airtable table.",
        }),
        typecast,
        returnFieldsByFieldId,
      },
      ["baseId", "tableIdOrName", "records"],
    ),
    outputSchema: output({
      records: s.array(airtableRecord, { description: "Records returned by Airtable after update." }),
    }),
  }),
  action({
    name: "delete_records",
    description: "Delete one or more Airtable records by record ID.",
    requiredScopes: [airtableRecordsWriteScope],
    inputSchema: input(
      {
        baseId,
        tableIdOrName,
        recordIds: s.array(recordId, {
          minItems: 1,
          maxItems: 10,
          description: "Record IDs to delete from the Airtable table.",
        }),
      },
      ["baseId", "tableIdOrName", "recordIds"],
    ),
    outputSchema: output({
      records: s.array(airtableDeletedRecord, {
        description: "Deleted-record acknowledgements returned by Airtable.",
      }),
    }),
  }),
];

export type AirtableActionName =
  | "list_bases"
  | "get_base_collaborators"
  | "get_base_schema"
  | "create_base"
  | "delete_base"
  | "create_table"
  | "update_table"
  | "create_field"
  | "update_field"
  | "list_records"
  | "get_record"
  | "create_records"
  | "update_records"
  | "delete_records";

export const airtableActions: ActionDefinition[] = actions.map((source) =>
  defineProviderAction(service, {
    name: source.name,
    description: source.description,
    requiredScopes: source.requiredScopes,
    providerPermissions: [],
    followUpActions: source.followUpActions,
    inputSchema: source.inputSchema,
    outputSchema: source.outputSchema,
  }),
);

function action(input: AirtableActionSource): AirtableActionSource {
  return input;
}

function input(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.actionInput(properties, required, "The input payload for this action.");
}

function output(properties: Record<string, JsonSchema>): JsonSchema {
  return s.actionOutput(properties, "Airtable action output.");
}

function recordReadInput(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return input(
    {
      baseId,
      tableIdOrName,
      cellFormat,
      timeZone,
      userLocale,
      returnFieldsByFieldId,
      includeDateDependencyMetadata,
      ...properties,
    },
    ["baseId", "tableIdOrName", ...required],
  );
}
