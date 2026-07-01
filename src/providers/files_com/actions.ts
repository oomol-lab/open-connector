import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "files_com";

const pathSchema = s.string("The Files.com remote path, such as folder/file.txt.", { minLength: 1 });
const pathInputSchema = s.requiredObject("Input for a Files.com path operation.", {
  path: pathSchema,
});
const rawObjectSchema = s.record(s.unknown("A raw Files.com property value."), {
  description: "The raw Files.com object returned by the API.",
});
const rawListResponseSchema = s.anyOf("The raw Files.com list response.", [
  s.array("The raw Files.com list array response.", rawObjectSchema),
  rawObjectSchema,
]);
const fileEntrySchema = s.looseObject(
  {
    path: s.string("The full remote path for the Files.com entry."),
    display_name: s.string("The display name of the Files.com entry."),
    type: s.string("The Files.com entry type, such as file or directory."),
    size: s.number("The entry size in bytes when returned by Files.com."),
    created_at: s.string("The entry creation timestamp returned by Files.com."),
    mtime: s.string("The entry modification timestamp returned by Files.com."),
    permissions: s.string("The permissions string returned by Files.com for the entry."),
    download_uri: s.string("A temporary download URL when Files.com includes one."),
    custom_metadata: rawObjectSchema,
  },
  { description: "A Files.com file or folder entry." },
);
const fileOutputSchema = s.requiredObject("Files.com single file output.", {
  file: fileEntrySchema,
});
const deleteOutputSchema = s.requiredObject("Files.com delete output.", {
  deleted: s.boolean("Whether the Files.com delete request completed successfully."),
  path: s.string("The Files.com path that was deleted."),
  raw: rawObjectSchema,
});

export const filesComActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_folder",
    description: "List files and folders under a Files.com folder path.",
    inputSchema: s.object(
      "Input for listing a Files.com folder.",
      {
        path: s.string("The Files.com folder path to list.", { minLength: 1 }),
        page: s.integer("The page number to request.", { minimum: 1 }),
        perPage: s.integer("The number of entries to return per page.", { minimum: 1 }),
      },
      { required: ["path"], optional: ["page", "perPage"] },
    ),
    outputSchema: s.requiredObject("Files.com folder listing output.", {
      items: s.array("The Files.com entries returned for the folder.", fileEntrySchema),
      page: s.integer("The requested page number."),
      perPage: s.integer("The requested page size."),
      raw: rawListResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_file",
    description: "Retrieve Files.com metadata for a single file or folder path.",
    inputSchema: pathInputSchema,
    outputSchema: fileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_folder",
    description: "Create a folder at a Files.com path.",
    inputSchema: s.object(
      "Input for creating a Files.com folder.",
      {
        path: pathSchema,
        mkdirParents: s.boolean("Whether to create missing parent folders."),
      },
      { required: ["path"], optional: ["mkdirParents"] },
    ),
    outputSchema: fileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_metadata",
    description: "Update custom metadata for a Files.com file or folder path.",
    inputSchema: s.requiredObject("Input for updating Files.com custom metadata.", {
      path: pathSchema,
      customMetadata: s.record(s.string("A custom metadata value."), {
        description: "Custom metadata key-value pairs to store on the file or folder.",
      }),
    }),
    outputSchema: fileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_file",
    description: "Delete a Files.com file or folder path.",
    inputSchema: pathInputSchema,
    outputSchema: deleteOutputSchema,
  }),
];

export type FilesComActionName = "list_folder" | "get_file" | "create_folder" | "update_metadata" | "delete_file";
