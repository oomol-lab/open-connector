import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "crowdin";

const paginationOutput = s.object(
  {
    offset: s.nonNegativeInteger("The current offset in the result set."),
    limit: s.positiveInteger("The maximum number of items returned per page."),
  },
  { required: ["offset", "limit"], description: "The pagination metadata for a Crowdin list response." },
);
const nullablePositiveInteger = (description: string): JsonSchema => s.nullable(s.positiveInteger(description));
const projectSummary = s.object(
  {
    projectId: s.positiveInteger("The unique identifier of the project."),
    name: s.string("The name of the project."),
    identifier: s.string("The string identifier of the project."),
    sourceLanguageId: s.string("The source language ID of the project."),
    targetLanguageIds: s.array("The list of target language IDs for translation.", s.string("One target language ID.")),
    createdAt: s.string("The timestamp when the project was created."),
    updatedAt: s.string("The timestamp when the project was last updated."),
  },
  {
    required: ["projectId", "name", "identifier", "sourceLanguageId", "targetLanguageIds", "createdAt", "updatedAt"],
    description: "A Crowdin project summary.",
  },
);
const branchSummary = s.object(
  {
    branchId: s.positiveInteger("The unique identifier of the branch."),
    projectId: s.positiveInteger("The project ID this branch belongs to."),
    name: s.string("The name of the branch."),
    title: s.nullableString("The title of the branch."),
    exportPattern: s.nullableString("The export pattern for the branch."),
    priority: s.nullableInteger("The priority of the branch."),
    createdAt: s.string("The timestamp when the branch was created."),
    updatedAt: s.string("The timestamp when the branch was last updated."),
  },
  {
    required: ["branchId", "projectId", "name", "title", "exportPattern", "priority", "createdAt", "updatedAt"],
    description: "A Crowdin branch summary.",
  },
);
const directorySummary = s.object(
  {
    directoryId: s.positiveInteger("The unique identifier of the directory."),
    projectId: s.positiveInteger("The project ID this directory belongs to."),
    branchId: nullablePositiveInteger("The branch ID this directory belongs to."),
    parentId: nullablePositiveInteger("The parent directory ID."),
    name: s.string("The name of the directory."),
    title: s.nullableString("The title of the directory."),
    exportPattern: s.nullableString("The export pattern for the directory."),
    priority: s.nullableInteger("The priority of the directory."),
    createdAt: s.string("The timestamp when the directory was created."),
    updatedAt: s.string("The timestamp when the directory was last updated."),
  },
  {
    required: [
      "directoryId",
      "projectId",
      "branchId",
      "parentId",
      "name",
      "title",
      "exportPattern",
      "priority",
      "createdAt",
      "updatedAt",
    ],
    description: "A Crowdin directory summary.",
  },
);
const fileSummary = s.object(
  {
    fileId: s.positiveInteger("The unique identifier of the source file."),
    projectId: s.positiveInteger("The project ID this file belongs to."),
    branchId: nullablePositiveInteger("The branch ID this file belongs to."),
    directoryId: nullablePositiveInteger("The directory ID this file belongs to."),
    name: s.string("The name of the source file."),
    title: s.nullableString("The title of the source file."),
    context: s.nullableString("The context information for the source file."),
    type: s.string("The file type."),
    path: s.string("The path of the file within the project."),
    status: s.string("The current status of the file."),
    createdAt: s.string("The timestamp when the file was created."),
    updatedAt: s.string("The timestamp when the file was last updated."),
  },
  {
    required: [
      "fileId",
      "projectId",
      "branchId",
      "directoryId",
      "name",
      "title",
      "context",
      "type",
      "path",
      "status",
      "createdAt",
      "updatedAt",
    ],
    description: "A Crowdin source file summary.",
  },
);
const pageFields = {
  limit: s.positiveInteger("The maximum number of items to return."),
  offset: s.nonNegativeInteger("The offset for paginating through results."),
};
const branchOrDirectoryFields = {
  branchId: s.positiveInteger("The branch ID to filter or create within."),
  directoryId: s.positiveInteger("The directory ID to filter or create within."),
};

