import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "uploadcare";

const optionalUploadcareIncludeSchema = s.string("Additional Uploadcare fields to include, such as appdata.");

const fileUuidInputSchema = s.object(
  "Input for selecting an Uploadcare file.",
  {
    uuid: s.uuid("The Uploadcare file UUID."),
  },
  { required: ["uuid"] },
);

const uploadcareFileSchema = s.looseObject("An Uploadcare file object returned by the REST API.", {
  uuid: s.uuid("The file UUID."),
  datetime_uploaded: s.dateTime("The date and time when the file was uploaded."),
  datetime_stored: s.nullable(s.dateTime("The date and time when the file was stored.")),
  datetime_removed: s.nullable(s.dateTime("The date and time when the file was removed.")),
  original_file_url: s.nullable(s.url("The original file CDN URL returned by Uploadcare.")),
  url: s.url("The API resource URL returned by Uploadcare."),
  mime_type: s.string("The MIME type returned by Uploadcare."),
  size: s.nonNegativeInteger("The file size in bytes."),
  is_image: s.boolean("Whether Uploadcare identified the file as an image."),
  is_ready: s.boolean("Whether the file is ready for delivery."),
  metadata: s.looseObject("User-defined Uploadcare file metadata."),
  appdata: s.looseObject("Uploadcare add-on application data attached to the file."),
});

const uploadcareGroupSchema = s.looseObject("An Uploadcare group object.", {
  id: s.string("The Uploadcare group identifier."),
  datetime_created: s.dateTime("The date and time when the group was created."),
  files_count: s.nonNegativeInteger("The number of files in the group."),
  cdn_url: s.url("The group CDN URL returned by Uploadcare."),
  url: s.url("The group API resource URL returned by Uploadcare."),
});

const uploadcareGroupWithFilesSchema = s.looseObject("An Uploadcare group object with file entries.", {
  id: s.string("The Uploadcare group identifier."),
  datetime_created: s.dateTime("The date and time when the group was created."),
  files_count: s.nonNegativeInteger("The number of files in the group."),
  cdn_url: s.url("The group CDN URL returned by Uploadcare."),
  url: s.url("The group API resource URL returned by Uploadcare."),
  files: s.nullable(
    s.array("The files in the group. Removed files may be returned as null entries.", s.nullable(uploadcareFileSchema)),
  ),
});

const nullableUrlSchema = s.nullable(s.url("A pagination URL returned by Uploadcare."));

const projectCollaboratorSchema = s.object("An Uploadcare project collaborator.", {
  email: s.email("The collaborator email address."),
  name: s.string("The collaborator name."),
});

const uploadcareProjectSchema = s.looseObject("The Uploadcare project details.", {
  collaborators: s.nullable(s.array("The project collaborators returned by Uploadcare.", projectCollaboratorSchema)),
  name: s.string("The Uploadcare project login name."),
  pub_key: s.string("The Uploadcare project public key."),
  autostore_enabled: s.boolean("Whether Uploadcare auto file storing is enabled."),
});

const getProjectInfoAction = defineProviderAction(service, {
  name: "get_project_info",
  description: "Get Uploadcare project details for the connected public key.",
  inputSchema: s.object("Input for retrieving Uploadcare project details.", {}),
  outputSchema: s.object(
    "The Uploadcare project details response.",
    {
      project: uploadcareProjectSchema,
    },
    { required: ["project"] },
  ),
});

