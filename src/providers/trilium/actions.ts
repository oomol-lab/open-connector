import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "trilium";

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const requireAnyField = (schema: JsonSchema, fields: readonly string[]): JsonSchema => ({
  ...schema,
  anyOf: fields.map((field) => ({ required: [field] })),
});
const entityIdSchema = s.string("A Trilium entity id containing 4 to 32 letters, digits, or underscores.", {
  minLength: 4,
  maxLength: 32,
  pattern: "^[a-zA-Z0-9_]{4,32}$",
});
const noteTypeSchema = s.stringEnum("The Trilium note type.", [
  "text",
  "code",
  "file",
  "image",
  "search",
  "book",
  "relationMap",
  "render",
]);
const mutableNoteTypeSchema = s.stringEnum("The updated Trilium note type.", [
  "text",
  "code",
  "render",
  "file",
  "image",
  "search",
  "relationMap",
  "book",
  "noteMap",
  "mermaid",
  "webView",
  "shortcut",
  "doc",
  "contentWidget",
  "launcher",
]);
const attributeTypeSchema = s.stringEnum("Whether this attribute is a label or relation.", ["label", "relation"]);

const attributeSchema = s.looseObject("A Trilium note attribute.", {
  attributeId: entityIdSchema,
  noteId: entityIdSchema,
  type: attributeTypeSchema,
  name: s.string("The attribute name."),
  value: s.string("The label value or related note id."),
  position: s.integer("The attribute ordering position."),
  isInheritable: s.boolean("Whether child notes inherit the attribute."),
  utcDateModified: s.string("The UTC modification time returned by Trilium."),
});

const noteSchema = s.looseObject("Trilium note metadata.", {
  noteId: entityIdSchema,
  title: s.string("The note title."),
  type: s.string("The note type returned by Trilium."),
  mime: s.string("The note MIME type."),
  isProtected: s.boolean("Whether the note is protected."),
  blobId: s.string("The content blob id used as a content hash."),
  attributes: s.array("Attributes attached to the note.", attributeSchema),
  parentNoteIds: s.array("Parent note ids.", entityIdSchema),
  childNoteIds: s.array("Child note ids.", entityIdSchema),
  parentBranchIds: s.array("Parent branch ids.", entityIdSchema),
  childBranchIds: s.array("Child branch ids.", entityIdSchema),
  dateCreated: s.string("The local note creation time."),
  dateModified: s.string("The local note modification time."),
  utcDateCreated: s.string("The UTC note creation time."),
  utcDateModified: s.string("The UTC note modification time."),
});

const branchSchema = s.looseObject("A Trilium branch placing a note in the note tree.", {
  branchId: entityIdSchema,
  noteId: entityIdSchema,
  parentNoteId: entityIdSchema,
  prefix: s.string("The branch-specific title prefix."),
  notePosition: s.integer("The note position under its parent."),
  isExpanded: s.boolean("Whether the branch is expanded in the note tree."),
  utcDateModified: s.string("The UTC modification time returned by Trilium."),
});

const attachmentSchema = s.looseObject("Trilium attachment metadata.", {
  attachmentId: entityIdSchema,
  ownerId: entityIdSchema,
  role: s.string("The attachment role."),
  mime: s.string("The attachment MIME type."),
  title: s.string("The attachment title or filename."),
  position: s.integer("The attachment ordering position."),
  blobId: s.string("The attachment blob id used as a content hash."),
  dateModified: s.string("The local modification time."),
  utcDateModified: s.string("The UTC modification time."),
  utcDateScheduledForErasureSince: s.string("The UTC time when erasure was scheduled."),
  contentLength: s.integer("The attachment content length in bytes."),
});

const searchNotes = defineProviderAction(service, {
  name: "search_notes",
  operationType: "read",
  description: "Search Trilium notes using full text, labels, subtree constraints, and ordering options.",
  requiredScopes: [],
  followUpActions: ["trilium.get_note"],
  inputSchema: s.object(
    "Input parameters for searching notes.",
    {
      search: nonEmptyString(
        "The Trilium search query, including full-text terms and label expressions such as #book.",
      ),
      fastSearch: s.boolean("Whether to skip note-content full-text matching for a faster search."),
      includeArchivedNotes: s.boolean("Whether archived notes should be included."),
      ancestorNoteId: entityIdSchema,
      ancestorDepth: nonEmptyString("A subtree depth expression such as eq1, lt4, or gt2."),
      orderBy: nonEmptyString("The note property or label used to order results."),
      orderDirection: s.stringEnum("The result ordering direction.", ["asc", "desc"]),
      limit: s.integer("The maximum number of results to return."),
      debug: s.boolean("Whether Trilium should include search parser debugging information."),
    },
    {
      optional: [
        "fastSearch",
        "includeArchivedNotes",
        "ancestorNoteId",
        "ancestorDepth",
        "orderBy",
        "orderDirection",
        "limit",
        "debug",
      ],
    },
  ),
  outputSchema: s.object(
    "The Trilium note search response.",
    {
      notes: s.array("The matching notes.", noteSchema),
      debugInfo: s.nullable(s.looseObject("Search parser debugging information when requested.")),
    },
    { required: ["notes", "debugInfo"] },
  ),
});

