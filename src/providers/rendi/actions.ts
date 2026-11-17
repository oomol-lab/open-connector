import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const commandId = s.string("The Rendi command ID.", { minLength: 1 });
const fileId = s.string("The Rendi file ID.", { minLength: 1 });

const inputFiles = {
  ...s.record(
    "Input aliases starting with in_ mapped to publicly accessible media URLs. URLs must end in a file name.",
    s.string("A media URL that Rendi can download.", { minLength: 1 }),
  ),
  propertyNames: { pattern: "^in_[A-Za-z0-9_]+$" },
};

const outputFiles = {
  ...s.record(
    "Output aliases starting with out_ mapped to output file names.",
    s.string("An output file name.", { minLength: 1 }),
  ),
  propertyNames: { pattern: "^out_[A-Za-z0-9_]+$" },
};

const privateStorage = s.boolean(
  "Store files privately; requires a paid plan. Request presigned_ttl_seconds when retrieving private files.",
);

const commandOptions = {
  max_command_run_seconds: s.optional(
    s.number("Maximum runtime per FFmpeg command in seconds; Rendi defaults to 300.", {
      exclusiveMinimum: 0,
    }),
  ),
  vcpu_count: s.optional(
    s.integer("Virtual CPUs per command; Rendi defaults to 8, subject to account limits.", {
      minimum: 1,
    }),
  ),
  metadata: s.optional({
    ...s.record(
      "Up to 10 tracking entries; keys and string values have a maximum of 512 characters.",
      s.union(
        [s.string("A text value.", { maxLength: 512 }), s.number("A numeric value."), s.boolean("A boolean value.")],
        { description: "A tracking value." },
      ),
    ),
    maxProperties: 10,
    propertyNames: { maxLength: 512 },
  }),
  is_private: s.optional(privateStorage),
};

const storedFile = s.looseRequiredObject("A stored file with FFprobe metadata and any additional Rendi fields.", {
  file_id: fileId,
  status: s.optional(
    s.nullable(s.string("File status, including QUEUED, DOWNLOADING, DOWNLOADED, UPLOADED, STORED or FAILED.")),
  ),
  storage_url: s.optional(s.nullable(s.string("Download URL; may be signed, unavailable or null for deleted files."))),
  original_file_url: s.optional(s.nullable(s.string("Original file URL or uploaded file name."))),
  is_private: s.optional(s.nullable(s.boolean("Whether this file uses private storage."))),
  is_deleted: s.optional(s.nullable(s.boolean("Whether this file has been deleted."))),
  error_status: s.optional(s.nullable(s.string("File processing error code."))),
  external_error_message: s.optional(s.nullable(s.string("File processing error details."))),
});

const command = s.looseRequiredObject("Command status, outputs, processing metrics and additional Rendi fields.", {
  command_id: commandId,
  status: s.string("Command status: QUEUED, PROCESSING, PREPARED_FFMPEG_COMMAND, SUCCESS or FAILED."),
  output_files: s.optional(
    s.nullable(s.record("Output aliases mapped to stored files; folder outputs use OUTPUT_FOLDER.", storedFile)),
  ),
  original_request: s.optional(s.looseObject("The original command request.")),
  error_status: s.optional(s.nullable(s.string("Command processing error code."))),
  error_message: s.optional(s.nullable(s.string("Command processing error details."))),
});

const pagination = s.requiredObject("Pagination ordered by creation time descending.", {
  limit: s.optional(s.integer("Maximum items to return; Rendi defaults to 1000.", { minimum: 1, maximum: 1000 })),
  offset: s.optional(s.integer("Number of items to skip; Rendi defaults to 0.", { minimum: 0 })),
});

const commandHandle = s.requiredObject("Command lookup parameters.", {
  command_id: commandId,
  presigned_ttl_seconds: s.optional(
    s.integer("Lifetime in seconds for private output download URLs, up to seven days.", {
      minimum: 0,
      maximum: 604800,
    }),
  ),
});

const fileHandle = s.requiredObject("File lookup parameters.", {
  file_id: fileId,
  presigned_ttl_seconds: s.optional(
    s.integer("Lifetime in seconds for a private file download URL, up to seven days.", {
      minimum: 1,
      maximum: 604800,
    }),
  ),
});

const submission = s.looseRequiredObject("The submitted command handle.", {
  command_id: commandId,
});

