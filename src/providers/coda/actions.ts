import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "coda";

const looseObjectSchema = s.looseObject("A Coda object returned by the API.");
const unknownRecordSchema = s.record(
  "A record of values keyed by Coda field names or IDs.",
  s.unknown("A Coda value."),
);
const paginationLimitField = s.integer("Maximum number of results to return.", {
  minimum: 1,
  maximum: 100,
});
const pageTokenField = s.nonEmptyString("Opaque token used to fetch the next page of results.");
const docIdField = s.nonEmptyString("ID of the doc.");
const requestIdField = s.nonEmptyString("Request ID returned by a previous mutation.");
const tableIdOrNameField = s.nonEmptyString("ID or name of the table. Names are discouraged because they are fragile.");
const nextPageTokenField = s.nullableString(
  "Opaque token used to fetch the next page of results, or null when unavailable.",
);
const nextPageLinkField = s.nullableString("URL for the next page of results, or null when unavailable.");

const workspaceReferenceSchema = s.looseObject("Coda workspace reference.", {
  id: s.string("ID of the workspace."),
  type: s.string("Type of the workspace reference."),
  href: s.string("API link to the workspace."),
  browserLink: s.string("Browser-friendly link to the workspace."),
  name: s.string("Name of the workspace."),
});

const pageReferenceSchema = s.looseObject("Coda page reference.", {
  id: s.string("ID of the page."),
  type: s.string("Type of the page reference."),
  href: s.string("API link to the page."),
  browserLink: s.string("Browser-friendly link to the page."),
  name: s.string("Name of the page."),
});

const tableReferenceSchema = s.looseObject("Coda table reference.", {
  id: s.string("ID of the table."),
  type: s.string("Type of the table reference."),
  tableType: s.string("Type of the table or view."),
  href: s.string("API link to the table."),
  browserLink: s.string("Browser-friendly link to the table."),
  name: s.string("Name of the table."),
});

const columnReferenceSchema = s.looseObject("Coda column reference.", {
  id: s.string("ID of the column."),
  type: s.string("Type of the column reference."),
  href: s.string("API link to the column."),
  name: s.string("Name of the column."),
});

const userSchema = s.looseObject("Coda current user.", {
  name: s.string("Name of the user."),
  loginId: s.string("Email address of the user."),
  type: s.string("Type of the user resource."),
  pictureLink: s.string("Browser-friendly link to the user's avatar image."),
  scoped: s.boolean("Whether the token has restricted access."),
  tokenName: s.string("Name of the token used for this request."),
  href: s.string("API link to the user."),
  workspace: workspaceReferenceSchema,
});

const docSchema = s.looseObject("Coda doc.", {
  id: s.string("ID of the Coda doc."),
  type: s.string("Type of the doc resource."),
  href: s.string("API link to the Coda doc."),
  browserLink: s.string("Browser-friendly link to the Coda doc."),
  name: s.string("Name of the doc."),
  owner: s.string("Email address of the doc owner."),
  ownerName: s.string("Name of the doc owner."),
  icon: looseObjectSchema,
  docSize: looseObjectSchema,
  sourceDoc: looseObjectSchema,
  createdAt: s.string("Timestamp when the doc was created."),
  updatedAt: s.string("Timestamp when the doc was last modified."),
  published: looseObjectSchema,
  folder: looseObjectSchema,
  workspace: workspaceReferenceSchema,
  workspaceId: s.string("ID of the Coda workspace containing this doc."),
  folderId: s.string("ID of the Coda folder containing this doc."),
});

const pageSchema = s.looseObject("Coda page.", {
  id: s.string("ID of the page."),
  type: s.string("Type of the page resource."),
  href: s.string("API link to the page."),
  browserLink: s.string("Browser-friendly link to the page."),
  name: s.string("Name of the page."),
  subtitle: s.string("Subtitle of the page."),
  icon: looseObjectSchema,
  image: looseObjectSchema,
  contentType: s.string("Type of page content."),
  isHidden: s.boolean("Whether the page is hidden in the UI."),
  isEffectivelyHidden: s.boolean("Whether the page or one of its ancestors is hidden in the UI."),
  parent: pageReferenceSchema,
  children: s.array("Child page references.", pageReferenceSchema),
  authors: s.array("Authors associated with the page.", looseObjectSchema),
  createdAt: s.string("Timestamp when the page was created."),
  createdBy: looseObjectSchema,
  updatedAt: s.string("Timestamp when the page was last updated."),
  updatedBy: looseObjectSchema,
});

