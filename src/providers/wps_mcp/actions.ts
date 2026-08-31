import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wps_mcp";

const fileTypeSchema = s.stringEnum("The kind of file system entry to include.", ["file", "folder", "shortcut"]);

const orderSchema = s.stringEnum("The result sort direction.", ["asc", "desc"]);

const listFilterTypeSchema = s.object(
  "An optional file system entry type filter.",
  { type: fileTypeSchema },
  { optional: ["type"] },
);

const fileSelectorProperties = {
  file_id: s.nonEmptyString("A WPS file ID used to select the document."),
  link_id: s.nonEmptyString("A WPS share link ID used to select the document."),
  url: s.url("A WPS document URL used to select the document."),
};

const dynamicToolOutputSchema = s.unknown("The normalized result returned by the current WPS MCP tool.");

const toolAnnotationsSchema = s.looseObject("MCP hints supplied by WPS about a tool's behavior.", {
  title: s.optional(s.string("A human-readable title for the tool.")),
  readOnlyHint: s.optional(s.boolean("Whether the tool is expected not to modify data.")),
  destructiveHint: s.optional(s.boolean("Whether the tool may perform destructive operations.")),
  idempotentHint: s.optional(
    s.boolean("Whether repeated calls with the same arguments are expected to be idempotent."),
  ),
  openWorldHint: s.optional(s.boolean("Whether the tool may interact with entities outside WPS.")),
});

const mcpToolSummarySchema = s.object(
  "A tool currently exposed by the connected WPS MCP account.",
  {
    name: s.nonEmptyString("The exact WPS MCP tool name to pass to call_tool."),
    description: s.string("The current tool description supplied by WPS MCP."),
    annotations: toolAnnotationsSchema,
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by WPS MCP."),
  },
  { optional: ["description", "annotations"] },
);

