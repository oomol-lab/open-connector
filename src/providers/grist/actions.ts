import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "grist";

const looseObjectSchema = s.looseObject("A raw Grist object.");
const unknownRecordSchema = s.record("Column IDs mapped to cell values.", s.unknown("A Grist cell value."));
const timestampField = s.string("Timestamp in ISO 8601 format.");
const docIdField = s.string("The Grist document identifier.", { minLength: 1 });
const tableIdField = s.string("The Grist table identifier.", { minLength: 1 });
const hiddenField = s.boolean("Whether hidden metadata columns should be included.");
const noparseField = s.boolean("Whether Grist should store values without automatic parsing.");
const sortField = s.string("Comma-separated columns to sort by. Prefix with '-' for descending.");
const filterField = s.string('JSON string that maps column IDs to allowed values arrays, such as \'{"pet":["cat"]}\'.');
const limitField = s.integer("Maximum number of records to return. Use 0 for no limit.", { minimum: 0 });

const recordInputSchema = s.object("A record to add to a Grist table.", {
  fields: unknownRecordSchema,
});
const recordUpdateInputSchema = s.object("A record update for an existing Grist row.", {
  id: s.positiveInteger("The Grist row ID to update."),
  fields: unknownRecordSchema,
});
const rowIdsField = s.array(
  "Row IDs to delete from the target table.",
  s.positiveInteger("A Grist row ID to delete."),
  { minItems: 1 },
);
const documentSummarySchema = s.looseObject("Summary of a Grist document.", {
  id: s.string("Unique document identifier."),
  name: s.string("Document name."),
  access: s.string("Access level for the authenticated user."),
  urlId: s.nullableString("Short URL alias for the document, if any."),
  type: s.nullableString("Document type, if Grist reports one."),
  trunkId: s.nullableString("Parent document ID when the document is a fork."),
  isPinned: s.boolean("Whether the document is pinned in the workspace."),
  createdAt: timestampField,
  updatedAt: timestampField,
  forks: s.array("Fork summaries attached to the document, when present.", looseObjectSchema),
});
const workspaceSummarySchema = s.looseObject("Summary of a Grist workspace.", {
  id: s.integer("Workspace identifier."),
  name: s.string("Workspace name."),
  access: s.string("Access level for the authenticated user."),
  orgDomain: s.nullableString("Organization domain that owns the workspace, when present."),
  docs: s.array("Documents contained in the workspace.", documentSummarySchema),
  owner: s.nullable(looseObjectSchema),
  createdAt: timestampField,
  updatedAt: timestampField,
  isSupportWorkspace: s.boolean("Whether Grist marks this as a support workspace."),
});
const documentSchema = s.looseObject("Metadata for a Grist document.", {
  id: s.string("Unique document identifier."),
  name: s.string("Document name."),
  access: s.string("Access level for the authenticated user."),
  urlId: s.nullableString("Short URL alias for the document, if any."),
  isPinned: s.boolean("Whether the document is pinned."),
  type: s.nullableString("Document type, when present."),
  workspace: workspaceSummarySchema,
  org: looseObjectSchema,
  createdAt: timestampField,
  updatedAt: timestampField,
  forks: s.array("Fork metadata attached to the document, when present.", looseObjectSchema),
  aliases: s.array("Document aliases attached to the document, when present.", looseObjectSchema),
});
const tableSchema = s.looseObject("Metadata for a Grist table.", {
  id: s.string("Table identifier."),
  fields: s.looseObject("Metadata fields for the table.", {
    tableRef: s.integer("Internal table reference identifier."),
    onDemand: s.boolean("Whether the table is loaded on demand."),
  }),
});
const columnSchema = s.looseObject("Metadata for a Grist column.", {
  id: s.string("Column identifier."),
  fields: s.looseObject("Metadata fields for the column.", {
    label: s.string("Display label of the column."),
    type: s.string("Grist column type."),
    formula: s.string("Formula expression when the column is formula-backed."),
    isFormula: s.boolean("Whether the column is formula-backed."),
    description: s.string("Help text or description of the column."),
  }),
});
const recordSchema = s.object("A Grist table record.", {
  id: s.integer("Row ID of the record."),
  fields: unknownRecordSchema,
});
const createdRecordSchema = s.object("A Grist record creation acknowledgement.", {
  id: s.integer("Row ID of the created record."),
});
const docInputSchema = (description: string) => s.object(description, { docId: docIdField });
const docTableInputSchema = (
  description: string,
  properties: Record<string, ReturnType<typeof s.unknown>> = {},
  optional: string[] = [],
) =>
  s.object(
    description,
    {
      docId: docIdField,
      tableId: tableIdField,
      ...properties,
    },
    { optional },
  );

