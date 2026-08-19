import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "outline";

const trimmedString = (description: string): JsonSchema => s.nonEmptyString(description);
const uuidString = (description: string): JsonSchema => s.uuid(description);
const dateTimeString = (description: string): JsonSchema => s.dateTime(description);

const sortDirectionSchema = s.stringEnum("The sort direction applied by Outline.", ["ASC", "DESC"]);
const documentStatusSchema = s.stringEnum("One document status filter accepted by Outline.", [
  "draft",
  "archived",
  "published",
]);
const collectionStatusSchema = s.stringEnum("One collection status filter accepted by Outline.", ["archived"]);
const documentSearchSortSchema = s.stringEnum("The sorting mode applied by Outline document search.", [
  "relevance",
  "createdAt",
  "updatedAt",
  "title",
]);
const collectionSortSchema = s.nonEmptyString("The field used to sort collection list results.");
const documentListSortSchema = s.nonEmptyString("The field used to sort document list results.");
const dateFilterSchema = s.stringEnum("The recency filter applied by Outline search.", [
  "day",
  "week",
  "month",
  "year",
]);
const permissionSchema = s.stringEnum("The collection permission returned by Outline.", ["read", "read_write"]);
const userRoleSchema = s.stringEnum("The Outline user role.", ["admin", "member", "viewer", "guest"]);
const stringBooleanOrNumberSchema = s.anyOf(
  "A data attribute value returned by Outline, which may be string, boolean, or number.",
  [
    s.string("A string data attribute value."),
    s.boolean("A boolean data attribute value."),
    s.number("A numeric data attribute value."),
  ],
);

const dataAttributeSchema = s.object(
  "One document data attribute returned by Outline.",
  {
    dataAttributeId: uuidString("The unique identifier for the associated data attribute."),
    value: stringBooleanOrNumberSchema,
    updatedAt: dateTimeString("The ISO timestamp when this data attribute value was last updated."),
  },
  { required: ["dataAttributeId", "value", "updatedAt"] },
);

const userSchema = s.object(
  "One Outline user returned inside auth or document metadata.",
  {
    id: uuidString("The unique identifier for the user."),
    name: trimmedString("The display name of the user."),
    avatarUrl: s.url("The avatar URL for the user."),
    email: s.email("The email address for the user."),
    role: userRoleSchema,
    isSuspended: s.boolean("Whether the user is suspended."),
    lastActiveAt: dateTimeString("The ISO timestamp when the user was last active."),
    createdAt: dateTimeString("The ISO timestamp when the user was created."),
  },
  { optional: ["avatarUrl", "email", "role", "isSuspended", "lastActiveAt", "createdAt"] },
);

const collectionSortMetadataSchema = s.object(
  "The collection sort metadata returned by Outline.",
  {
    field: s.string("The collection sort field."),
    direction: s.stringEnum("The collection sort direction returned by Outline.", ["asc", "desc"]),
  },
  { required: ["field", "direction"] },
);

const collectionSchema = s.object(
  "One Outline collection returned by collection endpoints.",
  {
    id: uuidString("The unique identifier for the collection."),
    urlId: trimmedString("The short collection URL identifier."),
    name: trimmedString("The collection name."),
    description: s.string("The collection description, which may contain markdown."),
    sort: collectionSortMetadataSchema,
    index: s.string("The sidebar index for the collection."),
    color: s.string("The HEX color associated with the collection."),
    icon: s.string("The icon or emoji associated with the collection."),
    permission: permissionSchema,
    sharing: s.boolean("Whether sharing is enabled for the collection."),
    createdAt: dateTimeString("The ISO timestamp when the collection was created."),
    updatedAt: dateTimeString("The ISO timestamp when the collection was last updated."),
    archivedAt: s.nullable(dateTimeString("The ISO timestamp when the collection was archived, or null when active.")),
    deletedAt: s.nullable(dateTimeString("The ISO timestamp when the collection was deleted, or null when active.")),
    raw: s.looseObject("The raw collection object returned by Outline."),
  },
  {
    optional: [
      "urlId",
      "description",
      "sort",
      "index",
      "color",
      "icon",
      "permission",
      "sharing",
      "archivedAt",
      "deletedAt",
      "raw",
    ],
  },
);