const createNote = defineProviderAction(service, {
  name: "create_note",
  operationType: "write",
  description: "Create a note and place it under a parent in the Trilium note tree.",
  requiredScopes: [],
  followUpActions: ["trilium.get_note", "trilium.create_attribute"],
  inputSchema: s.object(
    "Input parameters for creating a note.",
    {
      parentNoteId: entityIdSchema,
      title: s.string("The note title."),
      type: noteTypeSchema,
      content: s.string("The initial note content."),
      mime: nonEmptyString("The MIME type required for code, file, and image notes."),
      notePosition: s.integer("The note position under its parent."),
      prefix: s.string("The branch-specific title prefix."),
      isExpanded: s.boolean("Whether the new note should appear expanded."),
      noteId: entityIdSchema,
      dateCreated: nonEmptyString("A Trilium local timestamp overriding the creation time."),
      utcDateCreated: nonEmptyString("A Trilium UTC timestamp overriding the creation time."),
    },
    {
      optional: ["mime", "notePosition", "prefix", "isExpanded", "noteId", "dateCreated", "utcDateCreated"],
    },
  ),
  outputSchema: s.object(
    "The created Trilium note and its first branch.",
    {
      note: noteSchema,
      branch: branchSchema,
    },
    { required: ["note", "branch"] },
  ),
});

const getNote = defineProviderAction(service, {
  name: "get_note",
  operationType: "read",
  description: "Get Trilium note metadata by note id.",
  requiredScopes: [],
  followUpActions: ["trilium.get_note_content"],
  inputSchema: s.object(
    "Input parameters for reading note metadata.",
    {
      noteId: entityIdSchema,
    },
    { required: ["noteId"] },
  ),
  outputSchema: s.object(
    "The requested Trilium note metadata.",
    {
      note: noteSchema,
    },
    { required: ["note"] },
  ),
});

const updateNote = defineProviderAction(service, {
  name: "update_note",
  operationType: "write",
  description: "Update mutable metadata on a Trilium note.",
  requiredScopes: [],
  inputSchema: requireAnyField(
    s.object(
      "Input parameters for updating note metadata.",
      {
        noteId: entityIdSchema,
        title: nonEmptyString("The updated note title."),
        type: mutableNoteTypeSchema,
        mime: nonEmptyString("The updated note MIME type."),
        dateCreated: nonEmptyString("The updated local creation timestamp."),
        utcDateCreated: nonEmptyString("The updated UTC creation timestamp."),
      },
      { optional: ["title", "type", "mime", "dateCreated", "utcDateCreated"] },
    ),
    ["title", "type", "mime", "dateCreated", "utcDateCreated"],
  ),
  outputSchema: s.object(
    "The updated Trilium note metadata.",
    {
      note: noteSchema,
    },
    { required: ["note"] },
  ),
});

const deleteNote = defineProviderAction(service, {
  name: "delete_note",
  operationType: "destructive",
  description: "Delete a Trilium note and all of its placements from the note tree.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for deleting a note.",
    {
      noteId: entityIdSchema,
    },
    { required: ["noteId"] },
  ),
  outputSchema: s.object(
    "The note deletion result.",
    {
      deleted: s.boolean("Whether Trilium accepted the deletion."),
      noteId: entityIdSchema,
    },
    { required: ["deleted", "noteId"] },
  ),
});

const getNoteContent = defineProviderAction(service, {
  name: "get_note_content",
  operationType: "read",
  description: "Read the text content of a text-based Trilium note.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for reading text note content.",
    {
      noteId: entityIdSchema,
    },
    { required: ["noteId"] },
  ),
  outputSchema: s.object(
    "The text content returned by Trilium.",
    {
      noteId: entityIdSchema,
      content: s.string("The note content decoded as UTF-8 text."),
      mimeType: s.string("The MIME type returned by Trilium."),
    },
    { required: ["noteId", "content", "mimeType"] },
  ),
});

const updateNoteContent = defineProviderAction(service, {
  name: "update_note_content",
  operationType: "destructive",
  description: "Replace the text content of a text-based Trilium note.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for replacing text note content.",
    {
      noteId: entityIdSchema,
      content: s.string("The complete replacement note content."),
    },
    { required: ["noteId", "content"] },
  ),
  outputSchema: s.object(
    "The note content update result.",
    {
      updated: s.boolean("Whether Trilium accepted the content update."),
      noteId: entityIdSchema,
    },
    { required: ["updated", "noteId"] },
  ),
});

