import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const repo = s.anyOf("Repository ID or owner/repository namespace, such as team/handbook.", [
  s.integer("Repository ID."),
  s.nonEmptyString("Repository namespace containing the owner login and repository slug."),
]);

const id = s.nonEmptyString("Document ID or slug.");
const login = s.nonEmptyString("User or group login or ID.");
const offset = s.integer("Result offset.");
const limit = s.integer("Page size, up to 100.", { maximum: 100 });
const visibility = {
  ...s.integer("Visibility: 0 private, 1 public, 2 within the enterprise."),
  enum: [0, 1, 2],
};

const format = s.stringEnum("Body format. Omitted values use the upstream default (Markdown).", [
  "markdown",
  "html",
  "lake",
]);

const docFields = {
  slug: s.string("Document slug."),
  title: s.string("Document title."),
  public: visibility,
  format,
  body: s.string("Document body in the selected format."),
};

const repoFields = {
  name: s.string("Repository name."),
  slug: s.string("Repository slug."),
  description: s.string("Repository description."),
  public: visibility,
};

const ownerFields = {
  owner: login,
  ownerType: s.stringEnum("Whether the repository owner is a user or a group.", ["users", "groups"]),
};

const recordProperties = {
  id: s.integer("Resource ID."),
  name: s.string("Resource name."),
  title: s.string("Resource title."),
  slug: s.string("Resource slug."),
  login: s.string("Account login."),
};

const record = s.looseObject("Yuque resource with upstream fields.", recordProperties);
const doc = s.looseObject("Yuque document with upstream fields.", {
  ...recordProperties,
  book_id: s.integer("Repository ID."),
  format: s.string("Returned body format."),
  body: s.string("Original document body."),
  body_draft: s.string("Draft document body."),
  body_html: s.string("Document body as HTML."),
  body_lake: s.string("Document body in Lake format."),
  body_sheet: s.string("Sheet content encoded as a JSON string."),
  body_table: s.string("Table content and pagination encoded as a JSON string."),
  latest_version_id: s.integer("Latest published version ID."),
});

const book = s.looseObject("Yuque repository with upstream fields.", {
  ...recordProperties,
  namespace: s.string("Full owner/repository namespace."),
  public: visibility,
  toc_yml: s.string("Repository table of contents."),
});

const version = s.looseObject("Yuque document version with upstream fields.", {
  ...recordProperties,
  doc_id: s.integer("Document ID."),
  body: s.string("Original version body."),
  body_html: s.string("Version body as HTML."),
  body_md: s.string("Version body as Markdown."),
  body_asl: s.string("Version body in Lake format."),
  diff: s.string("Version diff."),
});

const tocNode = s.looseObject("Yuque table of contents node with upstream fields.", {
  uuid: s.string("Node UUID."),
  type: s.string("Node type: DOC, LINK or TITLE."),
  title: s.string("Node title."),
  url: s.string("Node URL."),
  doc_id: s.integer("Linked document ID."),
  parent_uuid: s.string("Parent node UUID."),
  child_uuid: s.string("First child node UUID."),
  sibling_uuid: s.string("Next sibling node UUID."),
  prev_uuid: s.string("Previous sibling node UUID."),
});

const meta = s.looseObject("Pagination metadata returned by Yuque.", {
  total: s.integer("Total result count."),
  pageNo: s.integer("Current page number."),
  pageSize: s.integer("Page size."),
});

const tocInput = s.actionInput(
  {
    repo,
    action: s.stringEnum(
      "Append, prepend, edit or remove a node. Supplying node_uuid to append/prepend moves an existing node. Removal does not delete linked documents.",
      ["appendNode", "prependNode", "editNode", "removeNode"],
    ),
    action_mode: s.stringEnum(
      "Position relative to the target. For removal, sibling removes only the node; child also removes its descendants.",
      ["sibling", "child"],
    ),
    target_uuid: s.nonEmptyString(
      "Target node UUID. Omit to target the root when creating a node; required when moving a node.",
    ),
    node_uuid: s.nonEmptyString("Existing node UUID to move, edit or remove."),
    type: s.stringEnum("Node type to create or set.", ["DOC", "LINK", "TITLE"]),
    doc_ids: s.array("Document IDs to add to the table of contents.", s.integer("Document ID."), {
      minItems: 1,
    }),
    title: s.string("Node title; required when creating a group or link."),
    url: s.string("Link destination; required when creating a link."),
    open_window: {
      ...s.integer("Open links in the current window (0) or a new window (1)."),
      enum: [0, 1],
    },
    visible: { ...s.integer("Node visibility: 0 hidden, 1 visible."), enum: [0, 1] },
  },
  ["repo", "action", "action_mode"],
);
// The endpoint documentation defines conditional required fields beyond the specification.
tocInput.allOf = [
  {
    if: { properties: { action: { enum: ["editNode", "removeNode"] } } },
    then: { required: ["node_uuid"] },
  },
  {
    if: {
      properties: { action: { enum: ["appendNode", "prependNode"] } },
      required: ["node_uuid"],
    },
    then: { required: ["target_uuid"] },
  },
  {
    if: {
      properties: { action: { enum: ["appendNode", "prependNode"] } },
      not: { required: ["node_uuid"] },
    },
    then: {
      required: ["type"],
      allOf: [
        {
          not: {
            properties: { action: { const: "prependNode" }, action_mode: { const: "sibling" } },
          },
        },
        { if: { properties: { type: { const: "DOC" } } }, then: { required: ["doc_ids"] } },
        { if: { properties: { type: { const: "TITLE" } } }, then: { required: ["title"] } },
        {
          if: { properties: { type: { const: "LINK" } } },
          then: { required: ["title", "url", "open_window"] },
        },
      ],
    },
  },
];

