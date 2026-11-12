import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sftp";

const remotePathDescription =
  "Relative paths resolve against the login directory of the SFTP account; absolute paths start with /.";
const entryTypeSchema = s.stringEnum("Kind of filesystem entry.", ["file", "directory", "symlink", "other"]);
const sizeSchema = s.nonNegativeInteger("Size in bytes as reported by the server.");
const modifiedAtSchema = s.nullableString(
  "Last modification time as an ISO 8601 timestamp, when the server reports it.",
);
const transitFileSchema = s.object("The downloaded file stored in the local transit file service.", {
  fileId: s.string("Transit file identifier."),
  downloadUrl: s.string("URL that serves the downloaded file from the local transit file service."),
  sizeBytes: sizeSchema,
  name: s.string("File name of the downloaded file."),
  mimeType: s.string("MIME type recorded for the transit file."),
});

export const sftpActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_directory",
    operationType: "read",
    description: "List the entries of one remote directory. The listing is not recursive and skips . and ..",
    inputSchema: s.object(
      "The remote directory to list.",
      {
        path: s.nonEmptyString(`Remote directory path. ${remotePathDescription}`),
        maxEntries: s.integer("Maximum number of entries to return. Defaults to 1000.", {
          minimum: 1,
          maximum: 10_000,
        }),
      },
      { optional: ["maxEntries"] },
    ),
    outputSchema: s.object("The directory listing.", {
      path: s.string("The directory path that was listed, as given."),
      entries: s.array(
        "Entries in the directory, sorted by name.",
        s.object("One directory entry.", {
          name: s.string("Entry name without its directory."),
          path: s.string("Entry path built from the listed directory and the entry name."),
          type: entryTypeSchema,
          sizeBytes: sizeSchema,
          modifiedAt: modifiedAtSchema,
          permissions: s.string("Unix permission string such as rwxr-xr-x, as the server reports it."),
        }),
      ),
      truncated: s.boolean("Whether more entries exist than maxEntries allowed in this response."),
    }),
  }),
  defineProviderAction(service, {
    name: "stat",
    operationType: "read",
    description: "Read the type, size, timestamps and permissions of one remote path, following symbolic links.",
    inputSchema: s.object("The remote path to inspect.", {
      path: s.nonEmptyString(`Remote file or directory path. ${remotePathDescription}`),
    }),
    outputSchema: s.object("Attributes of the remote path.", {
      path: s.string("The inspected path, as given."),
      type: entryTypeSchema,
      sizeBytes: sizeSchema,
      modifiedAt: modifiedAtSchema,
      accessedAt: s.nullableString("Last access time as an ISO 8601 timestamp, when the server reports it."),
      mode: s.string("Permission bits as a four-digit octal string such as 0644."),
      uid: s.integer("Numeric owner user id."),
      gid: s.integer("Numeric owner group id."),
    }),
  }),
  defineProviderAction(service, {
    name: "download_file",
    operationType: "read",
    description:
      "Download one remote file into the local transit file service and return a downloadable file reference.",
    inputSchema: s.object(
      "The remote file to download.",
      {
        path: s.nonEmptyString(`Remote file path. ${remotePathDescription}`),
        mimeType: s.nonEmptyString(
          "MIME type to record for the downloaded file. Defaults to application/octet-stream.",
        ),
      },
      { optional: ["mimeType"] },
    ),
    outputSchema: s.object("The downloaded file.", {
      path: s.string("The remote file path, as given."),
      file: transitFileSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "upload_file",
    operationType: "write",
    description: "Upload a transit file to a remote file path. Existing files are kept unless overwrite is true.",
    inputSchema: s.object(
      "The file to upload and where to write it.",
      {
        path: s.nonEmptyString(`Remote destination file path, including the file name. ${remotePathDescription}`),
        file: s.transitFile("The file to upload, previously stored through the local transit file API."),
        overwrite: s.boolean("Replace the remote file when it already exists. Defaults to false."),
      },
      { optional: ["overwrite"] },
    ),
    outputSchema: s.object("The uploaded file.", {
      path: s.string("The remote destination path, as given."),
      sizeBytes: sizeSchema,
      overwritten: s.boolean("Whether an existing remote file was replaced."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_file",
    operationType: "destructive",
    description: "Delete one remote file. Directories are rejected; use remove_directory for them.",
    inputSchema: s.object("The remote file to delete.", {
      path: s.nonEmptyString(`Remote file path. ${remotePathDescription}`),
    }),
    outputSchema: s.object("The deleted file.", {
      path: s.string("The deleted path, as given."),
      deleted: s.boolean("Always true once the server confirmed the deletion."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_directory",
    operationType: "write",
    description: "Create a remote directory, optionally creating missing parent directories.",
    inputSchema: s.object(
      "The remote directory to create.",
      {
        path: s.nonEmptyString(`Remote directory path. ${remotePathDescription}`),
        recursive: s.boolean(
          "Create missing parent directories and succeed when the directory already exists. Defaults to false.",
        ),
      },
      { optional: ["recursive"] },
    ),
    outputSchema: s.object("The created directory.", {
      path: s.string("The directory path, as given."),
      created: s.boolean("Whether a new directory was created; false when recursive found it already present."),
    }),
  }),
  defineProviderAction(service, {
    name: "rename",
    operationType: "write",
    description: "Rename or move a remote file or directory. Most servers refuse to replace an existing destination.",
    inputSchema: s.object("The remote path to rename and its new path.", {
      fromPath: s.nonEmptyString(`Existing remote path. ${remotePathDescription}`),
      toPath: s.nonEmptyString(`New remote path. ${remotePathDescription}`),
    }),
    outputSchema: s.object("The completed rename.", {
      fromPath: s.string("The original path, as given."),
      toPath: s.string("The new path, as given."),
    }),
  }),
  defineProviderAction(service, {
    name: "remove_directory",
    operationType: "destructive",
    description:
      "Remove a remote directory. Without recursive the directory must be empty; with recursive its whole content is deleted.",
    inputSchema: s.object(
      "The remote directory to remove.",
      {
        path: s.nonEmptyString(`Remote directory path. ${remotePathDescription}`),
        recursive: s.boolean("Delete every file and subdirectory inside the directory first. Defaults to false."),
      },
      { optional: ["recursive"] },
    ),
    outputSchema: s.object("The removed directory.", {
      path: s.string("The removed directory path, as given."),
      removed: s.boolean("Always true once the server confirmed the removal."),
    }),
  }),
];
