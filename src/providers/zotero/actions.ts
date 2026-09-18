import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zotero";
function zoteroObjectKeySchema(description: string) {
  return s.string({ description, minLength: 8, maxLength: 8, pattern: "^[23456789ABCDEFGHIJKLMNPQRSTUVWXYZ]{8}$" });
}

const librarySelectorFields = {
  libraryType: s.optional(
    s.stringEnum("The Zotero library type. Omit it to use the connected user's library.", ["user", "group"]),
  ),
  libraryId: s.optional(
    s.positiveInteger(
      "The numeric Zotero user or group library ID. User libraries default to the connected user's ID.",
    ),
  ),
};

const paginationFields = {
  limit: s.optional(
    s.integer("The maximum number of objects to return, from 1 through 100.", {
      minimum: 1,
      maximum: 100,
    }),
  ),
  start: s.optional(s.nonNegativeInteger("The zero-based index of the first object to return.")),
};

const librarySchema = s.looseRequiredObject("The Zotero library metadata attached to an item or collection.", {
  type: s.stringEnum("The type of Zotero library.", ["user", "group"]),
  id: s.positiveInteger("The numeric Zotero library ID."),
  name: s.string("The display name of the Zotero library."),
});

const itemDataSchema = s.looseRequiredObject("The editable Zotero item data.", {
  key: zoteroObjectKeySchema("The Zotero item key."),
  version: s.nonNegativeInteger("The current Zotero item version."),
  itemType: s.nonEmptyString("The Zotero item type."),
});

const itemSchema = s.looseRequiredObject(
  "A Zotero item resource with stable identity fields and provider-defined metadata.",
  {
    key: zoteroObjectKeySchema("The Zotero item key."),
    version: s.nonNegativeInteger("The current Zotero item version."),
    library: s.optional(librarySchema),
    links: s.optional(s.looseObject("The links returned for the Zotero item.")),
    meta: s.optional(s.looseObject("The computed metadata returned for the Zotero item.")),
    data: itemDataSchema,
  },
  { optional: ["library", "links", "meta"] },
);

const parentCollectionSchema = s.anyOf("The parent collection key, or false for a root collection.", [
  zoteroObjectKeySchema("The key of the parent Zotero collection."),
  s.literal(false, { description: "A false value indicating a root Zotero collection." }),
]);

const collectionDataSchema = s.looseRequiredObject("The editable Zotero collection data.", {
  key: zoteroObjectKeySchema("The Zotero collection key."),
  version: s.nonNegativeInteger("The current Zotero collection version."),
  name: s.string("The collection name."),
  parentCollection: parentCollectionSchema,
});

const collectionSchema = s.looseRequiredObject(
  "A Zotero collection resource with stable identity fields and provider-defined metadata.",
  {
    key: zoteroObjectKeySchema("The Zotero collection key."),
    version: s.nonNegativeInteger("The current Zotero collection version."),
    library: s.optional(librarySchema),
    links: s.optional(s.looseObject("The links returned for the Zotero collection.")),
    meta: s.optional(s.looseObject("The computed metadata returned for the collection.")),
    data: collectionDataSchema,
  },
  { optional: ["library", "links", "meta"] },
);

const groupSchema = s.looseRequiredObject(
  "A Zotero group resource accessible to the connected user.",
  {
    id: s.positiveInteger("The numeric Zotero group ID."),
    version: s.nonNegativeInteger("The current Zotero group metadata version."),
    links: s.optional(s.looseObject("The links returned for the Zotero group.")),
    meta: s.optional(s.looseObject("The computed metadata returned for the Zotero group.")),
    data: s.looseRequiredObject("The Zotero group data.", {
      id: s.positiveInteger("The numeric Zotero group ID."),
      version: s.nonNegativeInteger("The current Zotero group metadata version."),
      name: s.string("The Zotero group name."),
    }),
  },
  { optional: ["links", "meta"] },
);

const listGroupsInputSchema = s.object("The input for listing the connected user's Zotero groups.", {
  ...paginationFields,
});

const listGroupsOutputSchema = s.object("The paginated Zotero group list.", {
  groups: s.array("The Zotero groups accessible to the connected user.", groupSchema),
  totalResults: s.nonNegativeInteger("The total number of matching Zotero groups."),
  nextStart: s.nullableInteger("The start index for the next page, or null at the end."),
});

const listCollectionsInputSchema = s.object("The input for listing Zotero collections.", {
  ...librarySelectorFields,
  ...paginationFields,
  topLevelOnly: s.optional(s.boolean("Whether to return only collections that do not have a parent collection.")),
});