const createBranch = defineProviderAction(service, {
  name: "create_branch",
  operationType: "write",
  description: "Place an existing Trilium note under another parent, or update that placement if it exists.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for creating or replacing a note-tree branch.",
    {
      noteId: entityIdSchema,
      parentNoteId: entityIdSchema,
      notePosition: s.integer("The note position under its parent."),
      prefix: s.string("The branch-specific title prefix."),
      isExpanded: s.boolean("Whether the branch should appear expanded."),
    },
    { optional: ["notePosition", "prefix", "isExpanded"] },
  ),
  outputSchema: s.object(
    "The created or updated Trilium branch.",
    {
      branch: branchSchema,
    },
    { required: ["branch"] },
  ),
});

const getBranch = defineProviderAction(service, {
  name: "get_branch",
  operationType: "read",
  description: "Get a Trilium note-tree branch by branch id.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for reading a branch.",
    {
      branchId: entityIdSchema,
    },
    { required: ["branchId"] },
  ),
  outputSchema: s.object(
    "The requested Trilium branch.",
    {
      branch: branchSchema,
    },
    { required: ["branch"] },
  ),
});

const updateBranch = defineProviderAction(service, {
  name: "update_branch",
  operationType: "write",
  description: "Update the position, prefix, or expanded state of a Trilium branch.",
  requiredScopes: [],
  inputSchema: requireAnyField(
    s.object(
      "Input parameters for updating a branch.",
      {
        branchId: entityIdSchema,
        notePosition: s.integer("The updated note position."),
        prefix: s.string("The updated branch-specific title prefix."),
        isExpanded: s.boolean("The updated expanded state."),
      },
      { optional: ["notePosition", "prefix", "isExpanded"] },
    ),
    ["notePosition", "prefix", "isExpanded"],
  ),
  outputSchema: s.object(
    "The updated Trilium branch.",
    {
      branch: branchSchema,
    },
    { required: ["branch"] },
  ),
});

const deleteBranch = defineProviderAction(service, {
  name: "delete_branch",
  operationType: "destructive",
  description: "Delete a Trilium branch; deleting a note's final branch also deletes the note.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for deleting a branch.",
    {
      branchId: entityIdSchema,
    },
    { required: ["branchId"] },
  ),
  outputSchema: s.object(
    "The branch deletion result.",
    {
      deleted: s.boolean("Whether Trilium accepted the deletion."),
      branchId: entityIdSchema,
    },
    { required: ["deleted", "branchId"] },
  ),
});

const createAttributeInputSchema = s.object(
  "Input parameters for creating a note attribute.",
  {
    attributeId: entityIdSchema,
    noteId: entityIdSchema,
    type: attributeTypeSchema,
    name: nonEmptyString("The attribute name without whitespace."),
    value: s.string("The label value or target note id for a relation."),
    position: s.integer("The attribute ordering position."),
    isInheritable: s.boolean("Whether child notes inherit the attribute."),
  },
  { optional: ["value", "position", "isInheritable"] },
);
createAttributeInputSchema.allOf = [
  {
    if: { properties: { type: { const: "relation" } }, required: ["type"] },
    then: {
      required: ["value"],
      properties: { value: { type: "string", minLength: 1 } },
    },
  },
];

const createAttribute = defineProviderAction(service, {
  name: "create_attribute",
  operationType: "write",
  description: "Create a label or relation attribute on a Trilium note.",
  requiredScopes: [],
  inputSchema: createAttributeInputSchema,
  outputSchema: s.object(
    "The created Trilium attribute.",
    {
      attribute: attributeSchema,
    },
    { required: ["attribute"] },
  ),
});

const getAttribute = defineProviderAction(service, {
  name: "get_attribute",
  operationType: "read",
  description: "Get a Trilium label or relation attribute by attribute id.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for reading an attribute.",
    {
      attributeId: entityIdSchema,
    },
    { required: ["attributeId"] },
  ),
  outputSchema: s.object(
    "The requested Trilium attribute.",
    {
      attribute: attributeSchema,
    },
    { required: ["attribute"] },
  ),
});

const updateAttribute = defineProviderAction(service, {
  name: "update_attribute",
  operationType: "write",
  description: "Update the value or position of a Trilium label, or the position of a relation.",
  requiredScopes: [],
  inputSchema: requireAnyField(
    s.object(
      "Input parameters for updating an attribute.",
      {
        attributeId: entityIdSchema,
        value: s.string("The updated label value. Relations cannot change targets through this action."),
        position: s.integer("The updated attribute ordering position."),
      },
      { optional: ["value", "position"] },
    ),
    ["value", "position"],
  ),
  outputSchema: s.object(
    "The updated Trilium attribute.",
    {
      attribute: attributeSchema,
    },
    { required: ["attribute"] },
  ),
});

