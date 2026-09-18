import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fast_note_sync";

const emptyInputSchema = s.object("No input parameters are required.", {});
const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });

const userSchema = s.looseObject("An authenticated FNS user.", {
  uid: s.integer("The FNS user id."),
  username: s.string("The FNS username."),
  email: s.string("The user's email address."),
  avatar: s.string("The user's avatar URL or handle."),
  tokenId: s.integer("The active authentication token id."),
  createdAt: s.string("The account creation time."),
  updatedAt: s.string("The account update time."),
});

const vaultSchema = s.looseObject("An FNS note vault.", {
  id: s.integer("The vault id."),
  vault: s.string("The vault name."),
  noteCount: s.integer("The number of notes in the vault."),
  noteSize: s.integer("The total note size in bytes."),
  fileCount: s.integer("The number of attachments in the vault."),
  fileSize: s.integer("The total attachment size in bytes."),
  size: s.integer("The total vault size in bytes."),
  createdAt: s.string("The vault creation time."),
  updatedAt: s.string("The vault update time."),
});

const noteSummarySchema = s.looseObject("FNS note metadata without note content.", {
  id: s.integer("The note id."),
  path: s.string("The note path."),
  pathHash: s.string("The hash of the note path."),
  contentHash: s.string("The hash of the note content."),
  version: s.integer("The note version."),
  ctime: s.integer("The note creation timestamp."),
  mtime: s.integer("The note modification timestamp."),
  size: s.integer("The note size in bytes."),
  lastTime: s.integer("The note record update timestamp."),
  createdAt: s.string("The note record creation time."),
  updatedAt: s.string("The note record update time."),
});

const noteSchema = s.looseObject("An FNS note with content and metadata.", {
  id: s.integer("The note id when returned by the endpoint."),
  path: s.string("The note path."),
  pathHash: s.string("The hash of the note path."),
  content: s.string("The Markdown note content."),
  contentHash: s.string("The hash of the note content."),
  fileLinks: s.record(
    "Attachment links found in the note, keyed by the source link.",
    s.string("The resolved attachment path."),
  ),
  version: s.integer("The note version."),
  ctime: s.integer("The note creation timestamp."),
  mtime: s.integer("The note modification timestamp."),
  size: s.integer("The note size in bytes when returned by the endpoint."),
  lastTime: s.integer("The note record update timestamp."),
  createdAt: s.string("The note record creation time."),
  updatedAt: s.string("The note record update time."),
});

const attachmentSchema = s.looseObject("FNS attachment metadata.", {
  id: s.integer("The attachment id."),
  path: s.string("The attachment path."),
  pathHash: s.string("The hash of the attachment path."),
  contentHash: s.string("The hash of the attachment content."),
  rename: s.integer("The attachment rename flag."),
  ctime: s.integer("The attachment creation timestamp."),
  mtime: s.integer("The attachment modification timestamp."),
  size: s.integer("The attachment size in bytes."),
  lastTime: s.integer("The attachment record update timestamp."),
  createdAt: s.string("The attachment record creation time."),
  updatedAt: s.string("The attachment record update time."),
});

const paginationSchema = s.object(
  "Pagination information returned by FNS.",
  {
    page: s.integer("The current one-based page number."),
    pageSize: s.integer("The requested number of records per page."),
    totalRows: s.integer("The total number of matching records."),
  },
  { required: ["page", "pageSize", "totalRows"] },
);

const paginationInputFields = {
  page: s.integer("The one-based page number.", { minimum: 1 }),
  pageSize: s.integer("The number of records per page, up to 100.", {
    minimum: 1,
    maximum: 100,
  }),
};

const noteListFilterFields = {
  isRecycle: s.boolean("Whether to return notes from the recycle bin."),
  sortBy: nonEmptyString("The documented FNS note field used for sorting."),
  sortOrder: s.stringEnum("The sort direction.", ["asc", "desc"]),
};

const attachmentListFilterFields = {
  keyword: nonEmptyString("A keyword used to filter attachment paths."),
  isRecycle: s.boolean("Whether to return attachments from the recycle bin."),
  sortBy: nonEmptyString("The documented FNS attachment field used for sorting."),
  sortOrder: s.stringEnum("The sort direction.", ["asc", "desc"]),
};

const getCurrentUser = defineProviderAction(service, {
  name: "get_current_user",
  operationType: "read",
  description: "Get the user associated with the connected FNS API token.",
  requiredScopes: [],
  inputSchema: emptyInputSchema,
  outputSchema: s.object(
    "The authenticated FNS user response.",
    {
      user: userSchema,
    },
    { required: ["user"] },
  ),
});

