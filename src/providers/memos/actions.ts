import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "memos";

const memoNameSchema = s.string("The Memos memo resource name in the format memos/{memo}.", {
  minLength: 7,
});
const attachmentNameSchema = s.string("The Memos attachment resource name in the format attachments/{attachment}.", {
  minLength: 13,
});
const userNameSchema = s.string("The Memos user resource name in the format users/{user}.", {
  minLength: 7,
});
const visibilitySchema = s.stringEnum("The memo visibility.", ["PRIVATE", "PROTECTED", "PUBLIC"]);
const memoStateSchema = s.stringEnum("The memo state.", ["NORMAL", "ARCHIVED"]);
const locationSchema = s.looseObject("A geographic location attached to a memo.", {
  placeholder: s.string("The location label."),
  latitude: s.number("The latitude in decimal degrees."),
  longitude: s.number("The longitude in decimal degrees."),
});
const locationInputSchema = s.object(
  "A geographic location to attach to a memo.",
  {
    placeholder: s.string("The location label."),
    latitude: s.number("The latitude in decimal degrees."),
    longitude: s.number("The longitude in decimal degrees."),
  },
  { optional: ["placeholder", "latitude", "longitude"] },
);
const attachmentSchema = s.looseObject("Memos attachment metadata.", {
  name: attachmentNameSchema,
  createTime: s.dateTime("The attachment creation time."),
  filename: s.string("The attachment filename."),
  externalLink: s.string("The external storage URL when returned by Memos."),
  type: s.string("The attachment MIME type."),
  size: s.string("The attachment size in bytes, encoded as a string by the Memos API."),
  memo: memoNameSchema,
});
const memoSchema = s.looseObject("A Memos memo resource.", {
  name: memoNameSchema,
  state: s.string("The memo state returned by Memos."),
  creator: userNameSchema,
  createTime: s.dateTime("The memo creation time."),
  updateTime: s.dateTime("The memo update time."),
  content: s.string("The memo Markdown content."),
  visibility: s.string("The memo visibility returned by Memos."),
  tags: s.array("Tags extracted from the memo content.", s.string("An extracted memo tag.")),
  pinned: s.boolean("Whether the memo is pinned."),
  attachments: s.array("Attachments associated with the memo.", attachmentSchema),
  parent: memoNameSchema,
  snippet: s.string("A plain-text preview of the memo content."),
  location: locationSchema,
  property: s.looseObject("Computed memo properties."),
});
const userSchema = s.looseObject(
  {
    name: userNameSchema,
    role: s.string("The user role returned by Memos."),
    username: s.string("The unique Memos username."),
    email: s.string("The user's email address."),
    displayName: s.string("The user's display name."),
    avatarUrl: s.string("The user's avatar URL."),
    description: s.string("The user's profile description."),
    state: s.string("The user state returned by Memos."),
    createTime: s.dateTime("The user creation time."),
    updateTime: s.dateTime("The user update time."),
  },
  { description: "A Memos user resource." },
);
const pageSizeSchema = s.positiveInteger("The maximum number of resources to return.", {
  maximum: 1000,
});
const pageTokenSchema = s.string("The continuation token returned by a previous list action.", {
  minLength: 1,
});
const nextPageTokenSchema = s.nullable(
  s.string("The continuation token for the next page, or null when no next page exists."),
);

const createMemo = defineProviderAction(service, {
  name: "create_memo",
  operationType: "write",
  description: "Create a Markdown memo on the connected Memos instance.",
  requiredScopes: [],
  followUpActions: ["memos.get_memo", "memos.upload_attachment"],
  inputSchema: s.object(
    "Input parameters for creating a memo.",
    {
      content: s.string("The memo content in Markdown format.", { minLength: 1 }),
      visibility: visibilitySchema,
      memoId: s.string("An optional caller-selected memo ID.", { minLength: 1, maxLength: 36 }),
      createTime: s.dateTime("An optional creation time for imported content."),
      pinned: s.boolean("Whether the new memo should be pinned."),
      location: locationInputSchema,
    },
    { optional: ["visibility", "memoId", "createTime", "pinned", "location"] },
  ),
  outputSchema: s.object(
    "The created memo response.",
    {
      memo: memoSchema,
    },
    { required: ["memo"] },
  ),
});