export const rendiActions: ActionDefinition[] = [
  defineProviderAction("rendi", {
    name: "run_ffmpeg_command",
    asyncLifecycle: { startActionId: "rendi.run_ffmpeg_command", statusActionId: "rendi.get_command" },
    operationType: "write",
    requiredScopes: [],
    description:
      "Submit an FFmpeg command with media URLs or a ZIP URL. Use {{in_alias}} and {{out_alias}} placeholders; omit the ffmpeg executable. Retrieve outputs with get_command.",
    inputSchema: s.object(
      "A single FFmpeg command request.",
      {
        input_files: s.optional(inputFiles),
        input_compressed_folder: s.optional(
          s.string("Public ZIP URL containing all input files; mutually exclusive with input_files.", { minLength: 1 }),
        ),
        output_files: s.union(
          [
            outputFiles,
            s.literal("OUTPUT_FOLDER", { description: "Create a ZIP containing the generated output files." }),
          ],
          { description: "Output file aliases or OUTPUT_FOLDER for a ZIP of dynamic outputs." },
        ),
        ffmpeg_command: s.string("FFmpeg arguments using {{alias}} placeholders, without the ffmpeg executable.", {
          minLength: 1,
        }),
        ...commandOptions,
      },
      { not: { required: ["input_files", "input_compressed_folder"] } },
    ),
    outputSchema: submission,
  }),
  defineProviderAction("rendi", {
    name: "run_chained_ffmpeg_commands",
    asyncLifecycle: { startActionId: "rendi.run_chained_ffmpeg_commands", statusActionId: "rendi.get_command" },
    operationType: "write",
    requiredScopes: [],
    description:
      "Submit up to 10 sequential FFmpeg commands sharing files. A later command can read an earlier output with -i {{out_alias}}. Retrieve outputs with get_command.",
    inputSchema: s.requiredObject("Sequential FFmpeg commands sharing input and output files.", {
      input_files: inputFiles,
      output_files: outputFiles,
      ffmpeg_commands: s.array(
        "Ordered FFmpeg argument strings without the ffmpeg executable.",
        s.string("One FFmpeg command using {{alias}} placeholders.", { minLength: 1 }),
        { minItems: 1, maxItems: 10 },
      ),
      ...commandOptions,
    }),
    outputSchema: submission,
  }),
  defineProviderAction("rendi", {
    name: "get_command",
    asyncLifecycle: { startActionId: "rendi.run_ffmpeg_command", statusActionId: "rendi.get_command" },
    operationType: "read",
    requiredScopes: [],
    description:
      "Get a regular or chained FFmpeg command status and output files, optionally with signed private download URLs.",
    inputSchema: commandHandle,
    outputSchema: command,
  }),
  defineProviderAction("rendi", {
    name: "list_commands",
    operationType: "read",
    requiredScopes: [],
    description:
      "List FFmpeg commands newest first, with status and processing metrics. Use get_command for output files.",
    inputSchema: pagination,
    outputSchema: s.requiredObject("A page of FFmpeg commands.", {
      commands: s.array(
        "Commands in this page.",
        s.looseRequiredObject("Command summary and processing metrics.", {
          command_id: commandId,
          status: s.string("Current command status."),
        }),
      ),
    }),
  }),
  defineProviderAction("rendi", {
    name: "store_file",
    asyncLifecycle: { startActionId: "rendi.store_file", statusActionId: "rendi.get_file" },
    operationType: "write",
    requiredScopes: [],
    description:
      "Ask Rendi to download a media URL, analyze it with FFprobe and store it. Retrieve its metadata and download URL with get_file.",
    inputSchema: s.requiredObject("Media URL and storage options.", {
      file_url: s.string("Publicly accessible media URL for Rendi to download.", { minLength: 1 }),
      is_private: s.optional(privateStorage),
    }),
    outputSchema: s.looseRequiredObject("The submitted file handle.", { file_id: fileId }),
  }),
  defineProviderAction("rendi", {
    name: "get_file",
    asyncLifecycle: { startActionId: "rendi.store_file", statusActionId: "rendi.get_file" },
    operationType: "read",
    requiredScopes: [],
    description:
      "Get a stored file or command output with FFprobe metadata. Deleted files retain metadata with a null storage_url; private files can return signed download URLs.",
    inputSchema: fileHandle,
    outputSchema: storedFile,
  }),
  defineProviderAction("rendi", {
    name: "list_files",
    operationType: "read",
    requiredScopes: [],
    description: "List stored and command output files newest first, excluding deleted and input files.",
    inputSchema: pagination,
    outputSchema: s.requiredObject("A page of stored files.", {
      files: s.array("Files in this page.", storedFile),
    }),
  }),
  defineProviderAction("rendi", {
    name: "delete_file",
    operationType: "destructive",
    requiredScopes: [],
    description: "Delete one stored file from Rendi storage.",
    inputSchema: s.requiredObject("The file to delete.", { file_id: fileId }),
    outputSchema: s.requiredObject("Deletion confirmation.", {
      deleted: s.boolean("Whether deletion succeeded."),
    }),
  }),
  defineProviderAction("rendi", {
    name: "delete_files",
    operationType: "destructive",
    requiredScopes: [],
    description:
      "Delete up to 1000 stored files. Output manifest files cannot be deleted with this endpoint; use delete_command_files for those outputs.",
    inputSchema: s.requiredObject("Files to delete in one request.", {
      file_ids: s.array("File IDs to delete.", fileId, { minItems: 1, maxItems: 1000 }),
    }),
    outputSchema: s.looseRequiredObject("Bulk deletion result.", {
      deleted_file_ids: s.array("File IDs successfully deleted.", fileId),
    }),
  }),
  defineProviderAction("rendi", {
    name: "delete_command_files",
    operationType: "destructive",
    requiredScopes: [],
    description: "Delete all stored output files belonging to one command.",
    inputSchema: s.requiredObject("The command whose outputs should be deleted.", {
      command_id: commandId,
    }),
    outputSchema: s.requiredObject("Deletion confirmation.", {
      deleted: s.boolean("Whether deletion succeeded."),
    }),
  }),
];