const tableSchema = s.looseObject("Coda table.", {
  id: s.string("ID of the table."),
  type: s.string("Type of the table resource."),
  tableType: s.string("Type of the table or view."),
  href: s.string("API link to the table."),
  browserLink: s.string("Browser-friendly link to the table."),
  name: s.string("Name of the table."),
  parent: pageReferenceSchema,
  parentTable: tableReferenceSchema,
  displayColumn: columnReferenceSchema,
  rowCount: s.integer("Total number of rows in the table."),
  sorts: s.array("Sorts applied to the table.", looseObjectSchema),
  layout: looseObjectSchema,
  filter: looseObjectSchema,
  createdAt: s.string("Timestamp when the table was created."),
  updatedAt: s.string("Timestamp when the table was last modified."),
  viewId: s.string("View ID associated with the table, when present."),
});

const columnSchema = s.looseObject("Coda column.", {
  id: s.string("ID of the column."),
  type: s.string("Type of the column resource."),
  href: s.string("API link to the column."),
  name: s.string("Name of the column."),
  display: s.boolean("Whether the column is the display column."),
  calculated: s.boolean("Whether the column has a formula."),
  formula: s.string("Formula configured on the column."),
  defaultValue: s.string("Default value formula for the column."),
  format: looseObjectSchema,
});

const rowSchema = s.looseObject("Coda row.", {
  id: s.string("ID of the row."),
  type: s.string("Type of the row resource."),
  href: s.string("API link to the row."),
  name: s.string("Display name of the row."),
  index: s.integer("Index of the row within the table."),
  browserLink: s.string("Browser-friendly link to the row."),
  createdAt: s.string("Timestamp when the row was created."),
  updatedAt: s.string("Timestamp when the row was last modified."),
  values: unknownRecordSchema,
});

const pageListOutputSchema = s.object("Paginated Coda page list.", {
  items: s.array("Pages returned by the query.", pageSchema),
  nextPageToken: nextPageTokenField,
  nextPageLink: nextPageLinkField,
});

const docListOutputSchema = s.object("Paginated Coda doc list.", {
  items: s.array("Docs returned by the query.", docSchema),
  nextPageToken: nextPageTokenField,
  nextPageLink: nextPageLinkField,
});

const tableListOutputSchema = s.object("Paginated Coda table list.", {
  items: s.array("Tables returned by the query.", tableReferenceSchema),
  nextPageToken: nextPageTokenField,
  nextPageLink: nextPageLinkField,
});

const columnListOutputSchema = s.object("Paginated Coda column list.", {
  items: s.array("Columns returned by the query.", columnSchema),
  nextPageToken: nextPageTokenField,
  nextPageLink: nextPageLinkField,
});

const rowListOutputSchema = s.object("Paginated Coda row list.", {
  items: s.array("Rows returned by the query.", rowSchema),
  nextPageToken: nextPageTokenField,
  nextPageLink: nextPageLinkField,
  nextSyncToken: s.nullableString("Opaque sync token for incremental follow-up reads, or null when unavailable."),
});

const rowCellEditSchema = s.object(
  "Cell edit payload.",
  {
    column: s.nonEmptyString("Column ID, URL, or name associated with this edit."),
    value: s.unknown("Value to write to the cell."),
  },
  { required: ["column", "value"] },
);

const rowEditSchema = s.object(
  "Row edit payload.",
  {
    cells: s.array("Cells to write for the target row.", rowCellEditSchema, { minItems: 1 }),
  },
  { required: ["cells"] },
);