const navigationNodeSchema = s.object(
  "One node in the Outline collection document tree.",
  {
    id: uuidString("The unique identifier for the document."),
    title: trimmedString("The document title."),
    url: s.string("The document URL path returned by Outline."),
    children: s.array("The child nodes nested under this document.", s.looseObject("One child navigation node.")),
  },
  { required: ["id", "title", "url", "children"] },
);

const documentSchema = s.object(
  "One Outline document returned by document endpoints.",
  {
    id: uuidString("The unique identifier for the document."),
    collectionId: uuidString("The unique identifier for the associated collection."),
    parentDocumentId: s.nullable(
      uuidString("The unique identifier for the parent document, or null when the document is at the root level."),
    ),
    title: s.string("The document title."),
    fullWidth: s.boolean("Whether the document is displayed in full width."),
    emoji: s.nullable(s.string("The emoji associated with the document, or null when not set.")),
    text: s.string("The markdown document body returned by Outline."),
    urlId: s.string("The short document URL identifier returned by Outline."),
    pinned: s.boolean("Whether the document is pinned."),
    templateId: s.nullable(
      uuidString("The template identifier when the document was created from a template, or null when not set."),
    ),
    revision: s.number("The current document revision number."),
    createdAt: dateTimeString("The ISO timestamp when the document was created."),
    createdBy: userSchema,
    updatedAt: dateTimeString("The ISO timestamp when the document was last updated."),
    updatedBy: userSchema,
    publishedAt: s.nullable(
      dateTimeString("The ISO timestamp when the document was published, or null when it is a draft."),
    ),
    dataAttributes: s.nullable(s.array("The data attributes attached to the document.", dataAttributeSchema)),
    archivedAt: s.nullable(dateTimeString("The ISO timestamp when the document was archived, or null when active.")),
    deletedAt: s.nullable(dateTimeString("The ISO timestamp when the document was deleted, or null when active.")),
    raw: s.looseObject("The raw document object returned by Outline."),
  },
  {
    optional: [
      "collectionId",
      "parentDocumentId",
      "fullWidth",
      "emoji",
      "text",
      "urlId",
      "pinned",
      "templateId",
      "revision",
      "createdAt",
      "createdBy",
      "updatedAt",
      "updatedBy",
      "publishedAt",
      "dataAttributes",
      "archivedAt",
      "deletedAt",
      "raw",
    ],
  },
);

const paginationSchema = s.object(
  "The pagination object returned by Outline list endpoints.",
  {
    offset: s.nonNegativeInteger("The zero-based result offset."),
    limit: s.positiveInteger("The maximum number of results requested."),
  },
  { required: ["offset", "limit"] },
);

const basePaginationInputFields = {
  offset: s.nonNegativeInteger("The zero-based result offset to request."),
  limit: s.positiveInteger("The maximum number of results to request."),
} satisfies Record<string, JsonSchema>;

const sortingInputFields = {
  sort: documentListSortSchema,
  direction: sortDirectionSchema,
} satisfies Record<string, JsonSchema>;

const getDocumentInputSchema = {
  ...s.object(
    "Input parameters for retrieving one Outline document.",
    {
      id: trimmedString("The document UUID or short urlId accepted by Outline."),
      shareId: trimmedString("The share UUID used to resolve a shared document."),
    },
    { optional: ["id", "shareId"] },
  ),
  anyOf: [{ required: ["id"] }, { required: ["shareId"] }],
} satisfies JsonSchema;

