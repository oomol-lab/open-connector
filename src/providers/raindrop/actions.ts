import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "raindrop";

const idSchema = (description: string) => s.integer(description);
const resultSchema = s.boolean("Whether Raindrop.io completed the request successfully.");
const looseItemSchema = (description: string) => s.looseObject(description, {});
const itemOutputSchema = s.object("A Raindrop.io response containing one item.", {
  result: resultSchema,
  item: looseItemSchema("The item returned by Raindrop.io."),
});

const collectionFields = {
  title: s.string("The collection title."),
  view: s.stringEnum("The collection view style.", ["list", "simple", "grid", "masonry"]),
  sort: s.integer("The descending sort position among sibling collections."),
  public: s.boolean("Whether the collection and its bookmarks are publicly accessible."),
  parentId: idSchema("The parent collection ID. Omit it for a root collection."),
  cover: s.array("The collection cover URLs.", s.string("A collection cover URL.", { format: "uri" })),
};

const raindropFields = {
  link: s.string("The bookmark URL.", { format: "uri" }),
  title: s.string("The bookmark title, up to 1000 characters.", { maxLength: 1000 }),
  excerpt: s.string("The bookmark description, up to 10000 characters.", { maxLength: 10000 }),
  note: s.string("The bookmark note, up to 10000 characters.", { maxLength: 10000 }),
  collectionId: idSchema("The collection ID that contains the bookmark."),
  tags: s.array("The bookmark tags.", s.string("A tag name.")),
  important: s.boolean("Whether the bookmark is marked as a favorite."),
  cover: s.string("The bookmark cover URL.", { format: "uri" }),
  type: s.stringEnum("The bookmark content type.", ["link", "article", "image", "video", "document", "audio"]),
};

export const raindropActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Get the authenticated Raindrop.io user profile.",
    requiredScopes: [],
    inputSchema: s.object("The input for getting the authenticated user.", {}),
    outputSchema: s.object("The authenticated user response.", {
      result: resultSchema,
      user: looseItemSchema("The authenticated Raindrop.io user."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_collections",
    operationType: "read",
    description: "List root collections and optionally include nested child collections.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for listing collections.",
      { includeChildren: s.boolean("Whether to include nested child collections.") },
      { optional: ["includeChildren"] },
    ),
    outputSchema: s.object("The collection list response.", {
      result: resultSchema,
      items: s.array("The collections returned by Raindrop.io.", looseItemSchema("A collection.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_collection",
    operationType: "read",
    description: "Get one Raindrop.io collection by ID.",
    requiredScopes: [],
    inputSchema: s.object("The input for getting a collection.", {
      collectionId: idSchema("The collection ID."),
    }),
    outputSchema: itemOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_collection",
    operationType: "write",
    description: "Create a Raindrop.io bookmark collection.",
    requiredScopes: [],
    inputSchema: s.object("The input for creating a collection.", collectionFields, {
      optional: ["view", "sort", "public", "parentId", "cover"],
    }),
    outputSchema: itemOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_collection",
    operationType: "write",
    description: "Update an existing Raindrop.io collection.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for updating a collection.",
      {
        collectionId: idSchema("The collection ID."),
        ...collectionFields,
        expanded: s.boolean("Whether nested collections are expanded in the sidebar."),
      },
      { optional: ["title", "view", "sort", "public", "parentId", "cover", "expanded"] },
    ),
    outputSchema: itemOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_collection",
    operationType: "destructive",
    description: "Delete a collection and move its bookmarks to Trash.",
    requiredScopes: [],
    inputSchema: s.object("The input for deleting a collection.", {
      collectionId: idSchema("The collection ID to delete."),
    }),
    outputSchema: s.object("The collection deletion response.", { result: resultSchema }),
  }),
  defineProviderAction(service, {
    name: "list_raindrops",
    operationType: "read",
    description: "List or search bookmarks in a collection or across all collections.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for listing bookmarks.",
      {
        collectionId: idSchema("The collection ID, or 0 for all bookmarks except Trash."),
        search: s.string("A Raindrop.io search expression."),
        sort: s.stringEnum("The bookmark sort order.", [
          "-created",
          "created",
          "score",
          "-sort",
          "title",
          "-title",
          "domain",
          "-domain",
        ]),
        page: s.integer("The zero-based result page.", { minimum: 0 }),
        perPage: s.integer("The number of bookmarks per page, up to 50.", {
          minimum: 1,
          maximum: 50,
        }),
        nested: s.boolean("Whether to include bookmarks from nested collections."),
      },
      { optional: ["collectionId", "search", "sort", "page", "perPage", "nested"] },
    ),
    outputSchema: s.object("The bookmark list response.", {
      result: resultSchema,
      items: s.array("The bookmarks returned by Raindrop.io.", looseItemSchema("A bookmark.")),
      count: s.integer("The total number of matching bookmarks."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_raindrop",
    operationType: "read",
    description: "Get one Raindrop.io bookmark by ID.",
    requiredScopes: [],
    inputSchema: s.object("The input for getting a bookmark.", {
      raindropId: idSchema("The bookmark ID."),
    }),
    outputSchema: itemOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_raindrop",
    operationType: "write",
    description: "Create a bookmark from a URL in Raindrop.io.",
    requiredScopes: [],
    inputSchema: s.object("The input for creating a bookmark.", raindropFields, {
      optional: ["title", "excerpt", "note", "collectionId", "tags", "important", "cover", "type"],
    }),
    outputSchema: itemOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_raindrop",
    operationType: "write",
    description: "Update an existing Raindrop.io bookmark.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for updating a bookmark.",
      { raindropId: idSchema("The bookmark ID."), ...raindropFields },
      {
        optional: ["link", "title", "excerpt", "note", "collectionId", "tags", "important", "cover", "type"],
      },
    ),
    outputSchema: itemOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_raindrop",
    operationType: "destructive",
    description: "Move a bookmark to Trash, or permanently delete it when already in Trash.",
    requiredScopes: [],
    inputSchema: s.object("The input for deleting a bookmark.", {
      raindropId: idSchema("The bookmark ID to delete."),
    }),
    outputSchema: s.object("The bookmark deletion response.", { result: resultSchema }),
  }),
  defineProviderAction(service, {
    name: "list_tags",
    operationType: "read",
    description: "List tags across all bookmarks or within one collection.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for listing tags.",
      { collectionId: idSchema("The optional collection ID used to restrict the tag list.") },
      { optional: ["collectionId"] },
    ),
    outputSchema: s.object("The tag list response.", {
      result: resultSchema,
      items: s.array("The tags returned by Raindrop.io.", looseItemSchema("A tag and its bookmark count.")),
    }),
  }),
];