const listMemos = defineProviderAction(service, {
  name: "list_memos",
  operationType: "read",
  description: "List memos with pagination, state selection, ordering, and CEL filtering.",
  requiredScopes: [],
  followUpActions: ["memos.get_memo"],
  inputSchema: s.object(
    "Input parameters for listing memos.",
    {
      pageSize: pageSizeSchema,
      pageToken: pageTokenSchema,
      state: memoStateSchema,
      orderBy: s.string("The AIP-132 ordering expression, such as pinned desc, create_time desc.", {
        minLength: 1,
      }),
      filter: s.string(
        "The Memos CEL filter expression, including content, creator, visibility, tags, timestamps, and computed properties.",
        { minLength: 1 },
      ),
      showDeleted: s.boolean("Whether deleted memos should be included."),
    },
    { optional: ["pageSize", "pageToken", "state", "orderBy", "filter", "showDeleted"] },
  ),
  outputSchema: s.object(
    "A page of Memos memo resources.",
    {
      memos: s.array("The memos returned by the instance.", memoSchema),
      nextPageToken: nextPageTokenSchema,
    },
    { required: ["memos", "nextPageToken"] },
  ),
});

const getMemo = defineProviderAction(service, {
  name: "get_memo",
  operationType: "read",
  description: "Retrieve one memo by its Memos resource name.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for reading a memo.",
    {
      name: memoNameSchema,
    },
    { required: ["name"] },
  ),
  outputSchema: s.object(
    "The memo response.",
    {
      memo: memoSchema,
    },
    { required: ["memo"] },
  ),
});

const updateMemoFields = ["content", "visibility", "pinned", "state", "createTime", "location"];
const updateMemoInputSchema: JsonSchema = s.object(
  "Input parameters for updating selected memo fields.",
  {
    name: memoNameSchema,
    content: s.string("The replacement memo content."),
    visibility: visibilitySchema,
    pinned: s.boolean("Whether the memo should be pinned."),
    state: memoStateSchema,
    createTime: s.dateTime("The replacement memo creation time."),
    location: s.nullable(locationInputSchema),
  },
  { optional: updateMemoFields },
);
updateMemoInputSchema.anyOf = updateMemoFields.map((field) => ({ required: [field] }));

const updateMemo = defineProviderAction(service, {
  name: "update_memo",
  operationType: "write",
  description: "Update selected content, visibility, pin, state, time, or location fields on a memo.",
  requiredScopes: [],
  followUpActions: ["memos.get_memo"],
  inputSchema: updateMemoInputSchema,
  outputSchema: s.object(
    "The updated memo response.",
    {
      memo: memoSchema,
    },
    { required: ["memo"] },
  ),
});

const deleteMemo = defineProviderAction(service, {
  name: "delete_memo",
  operationType: "destructive",
  description: "Delete one memo, optionally forcing deletion when associated data exists.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for deleting a memo.",
    {
      name: memoNameSchema,
      force: s.boolean("Whether to force deletion when the memo has associated data."),
    },
    { optional: ["force"] },
  ),
  outputSchema: s.object(
    "The memo deletion result.",
    {
      deleted: s.boolean("Whether Memos accepted the deletion."),
      name: memoNameSchema,
    },
    { required: ["deleted", "name"] },
  ),
});

const uploadAttachment = defineProviderAction(service, {
  name: "upload_attachment",
  operationType: "write",
  description: "Download a public file URL and upload its bytes to the connected Memos instance.",
  requiredScopes: [],
  followUpActions: ["memos.get_attachment"],
  inputSchema: s.object(
    "Input parameters for uploading an attachment from a URL.",
    {
      fileUrl: s.url("The public HTTP or HTTPS URL of the file to upload."),
      filename: s.string("The filename to store in Memos.", { minLength: 1 }),
      type: s.string("The MIME type; inferred from the download response when omitted.", {
        minLength: 1,
      }),
      memo: memoNameSchema,
      attachmentId: s.string("An optional caller-selected attachment ID.", {
        minLength: 1,
        maxLength: 36,
      }),
    },
    { optional: ["type", "memo", "attachmentId"] },
  ),
  outputSchema: s.object(
    "The uploaded attachment response.",
    {
      attachment: attachmentSchema,
    },
    { required: ["attachment"] },
  ),
});

const listAttachments = defineProviderAction(service, {
  name: "list_attachments",
  operationType: "read",
  description: "List attachment metadata with pagination, filtering, and ordering.",
  requiredScopes: [],
  followUpActions: ["memos.get_attachment"],
  inputSchema: s.object(
    "Input parameters for listing attachments.",
    {
      pageSize: pageSizeSchema,
      pageToken: pageTokenSchema,
      filter: s.string("The Memos attachment filter expression.", { minLength: 1 }),
      orderBy: s.string("The attachment ordering expression, such as create_time desc.", {
        minLength: 1,
      }),
    },
    { optional: ["pageSize", "pageToken", "filter", "orderBy"] },
  ),
  outputSchema: s.object(
    "A page of Memos attachment metadata.",
    {
      attachments: s.array("The attachments returned by Memos.", attachmentSchema),
      nextPageToken: nextPageTokenSchema,
    },
    { required: ["attachments", "nextPageToken"] },
  ),
});