const deleteAttribute = defineProviderAction(service, {
  name: "delete_attribute",
  operationType: "destructive",
  description: "Delete a Trilium label or relation attribute.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for deleting an attribute.",
    {
      attributeId: entityIdSchema,
    },
    { required: ["attributeId"] },
  ),
  outputSchema: s.object(
    "The attribute deletion result.",
    {
      deleted: s.boolean("Whether Trilium accepted the deletion."),
      attributeId: entityIdSchema,
    },
    { required: ["deleted", "attributeId"] },
  ),
});

const listNoteAttachments = defineProviderAction(service, {
  name: "list_note_attachments",
  operationType: "read",
  description: "List attachment metadata owned by a Trilium note.",
  requiredScopes: [],
  followUpActions: ["trilium.get_attachment"],
  inputSchema: s.object(
    "Input parameters for listing note attachments.",
    {
      noteId: entityIdSchema,
    },
    { required: ["noteId"] },
  ),
  outputSchema: s.object(
    "The attachments owned by the note.",
    {
      attachments: s.array("The attachment metadata returned by Trilium.", attachmentSchema),
    },
    { required: ["attachments"] },
  ),
});

const uploadAttachment = defineProviderAction(service, {
  name: "upload_attachment",
  operationType: "write",
  description: "Download a public file URL and upload it as a Trilium note attachment.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for uploading a Trilium attachment from a URL.",
    {
      ownerId: entityIdSchema,
      fileUrl: nonEmptyString("The public HTTP or HTTPS URL of the file to upload."),
      role: nonEmptyString("The Trilium attachment role, such as file or image."),
      mime: nonEmptyString("The attachment MIME type. When omitted, the source response type is used."),
      title: nonEmptyString("The attachment title or filename."),
      position: s.integer("The attachment ordering position."),
    },
    { optional: ["mime", "position"] },
  ),
  outputSchema: s.object(
    "The uploaded Trilium attachment metadata.",
    {
      attachment: attachmentSchema,
    },
    { required: ["attachment"] },
  ),
});

const getAttachment = defineProviderAction(service, {
  name: "get_attachment",
  operationType: "read",
  description: "Get Trilium attachment metadata by attachment id.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for reading attachment metadata.",
    {
      attachmentId: entityIdSchema,
    },
    { required: ["attachmentId"] },
  ),
  outputSchema: s.object(
    "The requested Trilium attachment metadata.",
    {
      attachment: attachmentSchema,
    },
    { required: ["attachment"] },
  ),
});

const updateAttachment = defineProviderAction(service, {
  name: "update_attachment",
  operationType: "write",
  description: "Update mutable metadata on a Trilium attachment.",
  requiredScopes: [],
  inputSchema: requireAnyField(
    s.object(
      "Input parameters for updating attachment metadata.",
      {
        attachmentId: entityIdSchema,
        role: nonEmptyString("The updated attachment role."),
        mime: nonEmptyString("The updated attachment MIME type."),
        title: nonEmptyString("The updated attachment title or filename."),
        position: s.integer("The updated attachment ordering position."),
      },
      { optional: ["role", "mime", "title", "position"] },
    ),
    ["role", "mime", "title", "position"],
  ),
  outputSchema: s.object(
    "The updated Trilium attachment metadata.",
    {
      attachment: attachmentSchema,
    },
    { required: ["attachment"] },
  ),
});

const deleteAttachment = defineProviderAction(service, {
  name: "delete_attachment",
  operationType: "destructive",
  description: "Delete a Trilium attachment.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input parameters for deleting an attachment.",
    {
      attachmentId: entityIdSchema,
    },
    { required: ["attachmentId"] },
  ),
  outputSchema: s.object(
    "The attachment deletion result.",
    {
      deleted: s.boolean("Whether Trilium accepted the deletion."),
      attachmentId: entityIdSchema,
    },
    { required: ["deleted", "attachmentId"] },
  ),
});

export const triliumActions: readonly ActionDefinition[] = [
  searchNotes,
  createNote,
  getNote,
  updateNote,
  deleteNote,
  getNoteContent,
  updateNoteContent,
  createBranch,
  getBranch,
  updateBranch,
  deleteBranch,
  createAttribute,
  getAttribute,
  updateAttribute,
  deleteAttribute,
  listNoteAttachments,
  uploadAttachment,
  getAttachment,
  updateAttachment,
  deleteAttachment,
];