const listCollectionsOutputSchema = s.object("The paginated Zotero collection list.", {
  collections: s.array("The matching Zotero collections.", collectionSchema),
  totalResults: s.nonNegativeInteger("The total number of matching Zotero collections."),
  nextStart: s.nullableInteger("The start index for the next page, or null at the end."),
  libraryVersion: s.nullableInteger("The Zotero library version returned for this page, or null when absent."),
});

const getCollectionInputSchema = s.object("The input for retrieving one Zotero collection.", {
  ...librarySelectorFields,
  collectionKey: zoteroObjectKeySchema("The key of the Zotero collection to retrieve."),
});

const getCollectionOutputSchema = s.object("The requested Zotero collection.", {
  collection: collectionSchema,
  version: s.nonNegativeInteger("The current Zotero collection version."),
});

const createCollectionInputSchema = s.object("The input for creating one Zotero collection.", {
  ...librarySelectorFields,
  name: s.nonWhitespaceString("The name of the new Zotero collection."),
  parentCollection: s.optional(parentCollectionSchema),
});

const createCollectionOutputSchema = s.object("The newly created Zotero collection.", {
  collection: collectionSchema,
  libraryVersion: s.nullableInteger("The Zotero library version assigned by the write, or null when absent."),
});

const updateCollectionInputSchema = s.object("The input for replacing one Zotero collection.", {
  ...librarySelectorFields,
  collectionKey: zoteroObjectKeySchema("The key of the Zotero collection to update."),
  version: s.nonNegativeInteger("The current collection version used for concurrency control."),
  name: s.nonWhitespaceString("The complete collection name to save."),
  parentCollection: parentCollectionSchema,
});

const updateCollectionOutputSchema = s.object("The updated Zotero collection.", {
  collection: collectionSchema,
  libraryVersion: s.nullableInteger("The Zotero collection version assigned by the write, or null when absent."),
});

const deleteCollectionInputSchema = s.object("The input for deleting one Zotero collection.", {
  ...librarySelectorFields,
  collectionKey: zoteroObjectKeySchema("The key of the Zotero collection to delete."),
  version: s.nonNegativeInteger("The current collection version used for concurrency control."),
});

const deleteCollectionOutputSchema = s.object("The acknowledgement for a deleted collection.", {
  collectionKey: zoteroObjectKeySchema("The key of the deleted Zotero collection."),
  deleted: s.boolean("Whether Zotero accepted the collection deletion."),
  libraryVersion: s.nullableInteger("The Zotero library version assigned by the deletion, or null when absent."),
});

const itemSortSchema = s.stringEnum("The Zotero item field used to sort the result list.", [
  "dateAdded",
  "dateModified",
  "title",
  "creator",
  "itemType",
  "date",
  "publisher",
  "publicationTitle",
  "journalAbbreviation",
  "language",
  "accessDate",
  "libraryCatalog",
  "callNumber",
  "rights",
  "addedBy",
]);

const listItemsInputSchema = s.object("The input for listing and searching Zotero items.", {
  ...librarySelectorFields,
  ...paginationFields,
  collectionKey: s.optional(zoteroObjectKeySchema("The collection whose items should be returned.")),
  topLevelOnly: s.optional(s.boolean("Whether to return only top-level items and omit child notes or attachments.")),
  q: s.optional(s.nonWhitespaceString("The Zotero quick-search phrase.")),
  qmode: s.optional(s.stringEnum("The Zotero quick-search mode.", ["titleCreatorYear", "everything"])),
  itemType: s.optional(s.nonWhitespaceString("The Zotero item-type search expression.")),
  tag: s.optional(s.nonWhitespaceString("The Zotero tag search expression.")),
  since: s.optional(s.nonNegativeInteger("Return only items modified after this Zotero library version.")),
  includeTrashed: s.optional(s.boolean("Whether to include matching items in the trash.")),
  sort: s.optional(itemSortSchema),
  direction: s.optional(s.stringEnum("The Zotero item sort direction.", ["asc", "desc"])),
});

const listItemsOutputSchema = s.object("The paginated Zotero item list.", {
  items: s.array("The matching Zotero items.", itemSchema),
  totalResults: s.nonNegativeInteger("The total number of matching Zotero items."),
  nextStart: s.nullableInteger("The start index for the next page, or null at the end."),
  libraryVersion: s.nullableInteger("The Zotero library version returned for this page, or null when absent."),
});

const getItemInputSchema = s.object("The input for retrieving one Zotero item.", {
  ...librarySelectorFields,
  itemKey: zoteroObjectKeySchema("The key of the Zotero item to retrieve."),
});