const listVaults = defineProviderAction(service, {
  name: "list_vaults",
  operationType: "read",
  description: "List every note vault owned by the authenticated FNS user.",
  requiredScopes: [],
  inputSchema: emptyInputSchema,
  outputSchema: s.object(
    "The authenticated user's FNS vaults.",
    {
      vaults: s.array("The vaults returned by FNS.", vaultSchema),
    },
    { required: ["vaults"] },
  ),
});

const getVault = defineProviderAction(service, {
  name: "get_vault",
  operationType: "read",
  description: "Get one FNS vault by its numeric id.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for retrieving one vault.",
    {
      id: s.integer("The vault id.", { minimum: 1 }),
    },
    { required: ["id"] },
  ),
  outputSchema: s.object(
    "The requested FNS vault.",
    {
      vault: vaultSchema,
    },
    { required: ["vault"] },
  ),
});

const upsertVault = defineProviderAction(service, {
  name: "upsert_vault",
  operationType: "write",
  description: "Create an FNS vault or update an existing vault when its id is provided.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for creating or updating a vault.",
    {
      id: s.integer("The existing vault id to update.", { minimum: 1 }),
      vault: nonEmptyString("The vault name."),
    },
    { optional: ["id"] },
  ),
  outputSchema: s.object(
    "The created or updated FNS vault.",
    {
      vault: vaultSchema,
    },
    { required: ["vault"] },
  ),
});

const deleteVault = defineProviderAction(service, {
  name: "delete_vault",
  operationType: "destructive",
  description: "Permanently delete an FNS vault and all notes and attachments it contains.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for deleting one vault.",
    {
      id: s.integer("The vault id to delete.", { minimum: 1 }),
    },
    { required: ["id"] },
  ),
  outputSchema: s.object(
    "The vault deletion result.",
    {
      deleted: s.boolean("Whether FNS accepted the vault deletion."),
    },
    { required: ["deleted"] },
  ),
});

const listNotes = defineProviderAction(service, {
  name: "list_notes",
  operationType: "read",
  description: "List note metadata in an FNS vault with pagination and sorting.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for listing notes.",
    {
      vault: nonEmptyString("The vault name."),
      ...paginationInputFields,
      ...noteListFilterFields,
    },
    { optional: ["page", "pageSize", "isRecycle", "sortBy", "sortOrder"] },
  ),
  outputSchema: s.object(
    "A page of FNS note metadata.",
    {
      notes: s.array("The note metadata returned by FNS.", noteSummarySchema),
      pagination: paginationSchema,
    },
    { required: ["notes", "pagination"] },
  ),
});

const searchNotes = defineProviderAction(service, {
  name: "search_notes",
  operationType: "read",
  description: "Search note paths or note content in an FNS vault.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for searching notes.",
    {
      vault: nonEmptyString("The vault name."),
      query: nonEmptyString("The search text."),
      field: s.stringEnum("Whether to search note paths or note content.", ["path", "content"]),
      ...paginationInputFields,
      isRecycle: noteListFilterFields.isRecycle,
      sortBy: noteListFilterFields.sortBy,
      sortOrder: noteListFilterFields.sortOrder,
    },
    { optional: ["page", "pageSize", "isRecycle", "sortBy", "sortOrder"] },
  ),
  outputSchema: s.object(
    "A page of matching FNS note metadata.",
    {
      notes: s.array("The note metadata matching the search.", noteSummarySchema),
      pagination: paginationSchema,
    },
    { required: ["notes", "pagination"] },
  ),
});

const getNote = defineProviderAction(service, {
  name: "get_note",
  operationType: "read",
  description: "Get one FNS note's Markdown content and metadata by path.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for retrieving one note.",
    {
      vault: nonEmptyString("The vault name."),
      path: nonEmptyString("The note path."),
      isRecycle: s.boolean("Whether to read the note from the recycle bin."),
    },
    { optional: ["isRecycle"] },
  ),
  outputSchema: s.object(
    "The requested FNS note.",
    {
      note: noteSchema,
    },
    { required: ["note"] },
  ),
});

const upsertNote = defineProviderAction(service, {
  name: "upsert_note",
  operationType: "destructive",
  description: "Create an FNS note or replace the content of an existing note at the same path.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for creating or updating a note.",
    {
      vault: nonEmptyString("The vault name."),
      path: nonEmptyString("The note path."),
      content: s.string("The Markdown note content."),
      createOnly: s.boolean("Whether the request must fail when the note already exists."),
      ctime: s.integer("An optional FNS creation timestamp."),
      mtime: s.integer("An optional FNS modification timestamp."),
    },
    { optional: ["content", "createOnly", "ctime", "mtime"] },
  ),
  outputSchema: s.object(
    "The created or updated FNS note metadata.",
    {
      note: noteSchema,
    },
    { required: ["note"] },
  ),
});