export const wpsMcpActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_files",
    description:
      "Search WPS cloud documents and folders across drives by file name, content, creator, location, type, or time.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for searching WPS cloud documents.",
      {
        keyword: s.string("The search keyword."),
        type: s.stringEnum("The search dimension.", ["file_name", "content", "all"]),
        file_type: fileTypeSchema,
        drive_ids: s.array("Drive IDs to search.", s.nonEmptyString("A WPS drive ID.")),
        parent_ids: s.array("Folder IDs that constrain the search.", s.nonEmptyString("A WPS folder ID.")),
        file_exts: s.array("File extensions to include without leading dots.", s.nonEmptyString("A file extension.")),
        exclude_file_exts: s.array(
          "File extensions to exclude without leading dots.",
          s.nonEmptyString("A file extension."),
        ),
        file_ext_groups: s.array(
          "WPS file extension groups to include.",
          s.nonEmptyString("A WPS file extension group."),
        ),
        channels: s.array("WPS content channels to include.", s.nonEmptyString("A WPS content channel.")),
        exclude_channels: s.array("WPS content channels to exclude.", s.nonEmptyString("A WPS content channel.")),
        device_ids: s.array("Device IDs associated with included files.", s.nonEmptyString("A WPS device ID.")),
        creator_ids: s.array("WPS user IDs whose files should be included.", s.nonEmptyString("A WPS user ID.")),
        modifier_ids: s.array("WPS user IDs that last modified included files.", s.nonEmptyString("A WPS user ID.")),
        receiver_ids: s.array("WPS user IDs that received included files.", s.nonEmptyString("A WPS user ID.")),
        sharer_ids: s.array("WPS user IDs that shared included files.", s.nonEmptyString("A WPS user ID.")),
        scope: s.array("WPS search scopes such as all or share_by_me.", s.nonEmptyString("A WPS search scope.")),
        filter_user_id: s.number("The WPS creator or sharer filter expected by the MCP tool."),
        search_operator_name: s.boolean("Whether creator and sharer names should participate in the search."),
        start_time: s.number("The minimum creation or modification time expected by WPS."),
        end_time: s.number("The maximum creation or modification time expected by WPS."),
        time_type: s.stringEnum("The timestamp field used by the time range.", ["ctime", "mtime", "otime", "stime"]),
        order_by: s.stringEnum("The field used to sort search results.", ["ctime", "mtime"]),
        order: orderSchema,
        page_size: s.number("The page size from 0 to 500. WPS treats zero as 50.", {
          minimum: 0,
          maximum: 500,
        }),
        page_token: s.string("The pagination token returned by the previous search."),
        with_drive: s.boolean("Whether each result should include drive details."),
        with_link: s.boolean("Whether each result should include share link details."),
        with_permission: s.boolean("Whether each result should include operation permissions."),
        with_total: s.boolean("Whether the response should include the total result count."),
      },
      {
        optional: [
          "keyword",
          "type",
          "file_type",
          "drive_ids",
          "parent_ids",
          "file_exts",
          "exclude_file_exts",
          "file_ext_groups",
          "channels",
          "exclude_channels",
          "device_ids",
          "creator_ids",
          "modifier_ids",
          "receiver_ids",
          "sharer_ids",
          "scope",
          "filter_user_id",
          "search_operator_name",
          "start_time",
          "end_time",
          "time_type",
          "order_by",
          "order",
          "page_size",
          "page_token",
          "with_drive",
          "with_link",
          "with_permission",
          "with_total",
        ],
      },
    ),
    outputSchema: dynamicToolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_my_files",
    description:
      "List entries in the root of the connected user's WPS cloud documents with filtering, sorting, and pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for the WPS cloud document root.",
      {
        filter_exts: s.string("Comma-separated lowercase file extensions to include."),
        filter_type: listFilterTypeSchema,
        order: orderSchema,
        order_by: s.stringEnum("The field used to sort entries.", ["ctime", "mtime", "dtime", "fname", "fsize"]),
        page_size: s.number("The page size from 1 to 500.", { minimum: 1, maximum: 500 }),
        page_token: s.string("The pagination token returned by the previous request."),
        with_ext_attrs: s.boolean("Whether each entry should include extended attributes."),
        with_permission: s.boolean("Whether each entry should include operation permissions."),
      },
      {
        optional: [
          "filter_exts",
          "filter_type",
          "order",
          "order_by",
          "page_size",
          "page_token",
          "with_ext_attrs",
          "with_permission",
        ],
      },
    ),
    outputSchema: dynamicToolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_files",
    description: "List entries in a known WPS drive folder with filtering, sorting, and pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "The WPS drive folder and optional listing controls.",
      {
        drive_id: s.nonEmptyString("The WPS drive ID."),
        parent_id: s.nonEmptyString("The folder ID. Use 0 for the drive root."),
        filter_exts: s.string("Comma-separated lowercase file extensions to include."),
        filter_type: listFilterTypeSchema,
        order: orderSchema,
        order_by: s.stringEnum("The field used to sort entries.", ["ctime", "mtime", "dtime", "fname", "fsize"]),
        page_size: s.number("The page size from 1 to 500.", { minimum: 1, maximum: 500 }),
        page_token: s.string("The pagination token returned by the previous request."),
        with_ext_attrs: s.boolean("Whether each entry should include extended attributes."),
        with_permission: s.boolean("Whether each entry should include operation permissions."),
      },
      {
        optional: [
          "filter_exts",
          "filter_type",
          "order",
          "order_by",
          "page_size",
          "page_token",
          "with_ext_attrs",
          "with_permission",
        ],
      },
    ),
    outputSchema: dynamicToolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_file_info",
    description: "Get metadata, drive details, extended attributes, or permissions for a WPS file.",
    requiredScopes: [],
    inputSchema: {
      ...s.object(
        "At least one WPS file selector and optional metadata expansions.",
        {
          ...fileSelectorProperties,
          with_drive: s.boolean("Whether the response should include the containing drive."),
          with_ext_attrs: s.boolean("Whether the response should include extended attributes."),
          with_permission: s.boolean("Whether the response should include operation permissions."),
        },
        {
          optional: ["file_id", "link_id", "url", "with_drive", "with_ext_attrs", "with_permission"],
        },
      ),
      anyOf: [{ required: ["file_id"] }, { required: ["link_id"] }, { required: ["url"] }],
    },
    outputSchema: dynamicToolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "read_file",
    description:
      "Read a WPS cloud document as Markdown, plain text, structured KDC data, or spreadsheet cells according to its format.",
    requiredScopes: [],
    inputSchema: {
      ...s.object(
        "At least one WPS file selector and format-specific reading options. When several selectors are supplied, WPS prioritizes url, then link_id, then file_id.",
        {
          ...fileSelectorProperties,
          format: s.stringEnum("The output format for supported text documents.", ["markdown", "plain", "kdc"]),
          enable_upload_medias: s.boolean(
            "Whether extracted media should be uploaded and returned as temporary download URLs.",
          ),
          sheet_id: s.number("The numeric spreadsheet sheet ID. It takes priority over sheet_name."),
          sheet_name: s.string("The spreadsheet sheet name."),
          sheet_range: s.object(
            "A zero-based inclusive spreadsheet cell range.",
            {
              row_from: s.number("The zero-based first row."),
              row_to: s.number("The zero-based last row, inclusive."),
              col_from: s.number("The zero-based first column."),
              col_to: s.number("The zero-based last column, inclusive."),
            },
            { optional: ["row_from", "row_to", "col_from", "col_to"] },
          ),
          task_id: s.string("The task ID returned by a previous incomplete read request."),
        },
        {
          optional: [
            "file_id",
            "link_id",
            "url",
            "format",
            "enable_upload_medias",
            "sheet_id",
            "sheet_name",
            "sheet_range",
            "task_id",
          ],
        },
      ),
      anyOf: [{ required: ["file_id"] }, { required: ["link_id"] }, { required: ["url"] }],
    },
    outputSchema: dynamicToolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_file_with_content",
    description: "Create a WPS document, PDF, spreadsheet, or smart sheet and populate it with JSON-friendly content.",
    requiredScopes: [],
    inputSchema: s.object(
      "The new WPS file name, type, location, and format-specific content.",
      {
        name: s.nonEmptyString("The complete file name, such as Weekly Report.docx."),
        file_extension: s.stringEnum("The file extension without a leading dot.", [
          "otl",
          "docx",
          "pdf",
          "xls",
          "xlsx",
          "ksheet",
          "dbt",
        ]),
        content: s.string("UTF-8 Markdown content for OTL, DOCX, or PDF files."),
        drive_id: s.nonEmptyString("The destination WPS drive ID. Defaults to the personal drive."),
        parent_id: s.nonEmptyString("The destination folder ID. Defaults to the root folder 0."),
        rangeData: s.array(
          "Spreadsheet cell ranges to populate.",
          s.looseObject("A WPS spreadsheet range with coordinates and a formula or value."),
        ),
        fields: s.array(
          "Smart sheet field definitions.",
          s.looseObject("A smart sheet field containing at least a name and type."),
        ),
        records: s.array("Smart sheet records.", s.looseObject("A smart sheet record containing a fields object.")),
        sheet_name: s.string("The destination spreadsheet or smart sheet name."),
      },
      {
        optional: ["content", "drive_id", "parent_id", "rangeData", "fields", "records", "sheet_name"],
      },
    ),
    outputSchema: dynamicToolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_folder",
    description: "Create a folder in a known WPS drive and parent folder.",
    requiredScopes: [],
    inputSchema: s.object(
      "The destination and name for a new WPS folder.",
      {
        drive_id: s.nonEmptyString("The destination WPS drive ID."),
        parent_id: s.nonEmptyString("The parent folder ID. Use 0 for the drive root."),
        name: s.nonEmptyString("The folder name without a file extension."),
        on_name_conflict: s.stringEnum("How WPS should handle an existing name.", ["fail", "rename"]),
        parent_path: s.array(
          "Relative folder path segments that WPS should create when missing.",
          s.nonEmptyString("A folder name in the relative path."),
        ),
      },
      { optional: ["on_name_conflict", "parent_path"] },
    ),
    outputSchema: dynamicToolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tools",
    description:
      "Discover the current WPS document, spreadsheet, presentation, PDF, and workspace MCP tools with their live input schemas.",
    requiredScopes: [],
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.object("The current WPS MCP tool catalog.", {
      tools: s.array("Tools currently exposed to the connected WPS MCP account.", mcpToolSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "call_tool",
    description:
      "Call a current WPS MCP tool with JSON arguments after checking its live schema and behavior annotations.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for invoking one current WPS MCP tool.",
      {
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: s.looseObject("JSON arguments matching the inputSchema returned for the selected tool."),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: s.object("The normalized result returned by the WPS MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
];
