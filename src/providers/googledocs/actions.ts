import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { googledocsReadScopes, googledocsSheetsReadScopes, googledocsWriteScopes } from "./scopes.ts";

const service = "googledocs";

interface GoogledocsActionSource {
  name: GoogledocsActionName;
  readonly operationType: ActionDefinition["operationType"];
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const jsonObject = s.record(true, { description: "A JSON-like object with arbitrary string keys." });
const jsonObjectArray = s.array(jsonObject, { description: "An array of JSON-like objects." });
const nullableString = s.nullable(s.string({ description: "A string value that may be null." }));
const batchResult = s.object(
  {
    documentId: s.string({ description: "The ID of the document that was updated." }),
    replies: jsonObjectArray,
    writeControl: jsonObject,
  },
  { required: ["documentId", "replies"], additionalProperties: true, description: "Google Docs batch update result." },
);
const driveOwner = s.object(
  {
    displayName: nullableString,
    emailAddress: nullableString,
    permissionId: nullableString,
    photoLink: nullableString,
  },
  { additionalProperties: true, description: "Google Drive file owner." },
);
const driveFile = s.object(
  {
    id: s.string({ description: "The ID of the file in Google Drive." }),
    name: s.string({ description: "The name of the file." }),
    mimeType: s.string({ description: "The MIME type of the file." }),
    webViewLink: nullableString,
    createdTime: nullableString,
    modifiedTime: nullableString,
    driveId: nullableString,
    parents: s.array(s.string(), { description: "The IDs of the parent folders that contain the file." }),
    owners: s.array(driveOwner, { description: "The owners of the file." }),
    shared: s.boolean({ description: "Whether the file has been shared with others." }),
    starred: s.boolean({ description: "Whether the user has starred the file." }),
    trashed: s.boolean({ description: "Whether the file has been trashed." }),
  },
  { required: ["id", "name", "mimeType"], additionalProperties: true, description: "Google Drive file metadata." },
);
const documentSummary = s.object(
  {
    documentId: s.string({ description: "The ID of the Google Docs document." }),
    title: s.string({ description: "The title of the document." }),
    revisionId: nullableString,
  },
  { required: ["documentId", "title"], additionalProperties: true, description: "Google Docs document summary." },
);
const documentDetail = s.object(
  {
    documentId: s.string({ description: "The ID of the Google Docs document." }),
    title: s.string({ description: "The title of the document." }),
    revisionId: nullableString,
    body: jsonObject,
    headers: jsonObject,
    footers: jsonObject,
    footnotes: jsonObject,
    tabs: jsonObjectArray,
    documentStyle: jsonObject,
    namedRanges: jsonObject,
    inlineObjects: jsonObject,
    lists: jsonObject,
  },
  { required: ["documentId", "title"], additionalProperties: true, description: "Google Docs document detail." },
);
const plaintextOutput = output({
  documentId: s.string({ description: "The ID of the Google Docs document." }),
  title: nullableString,
  text: s.string({ description: "The plain-text rendering of the document content." }),
});
const exportPdfOutput = output({
  fileId: s.string({ description: "The ID of the exported file in Google Drive." }),
  filename: s.string({ description: "The filename used for the exported PDF." }),
  mimeType: s.literal("application/pdf", { description: "The MIME type of the exported file." }),
  dataBase64: s.string({ description: "The Base64-encoded binary content of the exported PDF." }),
  sizeBytes: s.integer({ description: "The size of the exported PDF in bytes." }),
});
const spreadsheetChartsOutput = output({
  spreadsheetId: s.string({ description: "The ID of the Google Sheets spreadsheet." }),
  title: nullableString,
  sheets: s.array(jsonObject, { description: "The sheets in the spreadsheet, each with their chart metadata." }),
});
const searchDocumentsOutput = output({
  documents: s.array(driveFile, { description: "The list of matching Google Docs files." }),
  nextPageToken: nullableString,
});

const actions: GoogledocsActionSource[] = [
  write(
    "copy_document",
    "Copy an existing Google Docs document through Google Drive.",
    input(
      {
        document_id: str("The ID of the Google Docs document to copy."),
        title: str("The title for the copied document."),
        include_shared_drives: bool("Whether to include shared drives when locating the source document."),
      },
      ["document_id"],
    ),
    driveFile,
  ),
  write(
    "create_document",
    "Create a Google Docs document and optionally insert initial text at the beginning.",
    input(
      {
        title: str("The title of the new document."),
        text: str("Initial text to insert at the beginning of the document."),
      },
      ["title"],
    ),
    output({
      documentId: str("The ID of the Google Docs document."),
      title: str("The title of the document."),
      revisionId: nullableString,
      insertedTextLength: s.integer({ description: "The number of characters inserted as initial text." }),
    }),
  ),
  write(
    "create_document2",
    "Create a blank Google Docs document.",
    input({ title: str("The title of the new document.") }, ["title"]),
    documentSummary,
  ),
  write(
    "create_footer",
    "Create a footer in a Google Docs document.",
    input(
      {
        document_id: str("The ID of the Google Docs document."),
        type: str("The type of footer to create."),
        section_break_location: jsonObject,
      },
      ["document_id", "type"],
    ),
    batchResult,
  ),
  write(
    "create_footnote",
    "Create a footnote in a Google Docs document.",
    input(
      {
        documentId: str("The ID of the Google Docs document."),
        location: jsonObject,
        endOfSegmentLocation: jsonObject,
      },
      ["documentId"],
    ),
    batchResult,
  ),
  write(
    "create_header",
    "Create a header in a Google Docs document and optionally insert initial text.",
    input(
      {
        documentId: str("The ID of the Google Docs document."),
        type: str("The type of header to create."),
        text: str("Initial text to insert into the header."),
        sectionBreakLocation: jsonObject,
      },
      ["documentId"],
    ),
    batchResult,
  ),
  write(
    "create_named_range",
    "Create a named range over a specific span in a Google Docs document.",
    input(
      {
        documentId: str("The ID of the Google Docs document."),
        name: s.string({ minLength: 1, maxLength: 256, description: "The name of the named range." }),
        rangeStartIndex: s.integer({ description: "The zero-based start index of the range." }),
        rangeEndIndex: s.integer({ description: "The zero-based end index of the range." }),
        rangeSegmentId: str("The ID of the segment the range belongs to."),
      },
      ["documentId", "name", "rangeStartIndex", "rangeEndIndex"],
    ),
    batchResult,
  ),
  write(
    "create_paragraph_bullets",
    "Add bullets to paragraphs within a specified range in a Google Docs document.",
    input(
      {
        document_id: str("The ID of the Google Docs document."),
        createParagraphBullets: jsonObject,
      },
      ["document_id", "createParagraphBullets"],
    ),
    batchResult,
  ),
  destructive(
    "delete_content_range",
    "Delete a content range from a Google Docs document.",
    input(
      {
        document_id: str("The ID of the Google Docs document."),
        range: jsonObject,
      },
      ["document_id", "range"],
    ),
    batchResult,
  ),
  destructive(
    "delete_footer",
    "Delete a footer from a Google Docs document.",
    input(
      {
        document_id: str("The ID of the Google Docs document."),
        footer_id: str("The ID of the footer to delete."),
        tab_id: str("The ID of the tab containing the footer."),
      },
      ["document_id", "footer_id"],
    ),
    batchResult,
  ),
  destructive(
    "delete_header",
    "Delete a header from a Google Docs document.",
    input(
      {
        document_id: str("The ID of the Google Docs document."),
        header_id: str("The ID of the header to delete."),
        tab_id: str("The ID of the tab containing the header."),
      },
      ["document_id", "header_id"],
    ),
    batchResult,
  ),
  destructive(
    "delete_named_range",
    "Delete a named range from a Google Docs document.",
    input(
      {
        document_id: str("The ID of the Google Docs document."),
        deleteNamedRange: jsonObject,
      },
      ["document_id", "deleteNamedRange"],
    ),
    batchResult,
  ),
  destructive(
    "delete_paragraph_bullets",
    "Remove bullets from paragraphs within a specified range in a Google Docs document.",
    input(
      {
        document_id: str("The ID of the Google Docs document."),
        range: jsonObject,
        tab_id: str("The ID of the tab containing the range."),
      },
      ["document_id", "range"],
    ),
    batchResult,
  ),
  destructive(
    "delete_table_column",
    "Delete one or more table columns from a Google Docs document.",
    input(
      {
        document_id: str("The ID of the Google Docs document."),
        requests: s.array(jsonObject, { minItems: 1, description: "DeleteTableColumnRequest objects." }),
      },
      ["document_id", "requests"],
    ),
    batchResult,
  ),
  destructive(
    "delete_table_row",
    "Delete a table row from a Google Docs document.",
    input(
      {
        documentId: str("The ID of the Google Docs document."),
        tableCellLocation: jsonObject,
      },
      ["documentId", "tableCellLocation"],
    ),
    batchResult,
  ),
  read(
    "export_document_as_pdf",
    "Export a Google Docs file as a PDF through Google Drive.",
    input(
      {
        file_id: str("The ID of the Google Docs file to export."),
        filename: str("The filename for the exported PDF."),
      },
      ["file_id"],
    ),
    exportPdfOutput,
  ),
  read(
    "get_document_by_id",
    "Retrieve a Google Docs document by ID.",
    input(
      {
        id: str("The ID of the Google Docs document to retrieve."),
        include_tabs_content: bool("Whether to populate the tabs field in the response."),
      },
      ["id"],
    ),
    documentDetail,
  ),
  read(
    "get_document_plaintext",
    "Retrieve a Google Docs document and render it as best-effort plain text.",
    input(
      {
        document_id: str("The ID of the Google Docs document."),
        include_tables: bool("Whether to include table content."),
        include_footers: bool("Whether to include footer content."),
        include_headers: bool("Whether to include header content."),
        include_footnotes: bool("Whether to include footnote content."),
        include_tabs_content: bool("Whether to include content from all tabs."),
        table_row_delimiter: str("The delimiter to insert between table rows."),
        table_cell_delimiter: str("The delimiter to insert between table cells."),
      },
      ["document_id"],
    ),
    plaintextOutput,
  ),
  write(
    "insert_inline_image",
    "Insert an inline image from a URI at a specified location.",
    input(
      {
        documentId: str("The ID of the Google Docs document."),
        uri: s.url("The publicly accessible URI of the image to insert."),
        location: jsonObject,
        objectSize: jsonObject,
      },
      ["documentId", "uri", "location"],
    ),
    batchResult,
  ),
  write(
    "insert_page_break",
    "Insert a page break at a specified location.",
    input(
      {
        documentId: str("The ID of the Google Docs document."),
        insertPageBreak: jsonObject,
      },
      ["documentId", "insertPageBreak"],
    ),
    batchResult,
  ),
  write(
    "insert_table_action",
    "Insert a table at a specific index or at the end of a segment.",
    input(
      {
        documentId: str("The ID of the Google Docs document."),
        rows: s.integer({ exclusiveMinimum: 0, description: "The number of rows in the table to insert." }),
        columns: s.integer({ exclusiveMinimum: 0, description: "The number of columns in the table to insert." }),
        index: s.integer({ description: "The zero-based index at which to insert the table." }),
        segmentId: str("The segment ID."),
        tabId: str("The tab ID."),
        insertAtEndOfSegment: bool("Whether to insert at the end of the segment."),
      },
      ["documentId", "rows", "columns"],
    ),
    batchResult,
  ),
  write(
    "insert_table_column",
    "Insert one or more table columns at a specified location.",
    input(
      {
        document_id: str("The ID of the Google Docs document."),
        requests: s.array(jsonObject, { minItems: 1, description: "InsertTableColumnRequest objects." }),
      },
      ["document_id", "requests"],
    ),
    batchResult,
  ),
  write(
    "insert_text_action",
    "Insert text at a specific index or append it to the end.",
    input(
      {
        document_id: str("The ID of the Google Docs document."),
        text_to_insert: str("The text to insert."),
        append_to_end: bool("Whether to append the text to the end."),
        insertion_index: s.integer({ description: "The zero-based index at which to insert the text." }),
        segment_id: str("The segment ID."),
      },
      ["document_id"],
    ),
    batchResult,
  ),
  sheetsRead(
    "list_spreadsheet_charts",
    "List chart metadata from a Google Sheets spreadsheet.",
    input(
      {
        spreadsheet_id: str("The ID of the Google Sheets spreadsheet."),
      },
      ["spreadsheet_id"],
    ),
    spreadsheetChartsOutput,
  ),
  destructive(
    "replace_all_text",
    "Replace all matching text in a Google Docs document.",
    input(
      {
        document_id: str("The ID of the Google Docs document."),
        find_text: str("The text or pattern to search for."),
        replace_text: str("The replacement text."),
        match_case: bool("Whether the search should be case-sensitive."),
        search_by_regex: bool("Whether to treat find_text as a regular expression."),
        tab_ids: s.array(s.string(), { description: "The IDs of specific tabs to search." }),
      },
      ["document_id", "find_text", "replace_text"],
    ),
    batchResult,
  ),
  destructive(
    "replace_image",
    "Replace an existing image in a Google Docs document with a new image from a URI.",
    input(
      {
        document_id: str("The ID of the Google Docs document."),
        replace_image: jsonObject,
      },
      ["document_id", "replace_image"],
    ),
    batchResult,
  ),
  read(
    "search_documents",
    "Search Google Docs files with Google Drive filters.",
    input({
      query: str("A Google Drive query string or full-text search string."),
      order_by: str("A comma-separated list of fields to sort results by."),
      page_token: str("A page token from a previous search response."),
      max_results: s.integer({ minimum: 1, maximum: 100, description: "The maximum number of files to return." }),
      starred_only: bool("Whether to return only starred files."),
      created_after: s.dateTime("Only files created after this time are returned."),
      modified_after: s.dateTime("Only files modified after this time are returned."),
      shared_with_me: bool("Whether to return only files shared directly with the user."),
      include_trashed: bool("Whether to include trashed files."),
      include_shared_drives: bool("Whether to include files from shared drives."),
    }),
    searchDocumentsOutput,
  ),
  destructive(
    "unmerge_table_cells",
    "Unmerge previously merged table cells in a Google Docs document.",
    input(
      {
        documentId: str("The ID of the Google Docs document."),
        tableRange: jsonObject,
      },
      ["documentId", "tableRange"],
    ),
    batchResult,
  ),
  write(
    "update_document_batch",
    "Apply raw Docs batchUpdate requests to a Google Docs document.",
    input(
      {
        document_id: str("The ID of the Google Docs document."),
        requests: s.array(jsonObject, { minItems: 1, description: "Docs API Request objects." }),
        write_control: jsonObject,
      },
      ["document_id", "requests"],
    ),
    batchResult,
  ),
  write(
    "update_document_style",
    "Update global document style settings.",
    input(
      {
        document_id: str("The ID of the Google Docs document."),
        document_style: jsonObject,
        fields: str("A field mask specifying which style properties to update."),
        tab_id: str("The ID of the tab whose document style should be updated."),
      },
      ["document_id", "document_style"],
    ),
    batchResult,
  ),
  write(
    "update_existing_document",
    "Apply one or more programmatic edits to an existing Google Docs document.",
    input(
      {
        document_id: str("The ID of the Google Docs document."),
        editDocs: s.array(jsonObject, { minItems: 1, description: "Docs API Request objects describing the edits." }),
      },
      ["document_id", "editDocs"],
    ),
    batchResult,
  ),
  write(
    "update_table_row_style",
    "Update the style of a table row in a Google Docs document.",
    input(
      {
        documentId: str("The ID of the Google Docs document."),
        updateTableRowStyle: jsonObject,
      },
      ["documentId", "updateTableRowStyle"],
    ),
    batchResult,
  ),
];

export type GoogledocsActionName =
  | "copy_document"
  | "create_document"
  | "create_document2"
  | "create_footer"
  | "create_footnote"
  | "create_header"
  | "create_named_range"
  | "create_paragraph_bullets"
  | "delete_content_range"
  | "delete_footer"
  | "delete_header"
  | "delete_named_range"
  | "delete_paragraph_bullets"
  | "delete_table_column"
  | "delete_table_row"
  | "export_document_as_pdf"
  | "get_document_by_id"
  | "get_document_plaintext"
  | "insert_inline_image"
  | "insert_page_break"
  | "insert_table_action"
  | "insert_table_column"
  | "insert_text_action"
  | "list_spreadsheet_charts"
  | "replace_all_text"
  | "replace_image"
  | "search_documents"
  | "unmerge_table_cells"
  | "update_document_batch"
  | "update_document_style"
  | "update_existing_document"
  | "update_table_row_style";

export const googledocsActions: ActionDefinition[] = actions.map((source) =>
  defineProviderAction(service, {
    name: source.name,
    operationType: source.operationType,
    description: source.description,
    requiredScopes: source.requiredScopes,
    providerPermissions: source.requiredScopes,
    inputSchema: source.inputSchema,
    outputSchema: source.outputSchema,
  }),
);

function read(
  name: GoogledocsActionName,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): GoogledocsActionSource {
  return { name, operationType: "read", description, requiredScopes: googledocsReadScopes, inputSchema, outputSchema };
}

function write(
  name: GoogledocsActionName,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): GoogledocsActionSource {
  return {
    name,
    operationType: "write",
    description,
    requiredScopes: googledocsWriteScopes,
    inputSchema,
    outputSchema,
  };
}

function destructive(
  name: GoogledocsActionName,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): GoogledocsActionSource {
  return {
    name,
    operationType: "destructive",
    description,
    requiredScopes: googledocsWriteScopes,
    inputSchema,
    outputSchema,
  };
}

function sheetsRead(
  name: GoogledocsActionName,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): GoogledocsActionSource {
  return {
    name,
    operationType: "read",
    description,
    requiredScopes: googledocsSheetsReadScopes,
    inputSchema,
    outputSchema,
  };
}

function input(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.actionInput(properties, required, "The input payload for this action.");
}

function output(properties: Record<string, JsonSchema>): JsonSchema {
  return s.object(properties, {
    required: Object.keys(properties),
    additionalProperties: true,
    description: "Google Docs action output.",
  });
}

function str(description: string): JsonSchema {
  return s.string({ description });
}

function bool(description: string): JsonSchema {
  return s.boolean({ description });
}