const deleteNote = defineProviderAction(service, {
  name: "delete_note",
  operationType: "destructive",
  description: "Move one FNS note to the recycle bin.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for deleting one note.",
    {
      vault: nonEmptyString("The vault name."),
      path: nonEmptyString("The note path."),
    },
    { required: ["vault", "path"] },
  ),
  outputSchema: s.object(
    "The note deletion result.",
    {
      deleted: s.boolean("Whether FNS accepted the note deletion."),
      note: noteSchema,
    },
    { required: ["deleted", "note"] },
  ),
});

const listAttachments = defineProviderAction(service, {
  name: "list_attachments",
  operationType: "read",
  description: "List attachment metadata in an FNS vault with search, pagination, and sorting.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for listing attachments.",
    {
      vault: nonEmptyString("The vault name."),
      ...paginationInputFields,
      ...attachmentListFilterFields,
    },
    {
      optional: ["page", "pageSize", "keyword", "isRecycle", "sortBy", "sortOrder"],
    },
  ),
  outputSchema: s.object(
    "A page of FNS attachment metadata.",
    {
      attachments: s.array("The attachment metadata returned by FNS.", attachmentSchema),
      pagination: paginationSchema,
    },
    { required: ["attachments", "pagination"] },
  ),
});

const uploadAttachment = defineProviderAction(service, {
  name: "upload_attachment",
  operationType: "write",
  description: "Download a public file URL and upload it as an attachment to an FNS vault.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for uploading one attachment.",
    {
      vault: nonEmptyString("The vault name."),
      path: nonEmptyString("The attachment path inside the vault."),
      fileUrl: s.url("The public HTTP or HTTPS URL of the file to upload."),
      mimeType: nonEmptyString("The MIME type to send for the attachment."),
      ctime: s.integer("An optional creation timestamp in milliseconds."),
      mtime: s.integer("An optional modification timestamp in milliseconds."),
    },
    { optional: ["mimeType", "ctime", "mtime"] },
  ),
  outputSchema: s.object(
    "The uploaded FNS attachment metadata.",
    {
      attachment: attachmentSchema,
    },
    { required: ["attachment"] },
  ),
});

const downloadAttachment = defineProviderAction(service, {
  name: "download_attachment",
  operationType: "read",
  description: "Download an FNS attachment into connector file transit and return its transit URL.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for downloading one attachment.",
    {
      vault: nonEmptyString("The vault name."),
      path: nonEmptyString("The attachment path."),
      isRecycle: s.boolean("Whether to download the attachment from the recycle bin."),
    },
    { optional: ["isRecycle"] },
  ),
  outputSchema: s.object(
    "The downloadable connector transit file.",
    {
      attachment: s.object(
        "The downloaded attachment in connector file transit.",
        {
          name: s.string("The attachment file name."),
          mimeType: s.string("The attachment MIME type."),
          fileId: s.nonEmptyString("The local transit file identifier."),
          downloadUrl: s.url("The local transit download URL."),
          sizeBytes: s.nonNegativeInteger("The local transit file size in bytes."),
        },
        { required: ["name", "mimeType", "fileId", "downloadUrl", "sizeBytes"] },
      ),
    },
    { required: ["attachment"] },
  ),
});

const deleteAttachment = defineProviderAction(service, {
  name: "delete_attachment",
  operationType: "destructive",
  description: "Permanently delete one FNS attachment by path and path hash.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for deleting one attachment.",
    {
      vault: nonEmptyString("The vault name."),
      path: nonEmptyString("The attachment path."),
      pathHash: nonEmptyString("The attachment path hash returned by FNS."),
    },
    { required: ["vault", "path", "pathHash"] },
  ),
  outputSchema: s.object(
    "The attachment deletion result.",
    {
      deleted: s.boolean("Whether FNS accepted the attachment deletion."),
      attachment: attachmentSchema,
    },
    { required: ["deleted", "attachment"] },
  ),
});

export const fastNoteSyncActions: ActionDefinition[] = [
  getCurrentUser,
  listVaults,
  getVault,
  upsertVault,
  deleteVault,
  listNotes,
  searchNotes,
  getNote,
  upsertNote,
  deleteNote,
  listAttachments,
  uploadAttachment,
  downloadAttachment,
  deleteAttachment,
];
