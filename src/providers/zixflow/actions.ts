import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zixflow";

const queryBodySchema = {
  filter: s.looseObject("Filter criteria accepted by Zixflow."),
  sort: s.array("Sort criteria accepted by Zixflow.", s.looseObject("One Zixflow sort item.")),
  limit: s.positiveInteger("Maximum number of records or entries to return."),
  offset: s.nonNegativeInteger("Number of records or entries to skip before returning results."),
};

const statusProperties = {
  status: s.boolean("Whether Zixflow reports the request as successful."),
  message: s.string("The human-readable message returned by Zixflow."),
};

const collectionSchema = s.looseRequiredObject("A Zixflow collection.", {
  _id: s.string("The unique identifier of the collection."),
  name: s.string("The collection name."),
  slug: s.string("The collection slug."),
  collectionType: s.string("The collection type such as people, company, deals, or custom."),
});

const listSchema = s.looseRequiredObject("A Zixflow list.", {
  _id: s.string("The unique identifier of the list."),
  name: s.string("The list name."),
  slug: s.string("The list slug."),
  collectionId: s.string("The unique identifier of the collection backing this list."),
  duplicationAllowed: s.boolean("Whether the list allows duplicate records."),
});

const memberSchema = s.looseRequiredObject("A Zixflow workspace member.", {
  _id: s.string("The unique identifier of the workspace member."),
});

const dynamicRecordSchema = s.looseObject(
  "A dynamic Zixflow collection record with fields defined by the collection attributes.",
);

const dynamicEntrySchema = s.looseObject("A dynamic Zixflow list entry with fields defined by the list attributes.");

