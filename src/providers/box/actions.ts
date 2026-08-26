import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { boxProviderScopes } from "./scopes.ts";

const service = "box";
const emptyInput = s.object({}, { description: "No input is required for this action." });
const itemTypes = ["file", "folder", "web_link"];

const itemSchema = s.looseRequiredObject(
  "A Box file, folder, or web link with stable identifying metadata.",
  {
    id: s.nonEmptyString("The Box item identifier."),
    type: s.stringEnum(itemTypes, { description: "The Box item type." }),
    name: s.nonEmptyString("The item name."),
    etag: s.optional(s.nullableString("The item entity tag when available.")),
    sequenceId: s.optional(s.nullableString("The item sequence identifier when available.")),
    description: s.optional(s.nullableString("The item description when available.")),
    sizeBytes: s.optional(s.nullableInteger("The file size in bytes when available.")),
    parent: s.optional(s.nullable(s.looseObject({}, { description: "The parent folder reference." }))),
    pathCollection: s.optional(s.nullable(s.looseObject({}, { description: "The item's Box path collection." }))),
    sharedLink: s.optional(s.nullable(s.looseObject({}, { description: "Shared-link metadata when available." }))),
    createdAt: s.optional(s.nullableString("The creation timestamp when available.")),
    modifiedAt: s.optional(s.nullableString("The modification timestamp when available.")),
  },
  {
    optional: [
      "etag",
      "sequenceId",
      "description",
      "sizeBytes",
      "parent",
      "pathCollection",
      "sharedLink",
      "createdAt",
      "modifiedAt",
    ],
  },
);

const itemOutput = s.requiredObject("A Box item result.", { item: itemSchema });
const idInput = (key: "fileId" | "folderId", description: string): JsonSchema =>
  s.requiredObject(description, {
    [key]: s.nonEmptyString(`The Box ${key === "fileId" ? "file" : "folder"} identifier.`),
  });

const listOutput = s.object(
  {
    entries: s.array(itemSchema, { description: "The Box items in this page." }),
    limit: s.positiveInteger("The page size returned by Box."),
    offset: s.optional(s.nonNegativeInteger("The offset returned for offset-based pagination.")),
    totalCount: s.optional(s.nonNegativeInteger("The Box total count estimate for offset-based pagination.")),
    nextMarker: s.optional(s.nullableString("The marker for the next page, or null when there is no next page.")),
    previousMarker: s.optional(s.nullableString("The marker for the previous page when available.")),
  },
  { description: "A page of Box items.", required: ["entries", "limit", "nextMarker"] },
);

const fileInput = s.requiredObject("A local transit file to upload to Box.", {
  fileId: s.nonEmptyString("The local transit file identifier."),
});

function action(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
  scope: string,
  followUpActions?: string[],
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    description,
    requiredScopes: [scope],
    providerPermissions: [scope],
    inputSchema,
    outputSchema,
    followUpActions,
  });
}

