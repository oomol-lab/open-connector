import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { oneDriveProviderScopes, oneDriveReadScopes, oneDriveWriteScopes } from "./scopes.ts";

const service = "one_drive";

interface OneDriveActionSource {
  name: string;
  description: string;
  requiredScopes: string[];
  providerPermissions: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const rawObject = s.record(true, { description: "A generic JSON object returned by Microsoft Graph." });
const nonEmptyString = (description: string): JsonSchema => s.string({ minLength: 1, description });
const stringArray = (description: string): JsonSchema =>
  s.array(nonEmptyString("A Microsoft Graph field name."), { minItems: 1, description });

const driveId = nonEmptyString("Optional drive ID. Omit it to use the authenticated user's default OneDrive.");
const select = stringArray("Optional Microsoft Graph fields to include in the response.");
const expand = stringArray("Optional Microsoft Graph relationships to expand in the response.");
const nextLink = s.url("Opaque Microsoft Graph nextLink returned by a previous OneDrive response.");
const itemId = nonEmptyString("OneDrive drive item ID.");
const itemPath = nonEmptyString("Path from the drive root, starting with /.");
const flexibleItemPath = nonEmptyString(
  "Path to a drive item relative to the drive root. A leading slash is optional.",
);
const top = s.integer({ minimum: 1, maximum: 999, description: "Maximum number of items to return." });
const orderBy = nonEmptyString("Optional Microsoft Graph order-by expression.");

const identity = s.looseObject(
  {
    id: s.string({ description: "Unique identifier for the identity." }),
    displayName: s.string({ description: "Display name for the identity." }),
  },
  { description: "Identity information returned by Microsoft Graph." },
);
const identitySet = s.looseObject(
  {
    user: identity,
    application: identity,
    device: identity,
  },
  { description: "Identity set returned by Microsoft Graph." },
);
const driveItemReference = s.looseObject(
  {
    driveId: s.string({ description: "Drive ID of the referenced item." }),
    id: s.string({ description: "Drive item ID of the referenced item." }),
    name: s.string({ description: "Name of the referenced item." }),
    path: s.string({ description: "Percent-encoded path of the referenced item." }),
    driveType: s.string({ description: "Drive type of the referenced item." }),
    siteId: s.string({ description: "Site ID of the referenced item." }),
  },
  { description: "Reference to another drive item." },
);
const fileFacet = s.looseObject(
  {
    mimeType: s.string({ description: "Detected MIME type for the file." }),
    hashes: rawObject,
  },
  { description: "File facet for a drive item." },
);
const folderFacet = s.looseObject(
  {
    childCount: s.integer({ description: "Number of direct child items." }),
    view: rawObject,
  },
  { description: "Folder facet for a drive item." },
);
const drive = s.looseObject(
  {
    id: nonEmptyString("Drive ID."),
    name: s.string({ description: "Display name of the drive." }),
    driveType: s.string({ description: "Type of drive." }),
    webUrl: s.string({ description: "Web URL for the drive." }),
    quota: rawObject,
  },
  { description: "OneDrive drive resource." },
);
const driveItem = s.looseObject(
  {
    id: nonEmptyString("Drive item ID."),
    name: nonEmptyString("Drive item name."),
    webUrl: s.string({ description: "Web URL for the drive item." }),
    description: s.string({ description: "User-visible description for the drive item." }),
    cTag: s.string({ description: "Content tag for the drive item." }),
    eTag: s.string({ description: "Entity tag for the drive item." }),
    size: s.integer({ description: "Size of the drive item in bytes." }),
    createdDateTime: s.string({ description: "Creation timestamp for the drive item." }),
    lastModifiedDateTime: s.string({ description: "Last modification timestamp for the drive item." }),
    createdBy: identitySet,
    lastModifiedBy: identitySet,
    parentReference: driveItemReference,
    file: fileFacet,
    folder: folderFacet,
    root: rawObject,
    deleted: rawObject,
    fileSystemInfo: rawObject,
    remoteItem: rawObject,
    shared: rawObject,
    specialFolder: rawObject,
    searchResult: rawObject,
  },
  { description: "OneDrive drive item resource." },
);
const listDriveItemsOutput = s.object(
  {
    items: s.array(driveItem, { description: "Drive items returned by Microsoft Graph." }),
    nextLink: s.nullableString("Opaque nextLink for fetching the next page, if any."),
  },
  { required: ["items", "nextLink"], description: "OneDrive list response." },
);
const downloadOutput = s.requiredObject("A OneDrive file downloaded into local transit storage.", {
  fileId: nonEmptyString("The unique identifier of the downloaded OneDrive item."),
  name: nonEmptyString("The downloaded file name."),
  mimeType: nonEmptyString("The MIME type of the downloaded file."),
  sizeBytes: s.nonNegativeInteger("The downloaded file size in bytes."),
  file: s.requiredObject("The downloaded file in local transit storage.", {
    fileId: nonEmptyString("The local transit file identifier."),
    downloadUrl: s.url("The local transit URL for downloading the stored file."),
    sizeBytes: s.nonNegativeInteger("The stored transit file size in bytes."),
    name: nonEmptyString("The stored transit file name."),
    mimeType: nonEmptyString("The stored transit file MIME type."),
  }),
});
const fileSystemInfo = s.object(
  {
    createdDateTime: s.dateTime("Client-side creation timestamp."),
    lastAccessedDateTime: s.dateTime("Client-side last-access timestamp."),
    lastModifiedDateTime: s.dateTime("Client-side last-modified timestamp."),
  },
  { description: "Client-side file system timestamps." },
);
const inlineUploadFields = {
  name: nonEmptyString("File name used for inline upload content."),
  mimeType: nonEmptyString("MIME type used for inline upload content."),
  file: s.transitFile("File uploaded through POST /api/files."),
  contentBase64: nonEmptyString("Base64-encoded file content used for inline uploads."),
  text: s.string({ description: "Plain-text file content used for inline uploads." }),
  description: nonEmptyString("Optional OneDrive file description."),
  deferCommit: s.boolean({ description: "Unsupported for now. Uploads are always committed immediately." }),
  ifMatch: nonEmptyString("Optional eTag used for conditional upload session creation."),
  fileSystemInfo,
  conflictBehavior: s.stringEnum(["rename", "fail", "replace"], {
    description: "Conflict behavior used when a file with the same name already exists.",
  }),
};

function input(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.actionInput(properties, required, "OneDrive action input.");
}

const actions: OneDriveActionSource[] = [
  read("get_drive", "Get metadata for the current drive or a specific drive.", input({ driveId, select }), drive),
  read(
    "get_root",
    "Get metadata for the root folder of the current drive or a specific drive.",
    input({ driveId, select, expand }),
    driveItem,
  ),
  read(
    "get_item",
    "Get metadata for a drive item by item ID or path.",
    input({ driveId, itemId, itemPath, select, expand }),
    driveItem,
  ),
  read(
    "list_folder_children",
    "List the direct children of a folder in OneDrive.",
    input({ driveId, folderItemId: itemId, folderPath: itemPath, top, select, expand, orderBy, nextLink }),
    listDriveItemsOutput,
  ),
  read(
    "search_items",
    "Search OneDrive for files and folders by keyword.",
    input({
      driveId,
      query: nonEmptyString("Keyword query used to search the current drive."),
      top,
      select,
      expand,
      orderBy,
      nextLink,
    }),
    listDriveItemsOutput,
  ),
  write(
    "create_folder",
    "Create a folder in OneDrive.",
    input(
      {
        driveId,
        name: nonEmptyString("Folder name."),
        parentItemId: itemId,
        parentPath: itemPath,
        conflictBehavior: s.stringEnum(["rename", "fail", "replace"], {
          description: "Conflict behavior used when a folder with the same name already exists.",
        }),
      },
      ["name"],
    ),
    driveItem,
  ),
  write(
    "update_item_metadata",
    "Rename, move, or update metadata for a drive item.",
    input(
      {
        driveId,
        itemId,
        name: nonEmptyString("New name for the drive item."),
        description: nonEmptyString("New description for the drive item."),
        ifMatch: nonEmptyString("Optional eTag used for conditional update requests."),
        fileSystemInfo,
        parentItemId: itemId,
      },
      ["itemId"],
    ),
    driveItem,
  ),
  write(
    "delete_item",
    "Delete a drive item from OneDrive and move it to the recycle bin.",
    input({ driveId, itemId, ifMatch: nonEmptyString("Optional eTag used for conditional delete requests.") }, [
      "itemId",
    ]),
    s.object(
      { itemId, deleted: s.literal(true, { description: "Whether the drive item was deleted successfully." }) },
      { required: ["itemId", "deleted"], description: "Successful OneDrive delete acknowledgement." },
    ),
  ),
  read(
    "download_file",
    "Download one file from OneDrive by item ID into local transit file storage.",
    input(
      {
        driveId,
        itemId,
        format: s.stringEnum(["pdf", "html"], {
          description: "Optional format to convert the file into before download.",
        }),
        fileName: nonEmptyString("Optional file name to use for the local transit file."),
      },
      ["itemId"],
    ),
    downloadOutput,
  ),
  read(
    "download_file_by_path",
    "Download one file from OneDrive by path into local transit file storage.",
    input(
      {
        driveId,
        itemPath: flexibleItemPath,
        fileName: nonEmptyString("Optional file name to use for the local transit file."),
      },
      ["itemPath"],
    ),
    downloadOutput,
  ),
  read(
    "download_item_as_format",
    "Download one drive item into local transit storage after converting it to a supported Microsoft Graph format.",
    input(
      {
        driveId,
        format: s.stringEnum(["pdf", "html"], { description: "Format to convert the drive item into." }),
        itemId,
        pathAndFilename: flexibleItemPath,
        fileName: nonEmptyString("Optional file name to use for the local transit file."),
      },
      ["format"],
    ),
    downloadOutput,
  ),
  write(
    "upload_file",
    "Upload one file to OneDrive, optionally creating destination folders on the way.",
    input(
      {
        driveId,
        folder: nonEmptyString("Destination folder path starting with /, or a parent folder item ID."),
        ...inlineUploadFields,
      },
      [],
    ),
    driveItem,
  ),
  write(
    "update_file_content",
    "Replace the content of one existing OneDrive file.",
    input(
      {
        driveId,
        itemId,
        file: inlineUploadFields.file,
        contentBase64: inlineUploadFields.contentBase64,
        text: inlineUploadFields.text,
        name: inlineUploadFields.name,
        mimeType: inlineUploadFields.mimeType,
        description: inlineUploadFields.description,
        deferCommit: inlineUploadFields.deferCommit,
        ifMatch: inlineUploadFields.ifMatch,
        ifNoneMatch: nonEmptyString("Optional eTag used to prevent updates when the item has not changed."),
        fileSize: s.integer({
          minimum: 0,
          description: "Optional file size hint used by Microsoft Graph for quota checks.",
        }),
        fileSystemInfo,
        conflictBehavior: s.stringEnum(["replace", "fail", "rename"], {
          description: "Conflict behavior used when the updated content collides during commit.",
        }),
        driveItemSource: rawObject,
        mediaSource: rawObject,
      },
      ["itemId"],
    ),
    driveItem,
  ),
];

export const oneDriveActions: ActionDefinition[] = actions.map((action) => defineProviderAction(service, action));

function read(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): OneDriveActionSource {
  return {
    name,
    description,
    requiredScopes: oneDriveReadScopes,
    providerPermissions: [oneDriveProviderScopes.filesRead],
    inputSchema,
    outputSchema,
  };
}

function write(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): OneDriveActionSource {
  return {
    name,
    description,
    requiredScopes: oneDriveWriteScopes,
    providerPermissions: [oneDriveProviderScopes.filesReadWrite],
    inputSchema,
    outputSchema,
  };
}