export const zixflowActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_collections",
    description: "List system and custom collections in the Zixflow workspace.",
    inputSchema: s.object("The input payload for listing Zixflow collections.", {}),
    outputSchema: s.object("The response returned when listing Zixflow collections.", {
      ...statusProperties,
      collections: s.array("The collections returned by Zixflow.", collectionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_collection",
    description: "Get one Zixflow collection by ID.",
    inputSchema: s.object("The input payload for getting a Zixflow collection.", {
      collectionId: s.nonEmptyString("The unique identifier of the collection."),
    }),
    outputSchema: s.object("The response returned when getting a Zixflow collection.", {
      ...statusProperties,
      collection: collectionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "query_collection_records",
    description: "Query records from a Zixflow collection using the official filter and paging body.",
    inputSchema: s.object(
      "The input payload for querying Zixflow collection records.",
      {
        collectionId: s.nonEmptyString("The unique identifier of the collection."),
        ...queryBodySchema,
      },
      { optional: ["filter", "sort"] },
    ),
    outputSchema: s.object("The response returned when querying Zixflow collection records.", {
      ...statusProperties,
      records: s.array("The collection records returned by Zixflow.", dynamicRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_collection_record",
    description: "Get one dynamic record from a Zixflow collection.",
    inputSchema: s.object("The input payload for getting a Zixflow collection record.", {
      collectionId: s.nonEmptyString("The unique identifier of the collection."),
      recordId: s.nonEmptyString("The unique identifier of the collection record."),
    }),
    outputSchema: s.object("The response returned when getting a Zixflow collection record.", {
      ...statusProperties,
      record: dynamicRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_collection_record",
    description: "Create a dynamic record in a Zixflow collection.",
    inputSchema: s.object("The input payload for a collection record mutation.", {
      collectionId: s.nonEmptyString("The unique identifier of the collection."),
      record: dynamicRecordSchema,
    }),
    outputSchema: s.object("The response returned when creating a Zixflow collection record.", {
      ...statusProperties,
      recordId: s.string("The unique identifier of the created collection record."),
      record: dynamicRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_collection_record",
    description: "Update a dynamic record in a Zixflow collection.",
    inputSchema: s.object("The input payload for updating a Zixflow collection record.", {
      collectionId: s.nonEmptyString("The unique identifier of the collection."),
      recordId: s.nonEmptyString("The unique identifier of the collection record."),
      record: dynamicRecordSchema,
    }),
    outputSchema: s.object("The status wrapper returned by Zixflow.", statusProperties),
  }),
  defineProviderAction(service, {
    name: "delete_collection_record",
    description: "Delete a dynamic record from a Zixflow collection.",
    inputSchema: s.object("The input payload for deleting a Zixflow collection record.", {
      collectionId: s.nonEmptyString("The unique identifier of the collection."),
      recordId: s.nonEmptyString("The unique identifier of the collection record."),
    }),
    outputSchema: s.object("The status wrapper returned by Zixflow.", statusProperties),
  }),
  defineProviderAction(service, {
    name: "list_lists",
    description: "List Zixflow lists in the workspace.",
    inputSchema: s.object("The input payload for listing Zixflow lists.", {}),
    outputSchema: s.object("The response returned when listing Zixflow lists.", {
      ...statusProperties,
      lists: s.array("The lists returned by Zixflow.", listSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_list",
    description: "Get one Zixflow list by ID.",
    inputSchema: s.object("The input payload for getting a Zixflow list.", {
      listId: s.nonEmptyString("The unique identifier of the list."),
    }),
    outputSchema: s.object("The response returned when getting a Zixflow list.", {
      ...statusProperties,
      list: listSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "query_list_entries",
    description: "Query entries from a Zixflow list using the official filter and paging body.",
    inputSchema: s.object(
      "The input payload for querying Zixflow list entries.",
      {
        listId: s.nonEmptyString("The unique identifier of the list."),
        ...queryBodySchema,
      },
      { optional: ["filter", "sort"] },
    ),
    outputSchema: s.object("The response returned when querying Zixflow list entries.", {
      ...statusProperties,
      entries: s.array("The list entries returned by Zixflow.", dynamicEntrySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_list_entry",
    description: "Get one dynamic entry from a Zixflow list.",
    inputSchema: s.object("The input payload for getting a Zixflow list entry.", {
      listId: s.nonEmptyString("The unique identifier of the list."),
      entryId: s.nonEmptyString("The unique identifier of the list entry."),
    }),
    outputSchema: s.object("The response returned when getting a Zixflow list entry.", {
      ...statusProperties,
      entry: dynamicEntrySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_list_entry",
    description: "Create a dynamic entry in a Zixflow list.",
    inputSchema: s.object("The input payload for a list entry mutation.", {
      listId: s.nonEmptyString("The unique identifier of the list."),
      entry: dynamicEntrySchema,
    }),
    outputSchema: s.object("The response returned when creating a Zixflow list entry.", {
      ...statusProperties,
      entryId: s.string("The unique identifier of the created list entry."),
      entry: dynamicEntrySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_list_entry",
    description: "Update a dynamic entry in a Zixflow list.",
    inputSchema: s.object("The input payload for updating a Zixflow list entry.", {
      listId: s.nonEmptyString("The unique identifier of the list."),
      entryId: s.nonEmptyString("The unique identifier of the list entry."),
      entry: dynamicEntrySchema,
    }),
    outputSchema: s.object("The status wrapper returned by Zixflow.", statusProperties),
  }),
  defineProviderAction(service, {
    name: "delete_list_entry",
    description: "Delete a dynamic entry from a Zixflow list.",
    inputSchema: s.object("The input payload for deleting a Zixflow list entry.", {
      listId: s.nonEmptyString("The unique identifier of the list."),
      entryId: s.nonEmptyString("The unique identifier of the list entry."),
    }),
    outputSchema: s.object("The status wrapper returned by Zixflow.", statusProperties),
  }),
  defineProviderAction(service, {
    name: "list_workspace_members",
    description: "List members in the Zixflow workspace.",
    inputSchema: s.object("The input payload for listing Zixflow workspace members.", {}),
    outputSchema: s.object("The response returned when listing Zixflow workspace members.", {
      ...statusProperties,
      members: s.array("The workspace members returned by Zixflow.", memberSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_workspace_member",
    description: "Get one Zixflow workspace member by ID.",
    inputSchema: s.object("The input payload for getting a Zixflow workspace member.", {
      memberId: s.nonEmptyString("The unique identifier of the workspace member."),
    }),
    outputSchema: s.object("The response returned when getting a Zixflow workspace member.", {
      ...statusProperties,
      member: memberSchema,
    }),
  }),
];