const getAttachment = defineProviderAction(service, {
  name: "get_attachment",
  operationType: "read",
  description: "Retrieve one attachment's metadata by resource name.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for reading an attachment.",
    {
      name: attachmentNameSchema,
    },
    { required: ["name"] },
  ),
  outputSchema: s.object(
    "The attachment metadata response.",
    {
      attachment: attachmentSchema,
    },
    { required: ["attachment"] },
  ),
});

const deleteAttachment = defineProviderAction(service, {
  name: "delete_attachment",
  operationType: "destructive",
  description: "Delete one attachment by resource name.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for deleting an attachment.",
    {
      name: attachmentNameSchema,
    },
    { required: ["name"] },
  ),
  outputSchema: s.object(
    "The attachment deletion result.",
    {
      deleted: s.boolean("Whether Memos accepted the deletion."),
      name: attachmentNameSchema,
    },
    { required: ["deleted", "name"] },
  ),
});

const listMemoAttachments = defineProviderAction(service, {
  name: "list_memo_attachments",
  operationType: "read",
  description: "List attachments associated with one memo.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for listing a memo's attachments.",
    {
      name: memoNameSchema,
      pageSize: pageSizeSchema,
      pageToken: pageTokenSchema,
    },
    { optional: ["pageSize", "pageToken"] },
  ),
  outputSchema: s.object(
    "A page of attachments associated with the memo.",
    {
      attachments: s.array("The memo attachments returned by Memos.", attachmentSchema),
      nextPageToken: nextPageTokenSchema,
    },
    { required: ["attachments", "nextPageToken"] },
  ),
});

const setMemoAttachments = defineProviderAction(service, {
  name: "set_memo_attachments",
  operationType: "destructive",
  description: "Replace the complete attachment set associated with one memo.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for replacing a memo's attachment set.",
    {
      name: memoNameSchema,
      attachmentNames: s.array(
        "The complete desired list of attachment resource names; use an empty array to clear all attachments.",
        attachmentNameSchema,
      ),
    },
    { required: ["name", "attachmentNames"] },
  ),
  outputSchema: s.object(
    "The memo attachment replacement result.",
    {
      updated: s.boolean("Whether Memos accepted the attachment replacement."),
      name: memoNameSchema,
      attachmentNames: s.array("The attachment resource names sent to Memos.", attachmentNameSchema),
    },
    { required: ["updated", "name", "attachmentNames"] },
  ),
});

const getCurrentUser = defineProviderAction(service, {
  name: "get_current_user",
  operationType: "read",
  description: "Retrieve the Memos user associated with the connected personal access token.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for reading the current Memos user.", {}),
  outputSchema: s.object(
    "The current Memos user response.",
    {
      user: userSchema,
    },
    { required: ["user"] },
  ),
});

const listUsers = defineProviderAction(service, {
  name: "list_users",
  operationType: "read",
  description: "List users visible to the connected Memos account.",
  requiredScopes: [],
  followUpActions: ["memos.get_user"],
  inputSchema: s.object(
    "Input parameters for listing Memos users.",
    {
      pageSize: pageSizeSchema,
      pageToken: pageTokenSchema,
      filter: s.string("The user filter expression; Memos v0.29 supports username equality.", {
        minLength: 1,
      }),
      showDeleted: s.boolean("Whether deleted users should be included."),
    },
    { optional: ["pageSize", "pageToken", "filter", "showDeleted"] },
  ),
  outputSchema: s.object(
    "A page of Memos users.",
    {
      users: s.array("The users returned by Memos.", userSchema),
      nextPageToken: nextPageTokenSchema,
    },
    { required: ["users", "nextPageToken"] },
  ),
});

const getUser = defineProviderAction(service, {
  name: "get_user",
  operationType: "read",
  description: "Retrieve one Memos user by resource name.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for reading a Memos user.",
    {
      name: userNameSchema,
      readMask: s.string("An optional comma-separated field mask for the user response.", {
        minLength: 1,
      }),
    },
    { optional: ["readMask"] },
  ),
  outputSchema: s.object(
    "The Memos user response.",
    {
      user: userSchema,
    },
    { required: ["user"] },
  ),
});

export const memosActions: ActionDefinition[] = [
  createMemo,
  listMemos,
  getMemo,
  updateMemo,
  deleteMemo,
  uploadAttachment,
  listAttachments,
  getAttachment,
  deleteAttachment,
  listMemoAttachments,
  setMemoAttachments,
  getCurrentUser,
  listUsers,
  getUser,
];