const getItemOutputSchema = s.object("The requested Zotero item.", {
  item: itemSchema,
  version: s.nonNegativeInteger("The current Zotero item version."),
});

const newItemDataSchema = s.looseRequiredObject(
  "The editable Zotero JSON for a new item. Fields beyond itemType depend on the item type.",
  {
    itemType: s.nonWhitespaceString("The Zotero item type to create."),
  },
);

const createItemInputSchema = s.object("The input for creating one Zotero item.", {
  ...librarySelectorFields,
  item: newItemDataSchema,
});

const createItemOutputSchema = s.object("The newly created Zotero item.", {
  item: itemSchema,
  libraryVersion: s.nullableInteger("The Zotero library version assigned by the write, or null when absent."),
});

const itemChangesSchema = {
  ...s.looseObject(
    "The editable Zotero fields to patch. Omitted properties remain unchanged; arrays replace the complete upstream list.",
  ),
  minProperties: 1,
};

const updateItemInputSchema = s.object("The input for partially updating one Zotero item.", {
  ...librarySelectorFields,
  itemKey: zoteroObjectKeySchema("The key of the Zotero item to update."),
  version: s.nonNegativeInteger("The current item version used for concurrency control."),
  changes: itemChangesSchema,
});

const updateItemOutputSchema = s.object("The acknowledgement for an updated Zotero item.", {
  itemKey: zoteroObjectKeySchema("The key of the updated Zotero item."),
  updated: s.boolean("Whether Zotero accepted the item update."),
  libraryVersion: s.nullableInteger("The Zotero item version assigned by the update, or null when absent."),
});

const deleteItemInputSchema = s.object("The input for deleting one Zotero item.", {
  ...librarySelectorFields,
  itemKey: zoteroObjectKeySchema("The key of the Zotero item to delete."),
  version: s.nonNegativeInteger("The current item version used for concurrency control."),
});

const deleteItemOutputSchema = s.object("The acknowledgement for a deleted Zotero item.", {
  itemKey: zoteroObjectKeySchema("The key of the deleted Zotero item."),
  deleted: s.boolean("Whether Zotero accepted the item deletion."),
  libraryVersion: s.nullableInteger("The Zotero library version assigned by the deletion, or null when absent."),
});

export const zoteroActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_groups",
    operationType: "read",
    description: "List Zotero groups accessible to the user connected by the current API key.",
    requiredScopes: [],
    inputSchema: listGroupsInputSchema,
    outputSchema: listGroupsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_collections",
    operationType: "read",
    description: "List collections in a Zotero user or group library.",
    requiredScopes: [],
    inputSchema: listCollectionsInputSchema,
    outputSchema: listCollectionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_collection",
    operationType: "read",
    description: "Retrieve one collection from a Zotero user or group library.",
    requiredScopes: [],
    inputSchema: getCollectionInputSchema,
    outputSchema: getCollectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_collection",
    operationType: "write",
    description: "Create one collection in a Zotero user or group library.",
    requiredScopes: [],
    inputSchema: createCollectionInputSchema,
    outputSchema: createCollectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_collection",
    operationType: "destructive",
    description: "Replace the editable fields of one Zotero collection at a known version.",
    requiredScopes: [],
    inputSchema: updateCollectionInputSchema,
    outputSchema: updateCollectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_collection",
    operationType: "destructive",
    description: "Delete one Zotero collection at a known version.",
    requiredScopes: [],
    inputSchema: deleteCollectionInputSchema,
    outputSchema: deleteCollectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_items",
    operationType: "read",
    description: "List or search items in a Zotero user or group library.",
    requiredScopes: [],
    inputSchema: listItemsInputSchema,
    outputSchema: listItemsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_item",
    operationType: "read",
    description: "Retrieve one item from a Zotero user or group library.",
    requiredScopes: [],
    inputSchema: getItemInputSchema,
    outputSchema: getItemOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_item",
    operationType: "write",
    description: "Create one bibliographic item in a Zotero user or group library.",
    requiredScopes: [],
    inputSchema: createItemInputSchema,
    outputSchema: createItemOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_item",
    operationType: "write",
    description: "Partially update one Zotero item at a known version.",
    requiredScopes: [],
    inputSchema: updateItemInputSchema,
    outputSchema: updateItemOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_item",
    operationType: "destructive",
    description: "Delete one Zotero item at a known version.",
    requiredScopes: [],
    inputSchema: deleteItemInputSchema,
    outputSchema: deleteItemOutputSchema,
  }),
];