export const boxActions: ActionDefinition[] = [
  action(
    "get_current_user",
    "Get the Box user represented by the current OAuth connection.",
    emptyInput,
    s.requiredObject("The authenticated Box user.", {
      id: s.nonEmptyString("The Box user identifier."),
      type: s.literal("user", { description: "The Box resource type." }),
      name: s.nonEmptyString("The user's display name."),
      login: s.email("The user's primary email address."),
      status: s.optional(s.string("The Box account status.")),
      spaceAmount: s.optional(s.nonNegativeInteger("The available storage in bytes.")),
      spaceUsed: s.optional(s.nonNegativeInteger("The used storage in bytes.")),
      maxUploadSize: s.optional(s.nonNegativeInteger("The maximum individual upload size in bytes.")),
    }),
    boxProviderScopes.read,
  ),
  action(
    "get_file",
    "Get metadata for a Box file.",
    idInput("fileId", "Identify the file to retrieve."),
    itemOutput,
    boxProviderScopes.read,
    ["box.download_file"],
  ),
  action(
    "get_folder",
    "Get metadata for a Box folder.",
    idInput("folderId", "Identify the folder to retrieve."),
    itemOutput,
    boxProviderScopes.read,
    ["box.list_folder_items"],
  ),
  action(
    "list_folder_items",
    "List files, folders, and web links in a Box folder using marker or offset pagination.",
    s.object(
      {
        folderId: s.nonEmptyString("The folder identifier. Use 0 for the root folder."),
        useMarker: s.optional(s.boolean("Whether to use marker-based pagination.")),
        marker: s.optional(s.nonEmptyString("The marker from a previous page.")),
        offset: s.optional(s.nonNegativeInteger("The zero-based offset for offset pagination.")),
        limit: s.optional(s.positiveInteger("The maximum number of items to return.", { maximum: 1000 })),
        sort: s.optional(s.stringEnum(["id", "name", "date", "size"], { description: "The secondary sort field." })),
        direction: s.optional(s.stringEnum(["ASC", "DESC"], { description: "The sort direction." })),
      },
      { description: "Select a folder page.", required: ["folderId"] },
    ),
    listOutput,
    boxProviderScopes.read,
    ["box.list_folder_items_continue"],
  ),
  action(
    "list_folder_items_continue",
    "Continue a marker-based Box folder listing.",
    s.requiredObject("Continue a folder listing from its next marker.", {
      folderId: s.nonEmptyString("The folder identifier."),
      marker: s.nonEmptyString("The next marker returned by Box."),
      limit: s.optional(s.positiveInteger("The maximum number of items to return.", { maximum: 1000 })),
    }),
    listOutput,
    boxProviderScopes.read,
    ["box.list_folder_items_continue"],
  ),
  action(
    "search",
    "Search Box content available to the authenticated user.",
    s.object(
      {
        query: s.nonEmptyString("The search query."),
        type: s.optional(s.stringEnum(itemTypes, { description: "Limit results to one item type." })),
        ancestorFolderIds: s.optional(s.array(s.nonEmptyString("A Box ancestor folder identifier."))),
        fileExtensions: s.optional(s.array(s.nonEmptyString("A file extension without a leading dot."))),
        contentTypes: s.optional(
          s.array(
            s.stringEnum(["name", "description", "file_content", "comments", "tags"], {
              description: "The content field to search.",
            }),
          ),
        ),
        limit: s.optional(s.positiveInteger("The maximum number of results.", { maximum: 200 })),
        offset: s.optional(s.nonNegativeInteger("The zero-based search offset.")),
        sort: s.optional(s.stringEnum(["modified_at", "relevance"], { description: "The search sort field." })),
        direction: s.optional(s.stringEnum(["ASC", "DESC"], { description: "The sort direction." })),
      },
      { description: "Search criteria for Box content.", required: ["query"] },
    ),
    s.requiredObject("A page of Box search results.", {
      entries: s.array(itemSchema, { description: "The matching Box items." }),
      limit: s.positiveInteger("The page size returned by Box."),
      offset: s.nonNegativeInteger("The current result offset."),
      totalCount: s.nonNegativeInteger("The Box total count estimate."),
      nextOffset: s.nullableInteger("The next offset, or null when no further page is indicated."),
    }),
    boxProviderScopes.read,
  ),
  action(
    "download_file",
    "Download a Box file into local transit storage.",
    s.object(
      {
        fileId: s.nonEmptyString("The Box file identifier."),
        fileName: s.optional(s.nonEmptyString("An optional local transit file name.")),
      },
      { required: ["fileId"] },
    ),
    s.requiredObject("A Box file stored in local transit storage.", {
      item: itemSchema,
      file: s.requiredObject("The local transit file.", {
        fileId: s.nonEmptyString("The local transit file identifier."),
        downloadUrl: s.url("The local transit download URL."),
        sizeBytes: s.nonNegativeInteger("The stored file size in bytes."),
        name: s.nonEmptyString("The stored file name."),
        mimeType: s.nonEmptyString("The stored file MIME type."),
      }),
    }),
    boxProviderScopes.read,
  ),
  action(
    "create_folder",
    "Create a folder in Box.",
    s.requiredObject("Define the new Box folder.", {
      name: s.nonEmptyString("The folder name.", { maxLength: 255 }),
      parentFolderId: s.nonEmptyString("The parent folder identifier. Use 0 for the root folder."),
    }),
    itemOutput,
    boxProviderScopes.write,
  ),
  action(
    "upload_file",
    "Upload a local transit file of up to 50 MB to Box.",
    s.requiredObject("Define the Box upload.", {
      file: fileInput,
      name: s.nonEmptyString("The file name to create in Box."),
      parentFolderId: s.nonEmptyString("The parent folder identifier. Use 0 for the root folder."),
      contentCreatedAt: s.optional(s.dateTime("The original content creation timestamp.")),
      contentModifiedAt: s.optional(s.dateTime("The original content modification timestamp.")),
    }),
    itemOutput,
    boxProviderScopes.write,
  ),
  action(
    "update_file",
    "Rename, move, or update the description of a Box file.",
    s.object(
      {
        fileId: s.nonEmptyString("The Box file identifier."),
        name: s.optional(s.nonEmptyString("A new file name.")),
        description: s.optional(s.string({ description: "A new file description.", maxLength: 256 })),
        parentFolderId: s.optional(s.nonEmptyString("A new parent folder identifier.")),
        etag: s.optional(s.nonEmptyString("The last observed entity tag for optimistic concurrency.")),
      },
      { required: ["fileId"] },
    ),
    itemOutput,
    boxProviderScopes.write,
  ),
  action(
    "update_folder",
    "Rename, move, or update the description of a Box folder.",
    s.object(
      {
        folderId: s.nonEmptyString("The Box folder identifier."),
        name: s.optional(s.nonEmptyString("A new folder name.")),
        description: s.optional(s.string({ description: "A new folder description.", maxLength: 256 })),
        parentFolderId: s.optional(s.nonEmptyString("A new parent folder identifier.")),
        etag: s.optional(s.nonEmptyString("The last observed entity tag for optimistic concurrency.")),
      },
      { required: ["folderId"] },
    ),
    itemOutput,
    boxProviderScopes.write,
  ),
  action(
    "delete_file",
    "Move a Box file to the trash.",
    s.object(
      {
        fileId: s.nonEmptyString("The Box file identifier."),
        etag: s.optional(s.nonEmptyString("The last observed entity tag for optimistic concurrency.")),
      },
      { required: ["fileId"] },
    ),
    s.requiredObject("The deletion result.", {
      deleted: s.boolean("Whether Box accepted the deletion."),
      fileId: s.nonEmptyString("The deleted Box file identifier."),
    }),
    boxProviderScopes.write,
  ),
  action(
    "delete_folder",
    "Move a Box folder to the trash, optionally including its contents.",
    s.object(
      {
        folderId: s.nonEmptyString("The Box folder identifier."),
        recursive: s.optional(s.boolean("Whether to delete a non-empty folder recursively.")),
        etag: s.optional(s.nonEmptyString("The last observed entity tag for optimistic concurrency.")),
      },
      { required: ["folderId"] },
    ),
    s.requiredObject("The deletion result.", {
      deleted: s.boolean("Whether Box accepted the deletion."),
      folderId: s.nonEmptyString("The deleted Box folder identifier."),
    }),
    boxProviderScopes.write,
  ),
];