const listFilesAction = defineProviderAction(service, {
  name: "list_files",
  description: "List Uploadcare files with documented pagination and filters.",
  inputSchema: s.object(
    "Input for listing Uploadcare files.",
    {
      removed: s.boolean("Whether to include only removed files."),
      stored: s.boolean("Whether to include only stored or temporary files."),
      limit: s.integer("The preferred number of files to return.", {
        minimum: 1,
        maximum: 1000,
      }),
      ordering: s.stringEnum("The file sort order.", ["datetime_uploaded", "-datetime_uploaded"]),
      from: s.dateTime("The ISO 8601 date-time cursor to start listing files from."),
      include: optionalUploadcareIncludeSchema,
    },
    { optional: ["removed", "stored", "limit", "ordering", "from", "include"] },
  ),
  outputSchema: s.object(
    "The paginated Uploadcare file list response.",
    {
      next: nullableUrlSchema,
      previous: nullableUrlSchema,
      total: s.nonNegativeInteger("The total number of files for the current query."),
      totals: s.looseObject("Uploadcare file totals grouped by storage/removal state.", {
        removed: s.nonNegativeInteger("The number of removed files."),
        stored: s.nonNegativeInteger("The number of stored files."),
        unstored: s.nonNegativeInteger("The number of unstored files."),
      }),
      per_page: s.nonNegativeInteger("The number of files returned per page."),
      results: s.array("The Uploadcare files returned for this page.", uploadcareFileSchema),
    },
    { optional: ["next", "previous", "total", "totals", "per_page"] },
  ),
});

const getFileInfoAction = defineProviderAction(service, {
  name: "get_file_info",
  description: "Get Uploadcare file metadata by UUID.",
  inputSchema: s.object(
    "Input for retrieving one Uploadcare file.",
    {
      uuid: s.uuid("The Uploadcare file UUID."),
      include: optionalUploadcareIncludeSchema,
    },
    { optional: ["include"] },
  ),
  outputSchema: s.object(
    "The Uploadcare file info response.",
    {
      file: uploadcareFileSchema,
    },
    { required: ["file"] },
  ),
});

const storeFileAction = defineProviderAction(service, {
  name: "store_file",
  description: "Mark an Uploadcare file as permanently stored.",
  inputSchema: fileUuidInputSchema,
  outputSchema: s.object(
    "The Uploadcare store-file response.",
    {
      file: uploadcareFileSchema,
    },
    { required: ["file"] },
  ),
});

const deleteFileAction = defineProviderAction(service, {
  name: "delete_file",
  description: "Remove an Uploadcare file from storage by UUID.",
  inputSchema: fileUuidInputSchema,
  outputSchema: s.object(
    "The Uploadcare delete-file response.",
    {
      file: uploadcareFileSchema,
    },
    { required: ["file"] },
  ),
});

const listGroupsAction = defineProviderAction(service, {
  name: "list_groups",
  description: "List Uploadcare file groups with documented pagination.",
  inputSchema: s.object(
    "Input for listing Uploadcare groups.",
    {
      limit: s.integer("The preferred number of groups to return.", {
        minimum: 1,
        maximum: 1000,
      }),
      from: s.dateTime("The ISO 8601 date-time cursor to start listing groups from."),
      ordering: s.stringEnum("The group sort order.", ["datetime_created", "-datetime_created"]),
    },
    { optional: ["limit", "from", "ordering"] },
  ),
  outputSchema: s.object(
    "The paginated Uploadcare group list response.",
    {
      next: nullableUrlSchema,
      previous: nullableUrlSchema,
      total: s.nonNegativeInteger("The total number of groups in the project."),
      per_page: s.nonNegativeInteger("The number of groups returned per page."),
      results: s.array("The Uploadcare groups returned for this page.", uploadcareGroupSchema),
    },
    { optional: ["next", "previous", "total", "per_page"] },
  ),
});

const getGroupInfoAction = defineProviderAction(service, {
  name: "get_group_info",
  description: "Get an Uploadcare file group by its group ID.",
  inputSchema: s.object(
    "Input for retrieving one Uploadcare group.",
    {
      uuid: s.nonEmptyString("The Uploadcare group ID, for example a UUID followed by ~ and size."),
    },
    { required: ["uuid"] },
  ),
  outputSchema: s.object(
    "The Uploadcare group info response.",
    {
      group: uploadcareGroupWithFilesSchema,
    },
    { required: ["group"] },
  ),
});

export const uploadcareActions: ActionDefinition[] = [
  getProjectInfoAction,
  listFilesAction,
  getFileInfoAction,
  storeFileAction,
  deleteFileAction,
  listGroupsAction,
  getGroupInfoAction,
];