export const codaActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the current Coda user associated with the authenticated API token.",
    inputSchema: s.object("The input payload for this action.", {}),
    outputSchema: s.object("The output payload for this action.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_docs",
    description:
      "List Coda docs accessible to the authenticated user with optional ownership, publication, workspace, and pagination filters.",
    inputSchema: s.object("The input payload for this action.", {
      isOwner: s.boolean("Show only docs owned by the user."),
      isPublished: s.boolean("Show only published docs."),
      query: s.string("Search term used to filter down results."),
      sourceDoc: s.string("Show only docs copied from the specified doc ID."),
      isStarred: s.boolean("Whether to filter by starred state."),
      inGallery: s.boolean("Show only docs visible within the gallery."),
      workspaceId: s.string("Show only docs in the given workspace."),
      folderId: s.string("Show only docs in the given folder."),
      limit: paginationLimitField,
      pageToken: pageTokenField,
    }),
    outputSchema: docListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_doc",
    description: "Get metadata for a specific Coda doc by doc ID.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        docId: docIdField,
      },
      { required: ["docId"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      doc: docSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_pages",
    description: "List pages in a Coda doc with pagination.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        docId: docIdField,
        limit: paginationLimitField,
        pageToken: pageTokenField,
      },
      { optional: ["limit", "pageToken"] },
    ),
    outputSchema: pageListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_page",
    description:
      "Create a new page in a Coda doc, with optional subtitle, icon, image, parent page, and structured page content.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        docId: docIdField,
        name: s.nonEmptyString("Name of the page."),
        subtitle: s.string("Subtitle of the page."),
        iconName: s.string("Name of the page icon."),
        imageUrl: s.string("URL of the cover image to use."),
        parentPageId: s.string("ID of the parent page for a subpage."),
        pageContent: s.looseObject("Structured page content payload defined by the official Coda API."),
      },
      { optional: ["subtitle", "iconName", "imageUrl", "parentPageId", "pageContent"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      requestId: s.string("Request ID for the asynchronous page creation."),
      id: s.string("ID of the created page."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_tables",
    description: "List tables in a Coda doc with pagination, optional sort order, and optional table-type filtering.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        docId: docIdField,
        limit: paginationLimitField,
        pageToken: pageTokenField,
        sortBy: s.string("Determines how to sort the returned tables."),
        tableTypes: s.stringArray("Table types to include in results."),
      },
      { optional: ["limit", "pageToken", "sortBy", "tableTypes"] },
    ),
    outputSchema: tableListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_table",
    description: "Get details about a specific Coda table or view.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        docId: docIdField,
        tableIdOrName: tableIdOrNameField,
        useUpdatedTableLayouts: s.boolean("Whether to request updated table layout handling."),
      },
      { optional: ["useUpdatedTableLayouts"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      table: tableSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_columns",
    description: "List columns in a Coda table with pagination and optional visibility filtering.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        docId: docIdField,
        tableIdOrName: tableIdOrNameField,
        limit: paginationLimitField,
        pageToken: pageTokenField,
        visibleOnly: s.boolean("Whether to return only visible columns for a base table."),
      },
      { optional: ["limit", "pageToken", "visibleOnly"] },
    ),
    outputSchema: columnListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_rows",
    description:
      "List rows in a Coda table with filtering, sorting, pagination, optional sync tokens, and configurable cell value formats.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        docId: docIdField,
        tableIdOrName: tableIdOrNameField,
        query: s.string("Row query in the official `<column_id_or_name>:<value>` format."),
        sortBy: s.string("Sort order for the returned rows."),
        useColumnNames: s.boolean("Whether returned row values should be keyed by column names instead of IDs."),
        valueFormat: s.stringEnum(["simple", "simpleWithArrays", "rich"], {
          description: "Format for returned cell values.",
        }),
        visibleOnly: s.boolean("Whether to return only visible rows and columns."),
        limit: paginationLimitField,
        pageToken: pageTokenField,
        syncToken: s.string("Sync token from a previous call for incremental reads."),
      },
      {
        optional: [
          "query",
          "sortBy",
          "useColumnNames",
          "valueFormat",
          "visibleOnly",
          "limit",
          "pageToken",
          "syncToken",
        ],
      },
    ),
    outputSchema: rowListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "upsert_rows",
    description: "Insert rows into a Coda table, optionally updating existing rows when key columns are provided.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        docId: docIdField,
        tableIdOrName: tableIdOrNameField,
        disableParsing: s.boolean("Whether Coda should skip automatic value parsing."),
        keyColumns: s.stringArray("Column IDs, URLs, or names used as upsert keys."),
        rows: s.array("Rows to insert or upsert.", rowEditSchema, { minItems: 1 }),
      },
      { optional: ["disableParsing", "keyColumns"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      requestId: s.string("Request ID for the asynchronous row upsert."),
      addedRowIds: s.stringArray("Row IDs that will be added when Coda can determine them upfront."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_mutation_status",
    description: "Get the completion status for an asynchronous Coda mutation using a previously returned request ID.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        requestId: requestIdField,
      },
      { required: ["requestId"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      completed: s.boolean("Whether the mutation has completed."),
      warning: s.string("Warning returned when the mutation completed with caveats."),
    }),
  }),
];
