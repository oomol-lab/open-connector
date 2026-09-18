import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  cursorFieldFor,
  includeContentField,
  karakeepIdField,
  limitField,
  listSchema,
  paginatedBookmarksSchema,
  sortOrderField,
  successResultSchema,
} from "./schemas.ts";

const service = "karakeep";
const listReadScopes = ["lists:read"] as const;
const listWriteScopes = ["lists:readwrite"] as const;
const bookmarkReadScopes = ["bookmarks:read"] as const;

const listIdField = karakeepIdField("The id of the list.");

const bookmarkIdField = karakeepIdField("The id of the bookmark.");

const listNameField = s.string("The list name, between 1 and 100 characters.", {
  minLength: 1,
  maxLength: 100,
});

const listIconField = s.nonEmptyString(
  "The emoji shown as the list icon in the Karakeep UI, for example a single book or star emoji.",
);

const listQueryField = s.nonEmptyString(
  "The Karakeep search query that populates a smart list, for example is:fav or #reading. Only qualified search terms are accepted.",
);

export const karakeepListActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_lists",
    operationType: "read",
    description:
      "Retrieve all bookmark lists for the authenticated Karakeep user, including both manual and smart lists. This endpoint is not paginated and returns every list in one response.",
    requiredScopes: listReadScopes,
    inputSchema: s.object("Input for listing every Karakeep list.", {}),
    outputSchema: s.looseRequiredObject("Every Karakeep list owned by or shared with the user.", {
      lists: s.array("The lists returned by Karakeep.", listSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_list",
    operationType: "write",
    description:
      "Create a new bookmark list. Manual lists receive bookmarks that are added explicitly, while smart lists are populated automatically by a saved search query.",
    requiredScopes: listWriteScopes,
    inputSchema: s.object(
      "Input for creating a Karakeep list.",
      {
        name: listNameField,
        description: s.string("An optional list description, at most 500 characters.", {
          maxLength: 500,
        }),
        icon: listIconField,
        type: s.withDefault(
          s.stringEnum("Whether the list is curated manually or populated automatically by a saved query.", [
            "manual",
            "smart",
          ]),
          "manual",
        ),
        query: s.describe(
          listQueryField,
          "The Karakeep search query that populates the list. Required when type is smart and rejected when type is manual.",
        ),
        parentId: s.nullableString("The id of the parent list, or null to create a top level list."),
      },
      { optional: ["description", "type", "query", "parentId"] },
    ),
    outputSchema: listSchema,
  }),
  defineProviderAction(service, {
    name: "get_list",
    operationType: "read",
    description: "Retrieve a single Karakeep list by its id.",
    requiredScopes: listReadScopes,
    inputSchema: s.requiredObject("Input for retrieving one Karakeep list.", {
      listId: listIdField,
    }),
    outputSchema: listSchema,
  }),
  defineProviderAction(service, {
    name: "update_list",
    operationType: "write",
    description:
      "Partially update a Karakeep list. Only the fields present in the input are changed, and sending null for description or parentId clears the stored value.",
    requiredScopes: listWriteScopes,
    inputSchema: s.object(
      "Input for updating a Karakeep list.",
      {
        listId: listIdField,
        name: listNameField,
        description: s.nullable(
          s.string("A new list description of at most 500 characters, or null to clear it.", {
            maxLength: 500,
          }),
        ),
        icon: listIconField,
        parentId: s.nullableString("The id of the new parent list, or null to move the list to the top level."),
        query: listQueryField,
        public: s.boolean("Whether the list is publicly shared through a public link."),
      },
      { optional: ["name", "description", "icon", "parentId", "query", "public"] },
    ),
    outputSchema: listSchema,
  }),
  defineProviderAction(service, {
    name: "delete_list",
    operationType: "destructive",
    description: "Delete a Karakeep list. Only the list itself is removed; the bookmarks it contained are kept.",
    requiredScopes: listWriteScopes,
    inputSchema: s.requiredObject("Input for deleting a Karakeep list.", {
      listId: listIdField,
    }),
    outputSchema: successResultSchema(
      "The result of deleting a Karakeep list.",
      "Whether Karakeep accepted the delete request.",
      { listId: "The id of the deleted list." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_list_bookmarks",
    operationType: "read",
    description:
      "Retrieve one page of the bookmarks inside a Karakeep list. For smart lists the bookmarks are computed from the saved query of the list.",
    requiredScopes: bookmarkReadScopes,
    inputSchema: s.object(
      "Input for listing the bookmarks of a Karakeep list.",
      {
        listId: listIdField,
        sortOrder: sortOrderField,
        limit: limitField,
        cursor: cursorFieldFor("get_list_bookmarks"),
        includeContent: includeContentField,
      },
      { optional: ["sortOrder", "limit", "cursor", "includeContent"] },
    ),
    outputSchema: paginatedBookmarksSchema,
  }),
  defineProviderAction(service, {
    name: "add_bookmark_to_list",
    operationType: "write",
    description:
      "Add a bookmark to a manual Karakeep list. The operation is idempotent, so adding a bookmark that is already in the list succeeds and changes nothing.",
    requiredScopes: listWriteScopes,
    inputSchema: s.requiredObject("Input for adding a bookmark to a Karakeep list.", {
      listId: listIdField,
      bookmarkId: bookmarkIdField,
    }),
    outputSchema: successResultSchema(
      "The result of adding a bookmark to a Karakeep list.",
      "Whether the bookmark is now a member of the list.",
      {
        listId: "The id of the list the bookmark was added to.",
        bookmarkId: "The id of the bookmark that was added.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "remove_bookmark_from_list",
    operationType: "destructive",
    description:
      "Remove a bookmark from a manual Karakeep list. The bookmark itself is kept. Karakeep rejects the request when the bookmark is not a member of the list.",
    requiredScopes: listWriteScopes,
    inputSchema: s.requiredObject("Input for removing a bookmark from a Karakeep list.", {
      listId: listIdField,
      bookmarkId: bookmarkIdField,
    }),
    outputSchema: successResultSchema(
      "The result of removing a bookmark from a Karakeep list.",
      "Whether Karakeep accepted the removal request.",
      {
        listId: "The id of the list the bookmark was removed from.",
        bookmarkId: "The id of the bookmark that was removed.",
      },
    ),
  }),
];
