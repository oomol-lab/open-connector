import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gigasheet";

const rawObjectSchema = s.looseObject("An arbitrary JSON object returned by Gigasheet.");
const integerArraySchema = s.array("Integer values returned by Gigasheet.", s.integer("One integer value."));
const fileStatusSchema = s.stringEnum("The dataset processing status reported by Gigasheet.", [
  "uploading",
  "loading",
  "processing",
  "processed",
  "error",
]);

const columnInfoSchema = s.looseObject(
  {
    currency: s.looseObject(
      {
        code: s.string("The ISO 4217 currency code for the column."),
      },
      { description: "Currency metadata for the column." },
    ),
    formula: s.looseObject(
      {
        literal: s.string("The original formula expression stored on the column."),
        resolved: s.string("The resolved formula expression returned by Gigasheet."),
      },
      { description: "Formula metadata for the column." },
    ),
  },
  { description: "Column metadata returned by Gigasheet." },
);

const metadataSchema = s.looseObject(
  {
    FileUuid: s.string("The dataset handle returned by Gigasheet."),
    FileName: s.string("The dataset or file name."),
    FileRows: s.integer("The number of rows in the dataset."),
    FileSize: s.string("The file size string returned by Gigasheet."),
    Status: fileStatusSchema,
    StatusDetails: rawObjectSchema,
    DetailedStatus: s.string("The legacy detailed status string returned by Gigasheet."),
    Headers: s.array("The dataset headers returned by Gigasheet.", s.string("One column header.")),
    FieldsTypes: s.array("The detected data types for dataset columns.", s.string("One column data type.")),
    HeaderToColumnMapping: rawObjectSchema,
    ColumnInfo: s.record(columnInfoSchema, {
      description: "Column metadata keyed by Gigasheet column identifier.",
    }),
    Owner: s.string("The owner identifier for the file."),
    ParentDirectory: s.string("The parent directory handle."),
    IsDirectory: s.boolean("Whether the entry is a directory."),
    CreatedAt: s.string("When the dataset was created."),
    LastUpdated: s.string("When the entry was last updated."),
    LastAccessed: s.string("When the entry was last accessed."),
    DeletedAt: s.string("When the dataset was most recently marked as deleted."),
    Note: s.string("The note stored on the file."),
    ParserUsed: s.string("The parser used to process the dataset."),
    Source: s.string("The source type recorded for the dataset."),
    Type: s.integer("The numeric file type code returned by Gigasheet."),
    Deleting: s.integer("The dataset deletion state code."),
    ClickhouseNode: s.integer("The internal ClickHouse node identifier."),
    OperationStatus: rawObjectSchema,
    Comments: rawObjectSchema,
    Details: rawObjectSchema,
    ThreatDetectionStatus: rawObjectSchema,
    ExampleAnalyses: s.array("Example analyses suggested for the dataset.", s.string("One example analysis prompt.")),
  },
  { description: "Dataset metadata returned by Gigasheet." },
);

const restrictedEntrySchema = s.looseObject(
  {
    permissions: integerArraySchema,
    user_id: s.string("The user identifier for the restricted share entry."),
  },
  { description: "A restricted share entry returned by Gigasheet." },
);

const sharedSchema = s.looseObject(
  {
    organization: integerArraySchema,
    public: integerArraySchema,
    restricted: s.array("Restricted share entries returned by Gigasheet.", restrictedEntrySchema),
  },
  { description: "Sharing metadata returned for one library entry." },
);

const libraryEntrySchema = s.looseObject(
  {
    metadata: metadataSchema,
    permissions: integerArraySchema,
    shared: sharedSchema,
    within_quota: s.boolean("Whether the file currently fits within the account quota."),
  },
  { description: "One library entry returned by Gigasheet." },
);

const libraryEntriesOutputSchema = s.actionOutput(
  {
    entries: s.array("The library entries returned by Gigasheet.", libraryEntrySchema),
  },
  "A list of library entries returned by Gigasheet.",
);

const listExportsInputSchema = s.object(
  "Optional pagination parameters for listing Gigasheet exports.",
  {
    page: s.integer("The zero-based page number to request from Gigasheet.", { minimum: 0 }),
    pageSize: s.positiveInteger("The number of export entries to return per page."),
  },
  { optional: ["page", "pageSize"] },
);

const searchLibraryInputSchema = s.object(
  "The search payload for querying Gigasheet library metadata.",
  {
    searchTerm: s.nonEmptyString("The search text used to match file metadata in Gigasheet."),
    fields: s.stringArray(
      "The metadata fields to search. When omitted, Gigasheet searches owner, file_name, headers, and note.",
      { minItems: 1, itemDescription: "One file metadata field name to include in the search." },
    ),
  },
  { optional: ["fields"] },
);

const handleInputSchema = s.object("The input payload for a Gigasheet file or folder handle.", {
  handle: s.nonEmptyString("The file or folder handle."),
});

const enrichmentCreditsSchema = s.looseObject(
  {
    Limit: s.integer("The total enrichment credit limit."),
    Used: s.integer("The number of enrichment credits already used."),
  },
  { description: "The current enrichment credit usage returned by Gigasheet." },
);

function emptyInput(description: string): JsonSchema {
  return s.object(description, {});
}

export const gigasheetActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_home_files",
    description: "List the suggested recent files shown on the Gigasheet home page.",
    requiredScopes: [],
    inputSchema: emptyInput("The input payload for listing Gigasheet home files."),
    outputSchema: libraryEntriesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_exports",
    description: "List exports owned by the current Gigasheet user across all locations.",
    requiredScopes: [],
    inputSchema: listExportsInputSchema,
    outputSchema: libraryEntriesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_library",
    description: "Search Gigasheet library metadata without reading file contents.",
    requiredScopes: [],
    inputSchema: searchLibraryInputSchema,
    outputSchema: libraryEntriesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_library_path",
    description: "Return the parent directory chain for one Gigasheet file or folder handle.",
    requiredScopes: [],
    inputSchema: handleInputSchema,
    outputSchema: s.actionOutput(
      {
        path: s.array("The ordered path entries returned by Gigasheet.", libraryEntrySchema),
      },
      "The resolved library path returned by Gigasheet.",
    ),
  }),
  defineProviderAction(service, {
    name: "describe_dataset",
    description: "Describe one Gigasheet dataset, including status and file metadata.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for describing a Gigasheet dataset.", {
      handle: s.nonEmptyString("The dataset handle to describe."),
    }),
    outputSchema: s.actionOutput(
      {
        metadata: metadataSchema,
      },
      "The dataset metadata response returned by Gigasheet.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_space_used",
    description: "Get the current storage usage reported for the authenticated Gigasheet user.",
    requiredScopes: [],
    inputSchema: emptyInput("The input payload for retrieving Gigasheet storage usage."),
    outputSchema: s.actionOutput(
      {
        space_used: s.integer("The amount of storage used by the current Gigasheet user."),
      },
      "The storage usage returned by Gigasheet.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_enrichment_credits",
    description: "Get the current enrichment credit usage for the authenticated Gigasheet user.",
    requiredScopes: [],
    inputSchema: emptyInput("The input payload for retrieving Gigasheet enrichment credits."),
    outputSchema: s.actionOutput(
      {
        credits: enrichmentCreditsSchema,
      },
      "The enrichment credit response returned by Gigasheet.",
    ),
  }),
];