export const yuqueActions: ActionDefinition[] = [
  defineProviderAction("yuque", {
    name: "get_current_user",
    description: "Get the user associated with the Yuque token.",
    operationType: "read",
    inputSchema: s.actionInput({}),
    outputSchema: s.looseObject(
      "Yuque API response; additional upstream fields are preserved.",
      { data: record, meta },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("yuque", {
    name: "list_user_groups",
    description: "List a user's Yuque groups with optional role and offset filters.",
    operationType: "read",
    inputSchema: s.actionInput(
      {
        user: login,
        role: { ...s.integer("Membership role: 0 administrator, 1 member."), enum: [0, 1] },
        offset,
      },
      ["user"],
    ),
    outputSchema: s.looseObject(
      "Yuque API response; additional upstream fields are preserved.",
      {
        data: s.anyOf(
          "User groups. The official specification describes an object; array responses are also preserved.",
          [record, s.array("User groups.", record)],
        ),
        meta,
      },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("yuque", {
    name: "list_group_members",
    description: "List members of a Yuque group.",
    operationType: "read",
    inputSchema: s.actionInput(
      {
        group: login,
        role: {
          ...s.integer("Membership role: 0 administrator, 1 member, 2 read-only member."),
          enum: [0, 1, 2],
        },
        offset,
      },
      ["group"],
    ),
    outputSchema: s.looseObject(
      "Yuque API response; additional upstream fields are preserved.",
      { data: s.array("Group members.", record), meta },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("yuque", {
    name: "search",
    description: "Search Yuque documents or repositories. Each page contains up to 20 results.",
    operationType: "read",
    inputSchema: s.actionInput(
      {
        q: s.string("Search keywords.", { maxLength: 200 }),
        type: s.stringEnum("Search documents or repositories.", ["doc", "repo"]),
        scope: s.string("Group login or owner/repository namespace. Omit to search the current user/group.", {
          maxLength: 400,
        }),
        page: s.integer("Page number, from 1 to 100.", { minimum: 1, maximum: 100 }),
        creator: s.string("Filter by the author's login."),
        creatorId: s.integer("Filter by author ID (deprecated upstream; use creator when the login is known)."),
      },
      ["q", "type"],
    ),
    outputSchema: s.looseObject(
      "Yuque API response; additional upstream fields are preserved.",
      {
        data: s.array(
          "Search results.",
          s.looseObject("Search result with upstream fields.", {
            id: s.integer("Resource ID."),
            type: s.string("Result type: doc or repo."),
            title: s.string("Title with matched text marked by em tags."),
            summary: s.string("Summary with matched text marked by em tags."),
            url: s.string("Resource URL."),
            target: record,
          }),
        ),
        meta,
      },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("yuque", {
    name: "list_repositories",
    description: "List repositories owned by a Yuque user or group.",
    operationType: "read",
    inputSchema: s.actionInput(
      {
        ...ownerFields,
        offset,
        limit,
        type: s.stringEnum("Repository type filter: Book for documents, Design for boards.", ["Book", "Design"]),
        filterByAbility: s.string("Set create_doc to return only repositories where documents can be created."),
      },
      ["owner", "ownerType"],
    ),
    outputSchema: s.looseObject(
      "Yuque API response; additional upstream fields are preserved.",
      { data: s.array("Repositories.", book), meta },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("yuque", {
    name: "create_repository",
    description: "Create a Yuque repository for a user or group.",
    operationType: "write",
    inputSchema: s.actionInput(
      {
        ...ownerFields,
        ...repoFields,
        enhancedPrivacy: s.boolean("Deny access to group members other than group administrators."),
      },
      ["owner", "ownerType", "name", "slug"],
    ),
    outputSchema: s.looseObject(
      "Yuque API response; additional upstream fields are preserved.",
      { data: book, meta },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("yuque", {
    name: "get_repository",
    description: "Read a Yuque repository by ID or owner/repository namespace.",
    operationType: "read",
    inputSchema: s.actionInput({ repo }, ["repo"]),
    outputSchema: s.looseObject(
      "Yuque API response; additional upstream fields are preserved.",
      { data: book, meta },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("yuque", {
    name: "update_repository",
    description: "Update a Yuque repository, optionally replacing its Markdown table of contents.",
    operationType: "write",
    inputSchema: s.actionInput(
      {
        repo,
        ...repoFields,
        toc: s.string("Markdown table of contents, using nested list links such as - [Title](document-slug)."),
      },
      ["repo"],
    ),
    outputSchema: s.looseObject(
      "Yuque API response; additional upstream fields are preserved.",
      { data: book, meta },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("yuque", {
    name: "delete_repository",
    description: "Delete a Yuque repository.",
    operationType: "destructive",
    inputSchema: s.actionInput({ repo }, ["repo"]),
    outputSchema: s.looseObject(
      "Yuque API response; additional upstream fields are preserved.",
      { data: book, meta },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("yuque", {
    name: "list_documents",
    description: "List documents in a Yuque repository, including optional deleted-document and changed-since filters.",
    operationType: "read",
    inputSchema: s.actionInput(
      {
        repo,
        offset,
        limit,
        deleted: s.boolean("Whether to list deleted documents."),
        changed_at_gte: s.string("Lower bound for modification time, in ISO 8601 format.", {
          format: "date-time",
        }),
        optional_properties: s.string("Comma-separated extra fields: hits, tags, latest_version_id."),
      },
      ["repo"],
    ),
    outputSchema: s.looseObject(
      "Yuque API response; additional upstream fields are preserved.",
      { data: s.array("Documents.", doc), meta },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("yuque", {
    name: "create_document",
    description: "Create a Yuque document. Omitted visibility inherits the repository setting.",
    operationType: "write",
    inputSchema: s.actionInput({ repo, ...docFields }, ["repo", "body"]),
    outputSchema: s.looseObject(
      "Yuque API response; additional upstream fields are preserved.",
      { data: doc, meta },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("yuque", {
    name: "get_document",
    description:
      "Read a Yuque document. Omit repo to use the direct document route; page and page_size paginate Table content.",
    operationType: "read",
    inputSchema: s.actionInput(
      {
        repo,
        id,
        page_size: s.integer("Table page size, from 1 to 200.", { minimum: 1, maximum: 200 }),
        page: s.integer("Table page number, starting at 1.", { minimum: 1 }),
      },
      ["id"],
    ),
    outputSchema: s.looseObject(
      "Yuque API response; additional upstream fields are preserved.",
      { data: doc, meta },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("yuque", {
    name: "update_document",
    description: "Update a Yuque document's title, slug, visibility or body. Only supplied fields are sent.",
    operationType: "write",
    inputSchema: s.actionInput({ repo, id, ...docFields }, ["repo", "id"]),
    outputSchema: s.looseObject(
      "Yuque API response; additional upstream fields are preserved.",
      { data: doc, meta },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("yuque", {
    name: "delete_document",
    description: "Delete a document from a Yuque repository.",
    operationType: "destructive",
    inputSchema: s.actionInput({ repo, id }, ["repo", "id"]),
    outputSchema: s.looseObject(
      "Yuque API response; additional upstream fields are preserved.",
      { data: doc, meta },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("yuque", {
    name: "list_document_versions",
    description: "List the published history of a Yuque document.",
    operationType: "read",
    inputSchema: s.actionInput({ doc_id: s.integer("Document ID.") }, ["doc_id"]),
    outputSchema: s.looseObject(
      "Yuque API response; additional upstream fields are preserved.",
      { data: s.array("Document versions.", version), meta },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("yuque", {
    name: "get_document_version",
    description: "Read a historical Yuque document version and its body.",
    operationType: "read",
    inputSchema: s.actionInput({ id: s.integer("Version ID.") }, ["id"]),
    outputSchema: s.looseObject(
      "Yuque API response; additional upstream fields are preserved.",
      { data: version, meta },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("yuque", {
    name: "get_table_of_contents",
    description: "Read the nodes and relationships in a Yuque repository's table of contents.",
    operationType: "read",
    inputSchema: s.actionInput({ repo }, ["repo"]),
    outputSchema: s.looseObject(
      "Yuque API response; additional upstream fields are preserved.",
      { data: s.array("Table of contents nodes.", tocNode), meta },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("yuque", {
    name: "update_table_of_contents",
    description:
      "Create, move, edit or remove Yuque table of contents nodes. Removing a node does not delete its linked document.",
    operationType: "destructive",
    inputSchema: tocInput,
    outputSchema: s.looseObject(
      "Yuque API response; additional upstream fields are preserved.",
      { data: s.array("Table of contents nodes.", tocNode), meta },
      { required: ["data"] },
    ),
  }),
];