export const gristActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_workspaces",
    description:
      "List the Grist workspaces and documents that the authenticated API key can access on the current Grist site.",
    inputSchema: s.object("The input payload for listing Grist workspaces.", {}),
    outputSchema: s.object("Workspace and document list returned by Grist.", {
      workspaces: s.array("Workspaces available to the authenticated user.", workspaceSummarySchema),
    }),
    followUpActions: ["grist.get_document"],
  }),
  defineProviderAction(service, {
    name: "get_document",
    description: "Fetch metadata for a Grist document by document ID or short URL alias.",
    inputSchema: docInputSchema("The input payload for fetching a Grist document."),
    outputSchema: documentSchema,
    followUpActions: ["grist.list_tables"],
  }),
  defineProviderAction(service, {
    name: "list_tables",
    description: "List the tables defined in a Grist document.",
    inputSchema: docInputSchema("The input payload for listing Grist document tables."),
    outputSchema: s.object("Table list returned by Grist.", {
      tables: s.array("Tables returned by Grist for the document.", tableSchema),
    }),
    followUpActions: ["grist.list_columns", "grist.list_records"],
  }),
  defineProviderAction(service, {
    name: "list_columns",
    description: "List the columns defined in a Grist table.",
    inputSchema: docTableInputSchema(
      "The input payload for listing Grist table columns.",
      {
        hidden: hiddenField,
      },
      ["hidden"],
    ),
    outputSchema: s.object("Column list returned by Grist.", {
      columns: s.array("Columns returned by Grist for the table.", columnSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_records",
    description:
      "List records from a Grist table with optional filtering, sorting, limits, and hidden-column inclusion.",
    inputSchema: docTableInputSchema(
      "The input payload for listing Grist table records.",
      {
        hidden: hiddenField,
        sort: sortField,
        filter: filterField,
        limit: limitField,
      },
      ["hidden", "sort", "filter", "limit"],
    ),
    outputSchema: s.object("Record list returned by Grist.", {
      records: s.array("Records returned by Grist for the table.", recordSchema),
    }),
    followUpActions: ["grist.update_records", "grist.delete_records"],
  }),
  defineProviderAction(service, {
    name: "add_records",
    description: "Add one or more records to a Grist table.",
    inputSchema: docTableInputSchema(
      "The input payload for adding records to a Grist table.",
      {
        noparse: noparseField,
        records: s.array("Records to add to the target table.", recordInputSchema, { minItems: 1 }),
      },
      ["noparse"],
    ),
    outputSchema: s.object("Record creation acknowledgement returned by Grist.", {
      records: s.array("Created record IDs returned by Grist.", createdRecordSchema),
    }),
    followUpActions: ["grist.list_records"],
  }),
  defineProviderAction(service, {
    name: "update_records",
    description: "Update one or more existing Grist records by row ID.",
    inputSchema: docTableInputSchema(
      "The input payload for updating records in a Grist table.",
      {
        noparse: noparseField,
        records: s.array("Records to update in the target table.", recordUpdateInputSchema, { minItems: 1 }),
      },
      ["noparse"],
    ),
    outputSchema: s.object("Local acknowledgement for a successful Grist record update.", {
      ok: s.boolean("Whether the Grist update request completed successfully."),
      updatedCount: s.integer("Number of records included in the update request."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_records",
    description: "Delete one or more records from a Grist table by row ID.",
    inputSchema: docTableInputSchema(
      "The input payload for deleting records from a Grist table.",
      {
        rowIds: rowIdsField,
      },
      [],
    ),
    outputSchema: s.object("Local acknowledgement for a successful Grist record deletion.", {
      ok: s.boolean("Whether the Grist delete request completed successfully."),
      deletedRowIds: s.array("Row IDs that were requested for deletion.", s.integer("A deleted row ID.")),
    }),
  }),
];
