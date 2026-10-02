import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const id = s.nonEmptyString("The Dynalist ID.");
const position = s.integer("The zero-based position; -1 appends at the end.", { minimum: -1 });
const nodeFields = {
  content: s.string("The node title."),
  note: s.string("The node note."),
  checked: s.boolean("Whether the node is checked."),
  checkbox: s.boolean("Whether the node has a checkbox."),
  heading: s.integer("The heading level; 0 disables headings.", { minimum: 0, maximum: 3 }),
  color: s.integer("The color label; 0 removes the label.", { minimum: 0, maximum: 6 }),
};
const optionalNodeFields = Object.keys(nodeFields);
const envelope = {
  _code: s.string("The Dynalist result code; OK indicates success."),
  _msg: s.string("The Dynalist result message."),
};
const fileType = s.stringEnum("The file type.", ["document", "folder"]);
const fileChange = s.union(
  [
    s.object(
      "Create a document or folder.",
      {
        action: s.literal("create", { description: "The change operation." }),
        type: fileType,
        parent_id: id,
        index: position,
        title: s.string("The file title."),
      },
      { optional: ["title"] },
    ),
    s.object(
      "Rename a document or folder.",
      {
        action: s.literal("edit", { description: "The change operation." }),
        type: fileType,
        file_id: id,
        title: s.string("The file title."),
      },
      { optional: [] },
    ),
    s.object(
      "Move a document or folder.",
      {
        action: s.literal("move", { description: "The change operation." }),
        type: fileType,
        file_id: id,
        parent_id: id,
        index: position,
      },
      { optional: [] },
    ),
  ],
  { description: "A file change." },
);
const nodeChange = s.union(
  [
    s.object(
      "Insert a node.",
      {
        action: s.literal("insert", { description: "The change operation." }),
        parent_id: id,
        index: position,
        ...nodeFields,
      },
      { optional: optionalNodeFields.filter((key) => key !== "content") },
    ),
    s.object(
      "Edit a node.",
      {
        action: s.literal("edit", { description: "The change operation." }),
        node_id: id,
        ...nodeFields,
      },
      { optional: optionalNodeFields },
    ),
    s.object(
      "Move a node.",
      {
        action: s.literal("move", { description: "The change operation." }),
        node_id: id,
        parent_id: id,
        index: position,
      },
      { optional: [] },
    ),
    s.object(
      "Delete a node.",
      {
        action: s.literal("delete", { description: "The change operation." }),
        node_id: id,
      },
      { optional: [] },
    ),
  ],
  { description: "A node change." },
);
const preferenceKey = s.stringEnum("The preference key.", ["inbox_location", "inbox_move_position"]);
const results = s.array(
  "Whether each requested change succeeded, in request order.",
  s.boolean("Whether this change succeeded."),
);
export const dynalistActions: ActionDefinition[] = [
  defineProviderAction("dynalist", {
    name: "list_files",
    description: "List all Dynalist documents and folders.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object("The request parameters.", {}, { optional: [] }),
    outputSchema: s.looseObject("The Dynalist response.", {
      ...envelope,
      root_file_id: id,
      files: s.array(
        "The documents and folders.",
        s.looseObject("A document or folder.", {
          id,
          title: s.string("The file title."),
          type: fileType,
          permission: s.integer("The permission level: 0 none, 1 read, 2 edit, 3 manage, 4 owner."),
          collapsed: s.boolean("Whether the folder is collapsed."),
          children: s.array("The child IDs.", id),
        }),
      ),
    }),
  }),
  defineProviderAction("dynalist", {
    name: "edit_files",
    description:
      "Create, rename, or move Dynalist documents and folders in a batch. Inspect results for partial failures.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "The request parameters.",
      {
        changes: s.array("The changes in execution order.", fileChange, { minItems: 1 }),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject("The Dynalist response.", {
      ...envelope,
      results,
      created: s.array("The successfully created file IDs in request order.", id),
    }),
  }),
  defineProviderAction("dynalist", {
    name: "read_document",
    description: "Read a Dynalist document and its nodes.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object("The request parameters.", { file_id: id }, { optional: [] }),
    outputSchema: s.looseObject("The Dynalist response.", {
      ...envelope,
      file_id: id,
      title: s.string("The file title."),
      version: s.integer("The document version."),
      nodes: s.array(
        "The document nodes.",
        s.looseObject("A document node.", {
          id,
          ...nodeFields,
          children: s.array("The child IDs.", id),
          created: s.integer("The creation time in Unix milliseconds."),
          modified: s.integer("The modification time in Unix milliseconds."),
          collapsed: s.boolean("Whether the node is collapsed."),
        }),
      ),
    }),
  }),
  defineProviderAction("dynalist", {
    name: "check_for_updates",
    description: "Get Dynalist document versions. Inaccessible or missing documents are omitted.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "The request parameters.",
      {
        file_ids: s.array("The document IDs to check.", id),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject("The Dynalist response.", {
      ...envelope,
      versions: s.record("Document IDs mapped to current versions.", s.integer("The document version.")),
    }),
  }),
  defineProviderAction("dynalist", {
    name: "edit_document",
    description: "Insert, edit, move, or delete Dynalist nodes in a batch. Content edits replace the supplied fields.",
    operationType: "destructive",
    requiredScopes: [],
    inputSchema: s.object(
      "The request parameters.",
      {
        file_id: id,
        changes: s.array("The changes in execution order.", nodeChange, { minItems: 1 }),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject("The Dynalist response.", {
      ...envelope,
      results,
      new_node_ids: s.array("The newly inserted node IDs in request order.", id),
    }),
  }),
  defineProviderAction("dynalist", {
    name: "add_to_inbox",
    description: "Add a node to the configured Dynalist inbox. Configure an inbox before calling this action.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.object(
      "The request parameters.",
      { index: position, ...nodeFields },
      { optional: ["index", ...optionalNodeFields] },
    ),
    outputSchema: s.looseObject("The Dynalist response.", {
      ...envelope,
      file_id: id,
      node_id: id,
      index: position,
    }),
  }),
  defineProviderAction("dynalist", {
    name: "get_preference",
    description: "Read a Dynalist inbox preference.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object("The request parameters.", { key: preferenceKey }, { optional: [] }),
    outputSchema: s.looseObject("The Dynalist response.", {
      ...envelope,
      key: preferenceKey,
      value: s.string("The preference value."),
    }),
  }),
  defineProviderAction("dynalist", {
    name: "set_preference",
    description: "Set the Dynalist inbox location or insertion position.",
    operationType: "write",
    requiredScopes: [],
    inputSchema: s.union(
      [
        s.object(
          "Set the inbox location.",
          {
            key: s.literal("inbox_location", { description: "The preference key." }),
            value: s.string("The inbox file ID, optionally followed by /node ID."),
          },
          { optional: [] },
        ),
        s.object(
          "Set the inbox insertion position.",
          {
            key: s.literal("inbox_move_position", { description: "The preference key." }),
            value: s.stringEnum("The insertion position.", ["top", "bottom"]),
          },
          { optional: [] },
        ),
      ],
      { description: "The request parameters." },
    ),
    outputSchema: s.looseObject("The Dynalist response.", envelope),
  }),
];