export const crowdinActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Crowdin projects.",
    requiredScopes: ["crowdin.projects.read"],
    inputSchema: s.object(pageFields, {
      optional: ["limit", "offset"],
      description: "The input payload for this action.",
    }),
    outputSchema: s.object(
      { projects: s.array("The list of Crowdin projects.", projectSummary), pagination: paginationOutput },
      { required: ["projects", "pagination"], description: "The output payload for this action." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_branches",
    description: "List Crowdin project branches.",
    requiredScopes: ["crowdin.source.read"],
    inputSchema: s.object(
      {
        projectId: s.positiveInteger("The project ID to list branches for."),
        ...pageFields,
        name: s.string("The branch name to filter by."),
      },
      {
        required: ["projectId"],
        optional: ["limit", "offset", "name"],
        description: "The input payload for this action.",
      },
    ),
    outputSchema: s.object(
      { branches: s.array("The list of branches in the project.", branchSummary), pagination: paginationOutput },
      { required: ["branches", "pagination"], description: "The output payload for this action." },
    ),
  }),
  defineProviderAction(service, {
    name: "create_branch",
    description: "Create a Crowdin project branch.",
    requiredScopes: ["crowdin.source.write"],
    inputSchema: s.object(
      {
        projectId: s.positiveInteger("The project ID to create the branch in."),
        name: s.nonEmptyString("The name of the new branch."),
        title: s.string("The title of the new branch."),
        exportPattern: s.string("The export pattern for the branch."),
        priority: s.integer("The priority of the branch."),
      },
      {
        required: ["projectId", "name"],
        optional: ["title", "exportPattern", "priority"],
        description: "The input payload for this action.",
      },
    ),
    outputSchema: branchSummary,
  }),
  defineProviderAction(service, {
    name: "list_directories",
    description: "List Crowdin directories.",
    requiredScopes: ["crowdin.source.read"],
    inputSchema: s.object(
      {
        projectId: s.positiveInteger("The project ID to list directories for."),
        ...branchOrDirectoryFields,
        filter: s.string("The filter string to match directory names."),
        recursion: s.boolean("Whether to list directories recursively."),
        ...pageFields,
      },
      {
        required: ["projectId"],
        optional: ["branchId", "directoryId", "filter", "recursion", "limit", "offset"],
        description: "The input payload for this action. branchId and directoryId cannot both be provided.",
      },
    ),
    outputSchema: s.object(
      {
        directories: s.array("The list of directories in the project.", directorySummary),
        pagination: paginationOutput,
      },
      { required: ["directories", "pagination"], description: "The output payload for this action." },
    ),
  }),
  defineProviderAction(service, {
    name: "create_directory",
    description: "Create a Crowdin directory.",
    requiredScopes: ["crowdin.source.write"],
    inputSchema: s.object(
      {
        projectId: s.positiveInteger("The project ID to create the directory in."),
        name: s.nonEmptyString("The name of the new directory."),
        ...branchOrDirectoryFields,
        title: s.string("The title of the new directory."),
        exportPattern: s.string("The export pattern for the directory."),
        priority: s.integer("The priority of the directory."),
      },
      {
        required: ["projectId", "name"],
        optional: ["branchId", "directoryId", "title", "exportPattern", "priority"],
        description: "The input payload for this action. branchId and directoryId cannot both be provided.",
      },
    ),
    outputSchema: directorySummary,
  }),
  defineProviderAction(service, {
    name: "list_files",
    description: "List Crowdin source files.",
    requiredScopes: ["crowdin.source.read"],
    inputSchema: s.object(
      {
        projectId: s.positiveInteger("The project ID to list files for."),
        ...branchOrDirectoryFields,
        filter: s.string("The filter string to match file names."),
        recursion: s.boolean("Whether to list files recursively."),
        ...pageFields,
      },
      {
        required: ["projectId"],
        optional: ["branchId", "directoryId", "filter", "recursion", "limit", "offset"],
        description: "The input payload for this action. branchId and directoryId cannot both be provided.",
      },
    ),
    outputSchema: s.object(
      { files: s.array("The list of source files in the project.", fileSummary), pagination: paginationOutput },
      { required: ["files", "pagination"], description: "The output payload for this action." },
    ),
  }),
  defineProviderAction(service, {
    name: "upload_file",
    description: "Upload a source file to Crowdin.",
    requiredScopes: ["crowdin.source.write"],
    inputSchema: s.object(
      {
        projectId: s.positiveInteger("The project ID to upload the file to."),
        name: s.nonEmptyString("The name of the file to upload."),
        contentBase64: s.nonEmptyString("The base64-encoded content of the file."),
        contentType: s.string("The MIME type of the file content."),
        ...branchOrDirectoryFields,
        title: s.string("The title of the source file."),
        context: s.string("The context information for the source file."),
        type: s.string("The file type identifier."),
        parserVersion: s.string("The parser version to use for the file."),
        importOptions: s.record("The import options for the file.", s.unknown("One import option value.")),
        exportOptions: s.record("The export options for the file.", s.unknown("One export option value.")),
      },
      {
        required: ["projectId", "name", "contentBase64"],
        optional: [
          "contentType",
          "branchId",
          "directoryId",
          "title",
          "context",
          "type",
          "parserVersion",
          "importOptions",
          "exportOptions",
        ],
        description: "The input payload for this action. branchId and directoryId cannot both be provided.",
      },
    ),
    outputSchema: s.object(
      { storageId: s.positiveInteger("The storage ID of the uploaded file."), file: fileSummary },
      { required: ["storageId", "file"], description: "The output payload for this action." },
    ),
  }),
];