export const outlineActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_collections",
    description:
      "List Outline collections the authenticated user can access, with optional search, status filtering, pagination, and sorting.",
    inputSchema: s.object(
      "Input parameters for listing Outline collections.",
      {
        ...basePaginationInputFields,
        sort: collectionSortSchema,
        direction: sortDirectionSchema,
        query: s.nonEmptyString("Optional collection name query filter."),
        statusFilter: s.array("Optional collection statuses to include in the results.", collectionStatusSchema),
      },
      { optional: ["offset", "limit", "sort", "direction", "query", "statusFilter"] },
    ),
    outputSchema: s.object(
      "The paginated Outline collection list response.",
      {
        collections: s.array("The collections returned by Outline.", collectionSchema),
        pagination: paginationSchema,
      },
      { required: ["collections", "pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_collection",
    description: "Retrieve one Outline collection by its UUID.",
    inputSchema: s.object(
      "Input parameters for retrieving one Outline collection.",
      {
        id: uuidString("The unique identifier for the collection."),
      },
      { required: ["id"] },
    ),
    outputSchema: s.object(
      "The single Outline collection response.",
      {
        collection: collectionSchema,
      },
      { required: ["collection"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_collection_documents",
    description: "Retrieve the document tree for one Outline collection by UUID.",
    inputSchema: s.object(
      "Input parameters for retrieving one Outline collection document tree.",
      {
        id: uuidString("The unique identifier for the collection."),
      },
      { required: ["id"] },
    ),
    outputSchema: s.object(
      "The Outline collection document tree response.",
      {
        tree: s.array("The document tree returned for the collection.", navigationNodeSchema),
      },
      { required: ["tree"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_documents",
    description:
      "List Outline documents visible to the authenticated user with optional collection, user, parent, status, pagination, and sorting filters.",
    inputSchema: s.object(
      "Input parameters for listing Outline documents.",
      {
        ...basePaginationInputFields,
        ...sortingInputFields,
        collectionId: uuidString("Optional collection UUID used to restrict the document list."),
        userId: uuidString("Optional user UUID used to restrict the document list."),
        backlinkDocumentId: uuidString(
          "Optional document UUID used to filter documents that backlink to the specified document.",
        ),
        parentDocumentId: uuidString("Optional parent document UUID used to list direct child documents."),
        statusFilter: s.array("Optional document statuses to include in the results.", documentStatusSchema),
      },
      {
        optional: [
          "offset",
          "limit",
          "sort",
          "direction",
          "collectionId",
          "userId",
          "backlinkDocumentId",
          "parentDocumentId",
          "statusFilter",
        ],
      },
    ),
    outputSchema: s.object(
      "The paginated Outline document list response.",
      {
        documents: s.array("The documents returned by Outline.", documentSchema),
        pagination: paginationSchema,
      },
      { required: ["documents", "pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "search_documents",
    description:
      "Search Outline documents by keyword with optional scope, recency, snippet, pagination, and sorting controls.",
    inputSchema: s.object(
      "Input parameters for searching Outline documents.",
      {
        ...basePaginationInputFields,
        query: trimmedString("The keyword query used to search documents."),
        userId: uuidString("Optional user UUID used to filter by editor."),
        collectionId: uuidString("Optional collection UUID used to restrict search scope."),
        documentId: uuidString("Optional document UUID used to search within a document subtree."),
        statusFilter: s.array("Optional document statuses to include in the search results.", documentStatusSchema),
        dateFilter: dateFilterSchema,
        shareId: trimmedString("Optional share identifier used to restrict search to a shared collection or document."),
        snippetMinWords: s.nonNegativeInteger("The minimum number of words to include in result snippets."),
        snippetMaxWords: s.nonNegativeInteger("The maximum number of words to include in result snippets."),
        sort: documentSearchSortSchema,
        direction: sortDirectionSchema,
      },
      {
        optional: [
          "offset",
          "limit",
          "userId",
          "collectionId",
          "documentId",
          "statusFilter",
          "dateFilter",
          "shareId",
          "snippetMinWords",
          "snippetMaxWords",
          "sort",
          "direction",
        ],
      },
    ),
    outputSchema: s.object(
      "The paginated Outline document search response.",
      {
        documents: s.array("The matching documents returned by Outline search.", documentSchema),
        pagination: paginationSchema,
      },
      { required: ["documents", "pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_document",
    description:
      "Retrieve one Outline document by UUID or urlId, or by shareId when reading through a share link context.",
    inputSchema: getDocumentInputSchema,
    outputSchema: s.object(
      "The single Outline document response.",
      {
        document: documentSchema,
      },
      { required: ["document"] },
    ),
  }),
];
